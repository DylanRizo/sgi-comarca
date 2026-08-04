import { createHash } from 'node:crypto';

import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdminRecoveryService } from '../src/auth/application/admin-recovery.service.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const controlledToken = 'CONTROLLED_REDACTED_TEST_VALUE';
const controlledTokenHash = createHash('sha256')
  .update(controlledToken, 'utf8')
  .digest('hex');
const fixedNow = new Date(Date.now() + 60 * 60 * 1000);

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe.sequential('administrative invitation and recovery', () => {
  let client: DatabaseClient;
  let initialInvitationAuditCount = 0;
  let recoveryAuditCount = 0;
  let releaseSuiteLock: (() => void) | undefined;
  let suiteLockTask: Promise<unknown> | undefined;

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
      { timeout: 120_000 },
    );
    await Promise.race([ready.promise, suiteLockTask]);
  });

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    await runBootstrap(client);
    [initialInvitationAuditCount, recoveryAuditCount] = await Promise.all([
      client.auditLog.count({
        where: { action: 'INITIAL_ADMIN_INVITATION_CREATED' },
      }),
      client.auditLog.count({ where: { action: 'SOLE_ADMIN_RECOVERED' } }),
    ]);
  });

  afterAll(async () => {
    await client.session.deleteMany();
    await client.userInvitation.deleteMany();
    await client.passwordCredential.deleteMany();
    await client.user.updateMany({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
    releaseSuiteLock?.();
    await suiteLockTask;
    await client.$disconnect();
  });

  function createService(token = controlledToken): AdminRecoveryService {
    return new AdminRecoveryService(client, undefined, {
      now: () => fixedNow,
      tokenFactory: () => token,
    });
  }

  it('creates an initial hash-only invitation and invalidates the previous one', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const previous = await client.userInvitation.create({
      data: {
        createdAt: fixedNow,
        userId: dylan.id,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const returnedToken = await createService().createInitialAdminInvitation();
    expect(returnedToken).toBe(controlledToken);

    const [invitations, auditLogs, sessionCount, credentialCount] =
      await Promise.all([
        client.userInvitation.findMany({
          where: { userId: dylan.id },
          orderBy: { createdAt: 'asc' },
        }),
        client.auditLog.findMany({
          where: { action: 'INITIAL_ADMIN_INVITATION_CREATED' },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          skip: initialInvitationAuditCount,
        }),
        client.session.count(),
        client.passwordCredential.count(),
      ]);
    const invalidated = invitations.find(({ id }) => id === previous.id);
    const current = invitations.find(
      ({ tokenHash }) => tokenHash === controlledTokenHash,
    );

    expect(invalidated?.invalidatedAt).toEqual(fixedNow);
    expect(invalidated?.invalidationReason).toBe(
      'REPLACED_BY_INITIAL_ADMIN_INVITATION',
    );
    expect(current).toMatchObject({
      consumedAt: null,
      invalidatedAt: null,
      tokenHash: controlledTokenHash,
    });
    expect(current).toBeDefined();
    if (!current) throw new Error('Expected the current invitation fixture.');
    expect(current.expiresAt.getTime() - fixedNow.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(auditLogs).toHaveLength(1);
    const serializedAudit = JSON.stringify(auditLogs);
    expect(serializedAudit).not.toContain(controlledToken);
    expect(serializedAudit).not.toContain(controlledTokenHash);
    expect(sessionCount).toBe(0);
    expect(credentialCount).toBe(0);
  });

  it('rejects zero or multiple ADMIN assignments, active ADMIN and disabled ADMIN', async () => {
    const adminRole = await client.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const samantha = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'samantha' },
    });
    const dylanAssignment = await client.userRole.findFirstOrThrow({
      where: { userId: dylan.id, roleId: adminRole.id, revokedAt: null },
    });

    await client.userRole.update({
      where: { id: dylanAssignment.id },
      data: { revokedAt: fixedNow },
    });
    await expect(
      createService().createInitialAdminInvitation(),
    ).rejects.toThrow('Exactly one assigned ADMIN');
    await client.userRole.update({
      where: { id: dylanAssignment.id },
      data: { revokedAt: null },
    });

    const secondAdmin = await client.userRole.create({
      data: { userId: samantha.id, roleId: adminRole.id },
    });
    await expect(
      createService().createInitialAdminInvitation(),
    ).rejects.toThrow('Exactly one assigned ADMIN');
    await client.userRole.delete({ where: { id: secondAdmin.id } });

    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: fixedNow, status: 'ACTIVE' },
    });
    await expect(
      createService().createInitialAdminInvitation(),
    ).rejects.toThrow('active ADMIN already exists');

    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: null, status: 'DISABLED' },
    });
    await expect(
      createService().createInitialAdminInvitation(),
    ).rejects.toThrow('assigned ADMIN is disabled');
  });

  it('rejects an incompatible authorization matrix without side effects', async () => {
    const adminRole = await client.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const permission = await client.permission.findUniqueOrThrow({
      where: { code: 'users.status.manage' },
    });
    const grant = await client.rolePermission.findFirstOrThrow({
      where: {
        roleId: adminRole.id,
        permissionId: permission.id,
        revokedAt: null,
      },
    });
    await client.rolePermission.update({
      where: { id: grant.id },
      data: { revokedAt: fixedNow },
    });

    await expect(
      createService().createInitialAdminInvitation(),
    ).rejects.toThrow('authorization matrix is incompatible');
    expect(await client.userInvitation.count()).toBe(0);
    expect(
      await client.auditLog.count({
        where: { action: 'INITIAL_ADMIN_INVITATION_CREATED' },
      }),
    ).toBe(initialInvitationAuditCount);

    await client.rolePermission.update({
      where: { id: grant.id },
      data: { revokedAt: null },
    });
  });

  it('recovers the sole ADMIN atomically and preserves the authorization matrix', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const rolesBefore = await client.userRole.findMany({
      orderBy: { id: 'asc' },
    });
    const rolePermissionsBefore = await client.rolePermission.findMany({
      orderBy: { id: 'asc' },
    });
    const userPermissionsBefore = await client.userPermission.findMany({
      orderBy: { id: 'asc' },
    });

    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: fixedNow, status: 'ACTIVE' },
    });
    await client.passwordCredential.create({
      data: {
        userId: dylan.id,
        passwordHash: 'CONTROLLED_ARGON2ID_TEST_HASH',
      },
    });
    await client.session.createMany({
      data: [0, 1].map((offset) => ({
        userId: dylan.id,
        tokenHash: (offset === 0 ? 'b' : 'c').repeat(64),
        createdAt: fixedNow,
        lastSeenAt: fixedNow,
        idleExpiresAt: new Date(fixedNow.getTime() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(fixedNow.getTime() + 8 * 60 * 60 * 1000),
      })),
    });
    const previousInvitation = await client.userInvitation.create({
      data: {
        createdAt: fixedNow,
        userId: dylan.id,
        tokenHash: 'd'.repeat(64),
        expiresAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    expect(await createService().recoverAssignedAdmin()).toBe(controlledToken);

    const [user, credential, sessions, oldInvitation, newInvitation, audit] =
      await Promise.all([
        client.user.findUniqueOrThrow({ where: { id: dylan.id } }),
        client.passwordCredential.findUniqueOrThrow({
          where: { userId: dylan.id },
        }),
        client.session.findMany({ where: { userId: dylan.id } }),
        client.userInvitation.findUniqueOrThrow({
          where: { id: previousInvitation.id },
        }),
        client.userInvitation.findUniqueOrThrow({
          where: { tokenHash: controlledTokenHash },
        }),
        client.auditLog.findMany({
          where: { action: 'SOLE_ADMIN_RECOVERED' },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          skip: recoveryAuditCount,
        }),
      ]);

    expect(user).toMatchObject({
      activatedAt: null,
      status: 'PENDING_ACTIVATION',
    });
    expect(credential).toMatchObject({
      revokedAt: fixedNow,
      revokeReason: 'ADMIN_RECOVERY',
    });
    expect(sessions).toHaveLength(2);
    expect(
      sessions.every(
        ({ revokedAt, revokeReason }) =>
          revokedAt?.getTime() === fixedNow.getTime() &&
          revokeReason === 'ADMIN_RECOVERY',
      ),
    ).toBe(true);
    expect(oldInvitation.invalidatedAt).toEqual(fixedNow);
    expect(newInvitation.expiresAt.getTime() - fixedNow.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({
      invalidatedInvitationCount: 1,
      revokedCredentialCount: 1,
      revokedSessionCount: 2,
      source: 'LOCAL_INTERACTIVE_CLI',
    });
    expect(await client.userRole.findMany({ orderBy: { id: 'asc' } })).toEqual(
      rolesBefore,
    );
    expect(
      await client.rolePermission.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(rolePermissionsBefore);
    expect(
      await client.userPermission.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(userPermissionsBefore);
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(controlledToken);
    expect(serializedAudit).not.toContain(controlledTokenHash);
  });

  it('rolls back the complete recovery when the replacement invitation fails', async () => {
    const [dylan, samantha] = await Promise.all([
      client.user.findUniqueOrThrow({ where: { loginIdentifier: 'dylan' } }),
      client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'samantha' },
      }),
    ]);
    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: fixedNow, status: 'ACTIVE' },
    });
    const credential = await client.passwordCredential.create({
      data: {
        userId: dylan.id,
        passwordHash: 'CONTROLLED_ARGON2ID_TEST_HASH',
      },
    });
    const session = await client.session.create({
      data: {
        userId: dylan.id,
        tokenHash: 'e'.repeat(64),
        createdAt: fixedNow,
        lastSeenAt: fixedNow,
        idleExpiresAt: new Date(fixedNow.getTime() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(fixedNow.getTime() + 8 * 60 * 60 * 1000),
      },
    });
    await client.userInvitation.create({
      data: {
        createdAt: fixedNow,
        userId: samantha.id,
        tokenHash: controlledTokenHash,
        expiresAt: new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000),
        consumedAt: fixedNow,
      },
    });

    await expect(createService().recoverAssignedAdmin()).rejects.toThrow();

    expect(
      await client.user.findUniqueOrThrow({ where: { id: dylan.id } }),
    ).toMatchObject({ activatedAt: fixedNow, status: 'ACTIVE' });
    expect(
      await client.passwordCredential.findUniqueOrThrow({
        where: { id: credential.id },
      }),
    ).toMatchObject({ revokedAt: null, revokeReason: null });
    expect(
      await client.session.findUniqueOrThrow({ where: { id: session.id } }),
    ).toMatchObject({ revokedAt: null, revokeReason: null });
    expect(
      await client.auditLog.count({
        where: { action: 'SOLE_ADMIN_RECOVERED' },
      }),
    ).toBe(recoveryAuditCount);
  });
});
