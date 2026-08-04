import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from '../src/client.js';
import { runBootstrap } from '../src/bootstrap/run-bootstrap.js';
import {
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

describe('FASE 3A bootstrap', () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl);
  });

  afterAll(async () => {
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
  });

  it('leaves restricted roles empty and transfers.create ungranted', async () => {
    const [
      restrictedRoleAssignments,
      restrictedRolePermissions,
      transferGrants,
    ] = await Promise.all([
      client.userRole.count({
        where: {
          revokedAt: null,
          role: { code: { in: ['ADMIN', 'PARTNER', 'READ_ONLY', 'SALES'] } },
        },
      }),
      client.rolePermission.count({
        where: {
          revokedAt: null,
          role: { code: { in: ['ADMIN', 'PARTNER', 'READ_ONLY'] } },
        },
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
    expect(restrictedRolePermissions).toBe(0);
    expect(transferGrants).toEqual([0, 0]);
  });
});
