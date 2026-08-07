import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LastAdminPolicy,
  LastAdminPolicyError,
} from '../src/auth/application/last-admin-policy.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe.sequential('last ADMIN policy', () => {
  let client: DatabaseClient;
  let releaseSuiteLock: (() => void) | undefined;
  let suiteLockTask: Promise<unknown> | undefined;
  const policy = new LastAdminPolicy();

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl);
    const ready = createDeferred();
    const release = createDeferred();
    releaseSuiteLock = release.resolve;
    suiteLockTask = client.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(3200203)`;
        ready.resolve();
        await release.promise;
      },
      { maxWait: 120_000, timeout: 120_000 },
    );
    await Promise.race([ready.promise, suiteLockTask]);
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    await runBootstrap(client);
  });

  afterAll(async () => {
    await client.userInvitation.deleteMany();
    await client.user.updateMany({
      where: { displayName: 'Dylan' },
      data: {
        activatedAt: null,
        loginIdentifier: 'dylan',
        status: 'PENDING_ACTIVATION',
      },
    });
    releaseSuiteLock?.();
    await suiteLockTask;
    await client.$disconnect();
  });

  it('blocks removal, disabling, credential revocation and the last usable invitation', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });

    await expect(
      client.$transaction(
        (transaction) =>
          policy.assertCanRemoveAdminAssignment(transaction, dylan.id),
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toBeInstanceOf(LastAdminPolicyError);

    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    await expect(
      client.$transaction(
        (transaction) => policy.assertCanDisableUser(transaction, dylan.id),
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toBeInstanceOf(LastAdminPolicyError);
    await client.user.update({
      where: { id: dylan.id },
      data: { status: 'DISABLED' },
    });
    await expect(
      client.$transaction(
        (transaction) => policy.assertCanDisableUser(transaction, dylan.id),
        { isolationLevel: 'Serializable' },
      ),
    ).resolves.toBeUndefined();
    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    await expect(
      client.$transaction(
        (transaction) =>
          policy.assertCanAdministrativelyRevokeCredential(
            transaction,
            dylan.id,
          ),
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toBeInstanceOf(LastAdminPolicyError);

    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    const invitationCreatedAt = new Date();
    const invitation = await client.userInvitation.create({
      data: {
        createdAt: invitationCreatedAt,
        userId: dylan.id,
        tokenHash: 'f'.repeat(64),
        expiresAt: new Date(
          invitationCreatedAt.getTime() + 24 * 60 * 60 * 1000,
        ),
      },
    });
    await expect(
      client.$transaction(
        (transaction) =>
          policy.assertCanInvalidateInvitation(transaction, invitation.id),
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toBeInstanceOf(LastAdminPolicyError);

    expect(policy.allowsLogout()).toBe(true);
    expect(policy.allowsSessionRevocation()).toBe(true);
    expect(policy.allowsNormalPasswordChange()).toBe(true);
    await client.userInvitation.delete({ where: { id: invitation.id } });
  });

  it('does not depend on the ADMIN name or login identifier', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    await client.user.update({
      where: { id: dylan.id },
      data: {
        displayName: 'Renamed administrator',
        loginIdentifier: 'renamed-admin-test',
      },
    });

    await expect(
      client.$transaction(
        (transaction) =>
          policy.assertCanRemoveAdminAssignment(transaction, dylan.id),
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toBeInstanceOf(LastAdminPolicyError);

    await client.user.update({
      where: { id: dylan.id },
      data: { displayName: 'Dylan', loginIdentifier: 'dylan' },
    });
  });

  it('serializes concurrent removals so they never leave zero ADMIN assignments', async () => {
    const [adminRole, dylan, samantha] = await Promise.all([
      client.role.findUniqueOrThrow({ where: { code: 'ADMIN' } }),
      client.user.findUniqueOrThrow({ where: { loginIdentifier: 'dylan' } }),
      client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'samantha' },
      }),
    ]);
    const secondAssignment = await client.userRole.create({
      data: { roleId: adminRole.id, userId: samantha.id },
    });
    const firstClient = createDatabaseClient(databaseUrl);
    const secondClient = createDatabaseClient(databaseUrl);
    const revokedAt = new Date();

    const remove = (operationClient: DatabaseClient, userId: string) =>
      operationClient.$transaction(
        async (transaction) => {
          await policy.assertCanRemoveAdminAssignment(transaction, userId);
          await transaction.userRole.updateMany({
            where: { roleId: adminRole.id, userId, revokedAt: null },
            data: { revokedAt },
          });
        },
        { isolationLevel: 'Serializable' },
      );

    try {
      const results = await Promise.allSettled([
        remove(firstClient, dylan.id),
        remove(secondClient, samantha.id),
      ]);
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      expect(
        await client.userRole.count({
          where: { roleId: adminRole.id, revokedAt: null },
        }),
      ).toBe(1);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
      await client.userRole.updateMany({
        where: { roleId: adminRole.id, userId: dylan.id },
        data: { revokedAt: null },
      });
      await client.userRole.deleteMany({ where: { id: secondAssignment.id } });
    }
  });

  it('serializes concurrent disabling so one enabled ADMIN always remains', async () => {
    const [adminRole, dylan, samantha] = await Promise.all([
      client.role.findUniqueOrThrow({ where: { code: 'ADMIN' } }),
      client.user.findUniqueOrThrow({ where: { loginIdentifier: 'dylan' } }),
      client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'samantha' },
      }),
    ]);
    const secondAssignment = await client.userRole.create({
      data: { roleId: adminRole.id, userId: samantha.id },
    });
    await client.user.updateMany({
      where: { id: { in: [dylan.id, samantha.id] } },
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    const firstClient = createDatabaseClient(databaseUrl);
    const secondClient = createDatabaseClient(databaseUrl);

    const disable = (operationClient: DatabaseClient, userId: string) =>
      operationClient.$transaction(
        async (transaction) => {
          await policy.assertCanDisableUser(transaction, userId);
          await transaction.user.update({
            where: { id: userId },
            data: { status: 'DISABLED' },
          });
        },
        { isolationLevel: 'Serializable' },
      );

    try {
      const results = await Promise.allSettled([
        disable(firstClient, dylan.id),
        disable(secondClient, samantha.id),
      ]);
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      expect(
        await client.user.count({
          where: {
            status: { not: 'DISABLED' },
            userRoles: {
              some: { roleId: adminRole.id, revokedAt: null },
            },
          },
        }),
      ).toBe(1);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
      await client.user.updateMany({
        where: { id: { in: [dylan.id, samantha.id] } },
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      });
      await client.userRole.deleteMany({ where: { id: secondAssignment.id } });
    }
  });

  it('does not grant implicit business or future permissions to ADMIN', async () => {
    const adminRole = await client.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const isolatedUser = await client.user.create({
      data: {
        displayName: 'Isolated ADMIN test fixture',
        loginIdentifier: 'isolated-admin-test',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
    const assignment = await client.userRole.create({
      data: { roleId: adminRole.id, userId: isolatedUser.id },
    });
    const futurePermission = await client.permission.create({
      data: {
        code: 'future.permission.test',
        description: 'Unassigned integration-test permission.',
      },
    });

    try {
      const [rolePermissions, directPermissions] = await Promise.all([
        client.rolePermission.findMany({
          where: {
            revokedAt: null,
            role: {
              userRoles: {
                some: { userId: isolatedUser.id, revokedAt: null },
              },
            },
          },
          select: { permission: { select: { code: true } } },
        }),
        client.userPermission.findMany({
          where: { userId: isolatedUser.id, revokedAt: null },
          select: { permission: { select: { code: true } } },
        }),
      ]);
      const effectivePermissions = new Set([
        ...rolePermissions.map(({ permission }) => permission.code),
        ...directPermissions.map(({ permission }) => permission.code),
      ]);

      expect([...effectivePermissions].sort()).toEqual(
        [
          'users.credentials.revoke',
          'users.invitations.create',
          'users.sessions.revoke',
          'users.status.manage',
        ].sort(),
      );
      expect(effectivePermissions.has('finances.read')).toBe(false);
      expect(effectivePermissions.has('inventory.adjust')).toBe(false);
      expect(effectivePermissions.has('sales.create')).toBe(false);
      expect(effectivePermissions.has('transfers.create')).toBe(false);
      expect(effectivePermissions.has(futurePermission.code)).toBe(false);
    } finally {
      await client.userRole.delete({ where: { id: assignment.id } });
      await client.permission.delete({ where: { id: futurePermission.id } });
      await client.user.delete({ where: { id: isolatedUser.id } });
    }
  });
});
