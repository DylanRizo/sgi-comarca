import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from '../src/client.js';
import { runBootstrap } from '../src/bootstrap/run-bootstrap.js';
import {
  administratorOnlyPermissionCodes,
  administratorRoleCode,
  bootstrapPermissions,
  bootstrapRolePermissions,
  bootstrapRoles,
  bootstrapUserPermissions,
  bootstrapUserRoles,
  bootstrapUsers,
  bootstrapWarehouses,
  grantKey,
} from '../src/bootstrap/manifest.js';

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

describe.sequential('FASE 3B bootstrap', () => {
  let client: DatabaseClient;
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

  afterAll(async () => {
    releaseSuiteLock?.();
    await suiteLockTask;
    await client.$disconnect();
  });

  it('is idempotent and leaves the exact approved state', async () => {
    await runBootstrap(client);
    const secondRun = await runBootstrap(client);
    expect(Object.values(secondRun.created).every((count) => count === 0)).toBe(
      true,
    );

    const [
      users,
      roles,
      permissions,
      warehouses,
      userRoles,
      rolePermissions,
      userPermissions,
      credentialCount,
      sessionCount,
      invitationCount,
      bootstrapAuditLogs,
    ] = await Promise.all([
      client.user.findMany({ orderBy: { loginIdentifier: 'asc' } }),
      client.role.findMany({ orderBy: { code: 'asc' } }),
      client.permission.findMany({ orderBy: { code: 'asc' } }),
      client.warehouse.findMany({ orderBy: { code: 'asc' } }),
      client.userRole.findMany({
        where: { revokedAt: null },
        include: { role: true, user: true },
      }),
      client.rolePermission.findMany({
        where: { revokedAt: null },
        include: { permission: true, role: true },
      }),
      client.userPermission.findMany({
        where: { revokedAt: null },
        include: { permission: true, user: true },
      }),
      client.passwordCredential.count(),
      client.session.count(),
      client.userInvitation.count(),
      client.auditLog.findMany({
        where: { action: 'SYSTEM_BOOTSTRAP_APPLIED' },
        select: { beforeData: true, afterData: true, metadata: true },
      }),
    ]);

    expect(
      users.map(({ activatedAt, displayName, loginIdentifier, status }) => ({
        activatedAt,
        displayName,
        loginIdentifier,
        status,
      })),
    ).toEqual(
      bootstrapUsers
        .map((user) => ({
          ...user,
          activatedAt: null,
          status: 'PENDING_ACTIVATION',
        }))
        .sort((left, right) =>
          left.loginIdentifier.localeCompare(right.loginIdentifier),
        ),
    );
    expect(roles.map(({ code }) => code)).toEqual(
      bootstrapRoles.map(({ code }) => code).sort(),
    );
    expect(permissions.map(({ code }) => code)).toEqual(
      bootstrapPermissions.map(({ code }) => code).sort(),
    );
    expect(
      warehouses.map(({ active, code, name }) => ({ active, code, name })),
    ).toEqual(
      bootstrapWarehouses
        .map((warehouse) => ({ ...warehouse, active: true }))
        .sort((left, right) => left.code.localeCompare(right.code)),
    );

    expect(
      userRoles
        .map(({ role, user }) => grantKey(user.loginIdentifier, role.code))
        .sort(),
    ).toEqual(
      bootstrapUserRoles
        .map(({ loginIdentifier, roleCode }) =>
          grantKey(loginIdentifier, roleCode),
        )
        .sort(),
    );
    expect(
      rolePermissions
        .map(({ permission, role }) => grantKey(role.code, permission.code))
        .sort(),
    ).toEqual(
      bootstrapRolePermissions
        .map(({ permissionCode, roleCode }) =>
          grantKey(roleCode, permissionCode),
        )
        .sort(),
    );
    expect(
      userPermissions.map(({ permission, user }) =>
        grantKey(user.loginIdentifier, permission.code),
      ),
    ).toEqual(
      bootstrapUserPermissions.map(({ loginIdentifier, permissionCode }) =>
        grantKey(loginIdentifier, permissionCode),
      ),
    );

    expect(credentialCount).toBe(0);
    expect(sessionCount).toBe(0);
    expect(invitationCount).toBe(0);
    expect(permissions).toHaveLength(26);
    expect(userRoles).toHaveLength(11);
    expect(rolePermissions).toHaveLength(26);
    expect(userPermissions).toHaveLength(2);
    expect(userRoles.filter(({ role }) => role.code === 'ADMIN')).toHaveLength(
      1,
    );
    expect(
      userRoles.find(({ role }) => role.code === 'ADMIN')?.user.loginIdentifier,
    ).toBe('dylan');
    expect(bootstrapAuditLogs).toHaveLength(1);
    expect(bootstrapAuditLogs[0]).toEqual({
      afterData: null,
      beforeData: null,
      metadata: { createdRecordCount: 78, phase: '7A-RBAC' },
    });
  });

  it('adds the approved authorization delta without mutating live authentication', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const inventoryRead = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.read' },
    });
    const inventoryManager = await client.role.findUniqueOrThrow({
      where: { code: 'INVENTORY_MANAGER' },
    });
    await client.rolePermission.deleteMany({
      where: {
        permissionId: inventoryRead.id,
        roleId: inventoryManager.id,
      },
    });
    await client.permission.delete({ where: { id: inventoryRead.id } });
    const activatedAt = new Date('2026-08-15T12:00:00.000Z');
    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt, status: 'ACTIVE' },
    });
    const credential = await client.passwordCredential.create({
      data: {
        passwordHash: 'CONTROLLED_ARGON2ID_BOOTSTRAP_TEST_HASH',
        userId: dylan.id,
      },
    });
    const session = await client.session.create({
      data: {
        absoluteExpiresAt: new Date('2026-08-15T20:00:00.000Z'),
        createdAt: activatedAt,
        idleExpiresAt: new Date('2026-08-15T12:30:00.000Z'),
        lastSeenAt: activatedAt,
        tokenHash: 'a'.repeat(64),
        userId: dylan.id,
      },
    });

    const result = await runBootstrap(client);
    const secondRun = await runBootstrap(client);

    expect(result.created).toMatchObject({
      auditLogs: 1,
      permissions: 1,
      rolePermissions: 1,
      roles: 0,
      userPermissions: 0,
      userRoles: 0,
      users: 0,
      warehouses: 0,
    });
    expect(Object.values(secondRun.created).every((count) => count === 0)).toBe(
      true,
    );
    expect(
      await client.permission.count({ where: { code: 'inventory.read' } }),
    ).toBe(1);
    expect(
      await client.rolePermission.count({
        where: {
          permission: { code: 'inventory.read' },
          revokedAt: null,
          role: { code: 'INVENTORY_MANAGER' },
        },
      }),
    ).toBe(1);
    expect(
      await client.user.findUniqueOrThrow({ where: { id: dylan.id } }),
    ).toMatchObject({ activatedAt, status: 'ACTIVE' });
    expect(
      await client.passwordCredential.findUniqueOrThrow({
        where: { id: credential.id },
      }),
    ).toMatchObject({ revokedAt: null });
    expect(
      await client.session.findUniqueOrThrow({ where: { id: session.id } }),
    ).toMatchObject({ revokedAt: null });

    await client.session.delete({ where: { id: session.id } });
    await client.passwordCredential.delete({ where: { id: credential.id } });
    await client.user.update({
      where: { id: dylan.id },
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
    });
  });

  it('leaves restricted roles empty and grants transfers.create only to inventory managers', async () => {
    const [
      restrictedRoleAssignments,
      administrativeRoleAssignments,
      administrativeRolePermissions,
      salesRoleAssignments,
      salesRolePermissions,
      transferGrants,
    ] = await Promise.all([
      client.userRole.count({
        where: {
          revokedAt: null,
          role: { code: { in: ['PARTNER', 'READ_ONLY'] } },
        },
      }),
      client.userRole.count({
        where: { revokedAt: null, role: { code: 'ADMIN' } },
      }),
      client.rolePermission.count({
        where: {
          revokedAt: null,
          role: { code: 'ADMIN' },
        },
      }),
      client.userRole.count({
        where: { revokedAt: null, role: { code: 'SALES' } },
      }),
      client.rolePermission.count({
        where: { revokedAt: null, role: { code: 'SALES' } },
      }),
      Promise.all([
        client.rolePermission.count({
          where: {
            revokedAt: null,
            permission: { code: 'transfers.create' },
          },
        }),
        client.userPermission.count({
          where: {
            revokedAt: null,
            permission: { code: 'transfers.create' },
          },
        }),
      ]),
    ]);

    expect(restrictedRoleAssignments).toBe(0);
    expect(administrativeRoleAssignments).toBe(1);
    expect(administrativeRolePermissions).toBe(7);
    expect(salesRoleAssignments).toBe(4);
    expect(salesRolePermissions).toBe(5);
    expect(transferGrants).toEqual([1, 0]);
  });

  it('adds a new catalog permission to a live database but leaves who holds it to the panel', async () => {
    // The FASE 9 staging gate hit this shape: a database already in use whose
    // catalog lacked a permission the manifest had newly added. Bootstrap must
    // still create the permission. Since ADR-018 it no longer grants it to a
    // person in a live database: the administration panel owns that.
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const approve = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.audit.approve' },
    });
    await client.userPermission.deleteMany({
      where: { permissionId: approve.id, userId: dylan.id },
    });
    await client.permission.delete({ where: { id: approve.id } });

    // Credentials and sessions are what put runBootstrap into its live
    // authorization upgrade path.
    const activatedAt = new Date('2026-08-15T12:00:00.000Z');
    await client.user.update({
      data: { activatedAt, status: 'ACTIVE' },
      where: { id: dylan.id },
    });
    const credential = await client.passwordCredential.create({
      data: {
        passwordHash: 'CONTROLLED_ARGON2ID_BOOTSTRAP_TEST_HASH',
        userId: dylan.id,
      },
    });
    const session = await client.session.create({
      data: {
        absoluteExpiresAt: new Date('2026-08-15T20:00:00.000Z'),
        createdAt: activatedAt,
        idleExpiresAt: new Date('2026-08-15T12:30:00.000Z'),
        lastSeenAt: activatedAt,
        tokenHash: 'b'.repeat(64),
        userId: dylan.id,
      },
    });

    const result = await runBootstrap(client);

    expect(result.created).toMatchObject({
      permissions: 1,
      userPermissions: 0,
      users: 0,
      userRoles: 0,
    });
    expect(
      await client.userPermission.count({
        where: {
          permission: { code: 'inventory.audit.approve' },
          revokedAt: null,
          userId: dylan.id,
        },
      }),
    ).toBe(0);

    // The live authentication it was upgrading around is untouched.
    expect(
      await client.session.findUniqueOrThrow({ where: { id: session.id } }),
    ).toMatchObject({ userId: dylan.id });
    expect(
      await client.passwordCredential.findUniqueOrThrow({
        where: { id: credential.id },
      }),
    ).toMatchObject({ userId: dylan.id });

    expect((await runBootstrap(client)).created).toMatchObject({
      permissions: 0,
      userPermissions: 0,
    });

    // The administrator would grant it from the panel; restore the manifest
    // state the later cases start from.
    await client.userPermission.create({
      data: {
        permissionId: (
          await client.permission.findUniqueOrThrow({
            where: { code: 'inventory.audit.approve' },
          })
        ).id,
        userId: dylan.id,
      },
    });

    await client.session.deleteMany({ where: { userId: dylan.id } });
    await client.passwordCredential.deleteMany({ where: { userId: dylan.id } });
    await client.user.update({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      where: { id: dylan.id },
    });
  });

  it('still refuses an administrator-only grant outside the ADMIN, on a live database', async () => {
    // The panel owns people's grants, but it can never hand an
    // administrator-only permission to anyone but the ADMIN (ADR-018). Finding
    // one means a privilege was handed out outside every approved path, and
    // bootstrap may not build on top of that.
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const samantha = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'samantha' },
    });
    const approve = await client.permission.findUniqueOrThrow({
      where: { code: 'inventory.audit.approve' },
    });

    const activatedAt = new Date('2026-08-15T12:00:00.000Z');
    await client.user.update({
      data: { activatedAt, status: 'ACTIVE' },
      where: { id: dylan.id },
    });
    const credential = await client.passwordCredential.create({
      data: {
        passwordHash: 'CONTROLLED_ARGON2ID_BOOTSTRAP_TEST_HASH',
        userId: dylan.id,
      },
    });
    const unexpected = await client.userPermission.create({
      data: { permissionId: approve.id, userId: samantha.id },
    });

    await expect(runBootstrap(client)).rejects.toThrow(
      'administrator-only permission is granted outside the ADMIN',
    );

    await client.userPermission.delete({ where: { id: unexpected.id } });
    await client.passwordCredential.delete({ where: { id: credential.id } });
    await client.user.update({
      data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
      where: { id: dylan.id },
    });
    await runBootstrap(client);
  });

  /**
   * Credentials are what put runBootstrap into its live path. Returns the
   * cleanup that takes the database back to an unused one.
   */
  async function enterLiveMode(): Promise<() => Promise<void>> {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    await client.user.update({
      data: {
        activatedAt: new Date('2026-08-15T12:00:00.000Z'),
        status: 'ACTIVE',
      },
      where: { id: dylan.id },
    });
    const credential = await client.passwordCredential.create({
      data: {
        passwordHash: 'CONTROLLED_ARGON2ID_BOOTSTRAP_TEST_HASH',
        userId: dylan.id,
      },
    });
    return async () => {
      await client.passwordCredential.delete({ where: { id: credential.id } });
      await client.user.update({
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
        where: { id: dylan.id },
      });
    };
  }

  it('leaves the assignments the panel made alone on a live database', async () => {
    const [jean, samantha, luden, finance, sales, salesCreate, financesRead] =
      await Promise.all([
        client.user.findUniqueOrThrow({ where: { loginIdentifier: 'jean' } }),
        client.user.findUniqueOrThrow({
          where: { loginIdentifier: 'samantha' },
        }),
        client.user.findUniqueOrThrow({ where: { loginIdentifier: 'luden' } }),
        client.role.findUniqueOrThrow({ where: { code: 'FINANCE' } }),
        client.role.findUniqueOrThrow({ where: { code: 'SALES' } }),
        client.permission.findUniqueOrThrow({
          where: { code: 'sales.create' },
        }),
        client.permission.findUniqueOrThrow({
          where: { code: 'finances.read' },
        }),
      ]);
    const leave = await enterLiveMode();

    // What the panel can do: add and remove ordinary roles, and set ordinary
    // exceptions in both directions.
    const addedRole = await client.userRole.create({
      data: { roleId: finance.id, userId: jean.id },
    });
    const removedRole = await client.userRole.findFirstOrThrow({
      where: { revokedAt: null, roleId: sales.id, userId: samantha.id },
    });
    await client.userRole.update({
      data: { revokedAt: new Date() },
      where: { id: removedRole.id },
    });
    const overrides = await Promise.all([
      client.userPermission.create({
        data: {
          effect: 'DENY',
          permissionId: salesCreate.id,
          userId: luden.id,
        },
      }),
      client.userPermission.create({
        data: { permissionId: financesRead.id, userId: luden.id },
      }),
    ]);
    const auditBefore = await client.auditLog.count();

    const first = await runBootstrap(client);
    const second = await runBootstrap(client);

    expect(Object.values(first.created).every((count) => count === 0)).toBe(
      true,
    );
    expect(Object.values(second.created).every((count) => count === 0)).toBe(
      true,
    );
    expect(await client.auditLog.count()).toBe(auditBefore);
    expect(
      await client.userRole.count({
        where: { revokedAt: null, roleId: sales.id, userId: samantha.id },
      }),
    ).toBe(0);
    expect(
      await client.userRole.findUniqueOrThrow({ where: { id: addedRole.id } }),
    ).toMatchObject({ revokedAt: null });

    await leave();
    await client.userPermission.deleteMany({
      where: { id: { in: overrides.map(({ id }) => id) } },
    });
    await client.userRole.delete({ where: { id: addedRole.id } });
    await client.userRole.update({
      data: { revokedAt: null },
      where: { id: removedRole.id },
    });
    await runBootstrap(client);
  });

  it('refuses a live database without exactly one ADMIN', async () => {
    const [samantha, admin] = await Promise.all([
      client.user.findUniqueOrThrow({ where: { loginIdentifier: 'samantha' } }),
      client.role.findUniqueOrThrow({ where: { code: 'ADMIN' } }),
    ]);
    const leave = await enterLiveMode();

    const secondAdmin = await client.userRole.create({
      data: { roleId: admin.id, userId: samantha.id },
    });
    await expect(runBootstrap(client)).rejects.toThrow(
      'exactly one ADMIN is required',
    );
    await client.userRole.delete({ where: { id: secondAdmin.id } });

    const soleAdmin = await client.userRole.findFirstOrThrow({
      where: { revokedAt: null, roleId: admin.id },
    });
    await client.userRole.update({
      data: { revokedAt: new Date() },
      where: { id: soleAdmin.id },
    });
    await expect(runBootstrap(client)).rejects.toThrow(
      'exactly one ADMIN is required',
    );
    await client.userRole.update({
      data: { revokedAt: null },
      where: { id: soleAdmin.id },
    });

    await leave();
    await runBootstrap(client);
  });

  it('declares every ADMIN role permission as administrator-only', () => {
    // ADR-018: granting an ADMIN permission directly to someone else would
    // build a second administrator piecemeal, so the restricted list must
    // cover the whole role, including permissions added to it later.
    const adminPermissions = bootstrapRolePermissions
      .filter(({ roleCode }) => roleCode === administratorRoleCode)
      .map(({ permissionCode }) => permissionCode);
    expect(adminPermissions.length).toBeGreaterThan(0);
    for (const code of adminPermissions) {
      expect(administratorOnlyPermissionCodes).toContain(code);
    }
    for (const { permissionCode } of bootstrapUserPermissions) {
      expect(administratorOnlyPermissionCodes).toContain(permissionCode);
    }
  });

  it('rolls back every partial change when the matrix is incompatible', async () => {
    const admin = await client.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const statusPermission = await client.permission.findUniqueOrThrow({
      where: { code: 'users.status.manage' },
    });
    const samantha = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'samantha' },
    });
    const salesCancel = await client.permission.findUniqueOrThrow({
      where: { code: 'sales.cancel' },
    });

    await client.rolePermission.deleteMany({
      where: { roleId: admin.id, permissionId: statusPermission.id },
    });
    const unexpectedGrant = await client.userPermission.create({
      data: { userId: samantha.id, permissionId: salesCancel.id },
    });
    const auditCountBefore = await client.auditLog.count();

    await expect(runBootstrap(client)).rejects.toThrow(
      'unexpected active records exist',
    );

    expect(
      await client.rolePermission.count({
        where: {
          roleId: admin.id,
          permissionId: statusPermission.id,
          revokedAt: null,
        },
      }),
    ).toBe(0);
    expect(await client.auditLog.count()).toBe(auditCountBefore);

    await client.userPermission.delete({ where: { id: unexpectedGrant.id } });
    await runBootstrap(client);
  });

  it('refuses to reactivate a revoked grant', async () => {
    const dylan = await client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'dylan' },
    });
    const salesCancel = await client.permission.findUniqueOrThrow({
      where: { code: 'sales.cancel' },
    });
    const grant = await client.userPermission.findFirstOrThrow({
      where: {
        userId: dylan.id,
        permissionId: salesCancel.id,
        revokedAt: null,
      },
    });
    const revokedAt = new Date();
    await client.userPermission.update({
      where: { id: grant.id },
      data: { revokedAt },
    });

    await expect(runBootstrap(client)).rejects.toThrow(
      'will not reactivate a revoked user permission',
    );
    expect(
      (
        await client.userPermission.findUniqueOrThrow({
          where: { id: grant.id },
        })
      ).revokedAt,
    ).toEqual(revokedAt);

    await client.userPermission.update({
      where: { id: grant.id },
      data: { revokedAt: null },
    });
  });
});
