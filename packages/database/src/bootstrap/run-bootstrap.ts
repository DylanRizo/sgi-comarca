import {
  Prisma,
  UserStatus,
  type PrismaClient,
} from '../generated/prisma/client.js';
import {
  bootstrapPermissions,
  bootstrapRolePermissions,
  bootstrapRoles,
  bootstrapUserPermissions,
  bootstrapUserRoles,
  bootstrapUsers,
  bootstrapWarehouses,
  grantKey,
} from './manifest.js';

export class BootstrapConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapConflictError';
  }
}

export type BootstrapResult = {
  created: {
    auditLogs: number;
    permissions: number;
    rolePermissions: number;
    roles: number;
    userPermissions: number;
    userRoles: number;
    users: number;
    warehouses: number;
  };
};

type ComparableRecord = Record<string, unknown>;

export function assertCompatibleRecord(
  label: string,
  existing: ComparableRecord,
  expected: ComparableRecord,
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (existing[key] !== expectedValue) {
      throw new BootstrapConflictError(
        'Bootstrap conflict for ' + label + ': field ' + key + ' differs.',
      );
    }
  }
}

function assertNoUnexpectedRecords(
  label: string,
  actual: Iterable<string>,
  expected: Iterable<string>,
): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const extras = [...actualSet].filter((value) => !expectedSet.has(value));

  if (extras.length > 0) {
    throw new BootstrapConflictError(
      'Bootstrap conflict for ' + label + ': unexpected active records exist.',
    );
  }
}

function assertExactRecords(
  label: string,
  actual: Iterable<string>,
  expected: Iterable<string>,
): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const extras = [...actualSet].filter((value) => !expectedSet.has(value));
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));

  if (extras.length > 0 || missing.length > 0) {
    throw new BootstrapConflictError(
      'Bootstrap conflict for ' + label + ': active baseline differs.',
    );
  }
}

async function assertLiveAuthorizationUpgradeBaseline(
  client: Prisma.TransactionClient,
): Promise<void> {
  const [users, roles, warehouses, userRoles, userPermissions] =
    await Promise.all([
      client.user.findMany({
        where: {
          loginIdentifier: {
            in: bootstrapUsers.map(({ loginIdentifier }) => loginIdentifier),
          },
        },
        select: { displayName: true, loginIdentifier: true },
      }),
      client.role.findMany({ select: { code: true } }),
      client.warehouse.findMany({
        select: { active: true, code: true, name: true },
      }),
      client.userRole.findMany({
        where: { revokedAt: null },
        include: { role: true, user: true },
      }),
      client.userPermission.findMany({
        where: { revokedAt: null },
        include: { permission: true, user: true },
      }),
    ]);

  assertExactRecords(
    'live bootstrap users',
    users.map(
      ({ displayName, loginIdentifier }) => loginIdentifier + ':' + displayName,
    ),
    bootstrapUsers.map(
      ({ displayName, loginIdentifier }) => loginIdentifier + ':' + displayName,
    ),
  );
  assertExactRecords(
    'live bootstrap roles',
    roles.map(({ code }) => code),
    bootstrapRoles.map(({ code }) => code),
  );
  assertExactRecords(
    'live bootstrap warehouses',
    warehouses.map(({ active, code, name }) =>
      [code, name, active ? 'active' : 'inactive'].join(':'),
    ),
    bootstrapWarehouses.map(({ code, name }) =>
      [code, name, 'active'].join(':'),
    ),
  );
  assertExactRecords(
    'live bootstrap user roles',
    userRoles.map(({ role, user }) =>
      grantKey(user.loginIdentifier, role.code),
    ),
    bootstrapUserRoles.map(({ loginIdentifier, roleCode }) =>
      grantKey(loginIdentifier, roleCode),
    ),
  );
  // Direct grants are checked for extras only, not for exact equality, and the
  // asymmetry with the identity records above is deliberate.
  //
  // An unexpected active grant still blocks the run: it means someone handed
  // out a privilege outside the manifest, and bootstrap must never build on
  // that. A *missing* grant is different — it is the manifest declaring a new
  // one, which the main body then creates additively under its own guards,
  // including its refusal to reactivate a revoked grant.
  //
  // Requiring exact equality here made the manifest unable to express "add this
  // direct grant" against a database already in use: the run aborted before
  // creating the permission the grant refers to, so no ordering of steps could
  // satisfy it. That surfaced when FASE 9 added the first new direct grant
  // since the live database was seeded.
  assertNoUnexpectedRecords(
    'live bootstrap user permissions',
    userPermissions.map(({ permission, user }) =>
      grantKey(user.loginIdentifier, permission.code),
    ),
    bootstrapUserPermissions.map(({ loginIdentifier, permissionCode }) =>
      grantKey(loginIdentifier, permissionCode),
    ),
  );
}

export async function runBootstrap(
  client: PrismaClient,
): Promise<BootstrapResult> {
  return client.$transaction(
    async (transaction) => {
      const created: BootstrapResult['created'] = {
        auditLogs: 0,
        permissions: 0,
        rolePermissions: 0,
        roles: 0,
        userPermissions: 0,
        userRoles: 0,
        users: 0,
        warehouses: 0,
      };

      const [credentialCount, sessionCount] = await Promise.all([
        transaction.passwordCredential.count(),
        transaction.session.count(),
      ]);

      const liveAuthorizationUpgrade =
        credentialCount !== 0 || sessionCount !== 0;
      if (liveAuthorizationUpgrade) {
        await assertLiveAuthorizationUpgradeBaseline(transaction);
      }

      const existingRoleCodes = (
        await transaction.role.findMany({ select: { code: true } })
      ).map(({ code }) => code);
      assertNoUnexpectedRecords(
        'roles',
        existingRoleCodes,
        bootstrapRoles.map(({ code }) => code),
      );

      const rolesByCode = new Map<string, string>();
      for (const expected of bootstrapRoles) {
        const existing = await transaction.role.findUnique({
          where: { code: expected.code },
        });
        if (existing) {
          assertCompatibleRecord('role ' + expected.code, existing, expected);
          rolesByCode.set(expected.code, existing.id);
          continue;
        }

        const role = await transaction.role.create({ data: expected });
        rolesByCode.set(expected.code, role.id);
        created.roles += 1;
      }

      const existingPermissionCodes = (
        await transaction.permission.findMany({ select: { code: true } })
      ).map(({ code }) => code);
      assertNoUnexpectedRecords(
        'permissions',
        existingPermissionCodes,
        bootstrapPermissions.map(({ code }) => code),
      );

      const permissionsByCode = new Map<string, string>();
      for (const expected of bootstrapPermissions) {
        const existing = await transaction.permission.findUnique({
          where: { code: expected.code },
        });
        if (existing) {
          assertCompatibleRecord(
            'permission ' + expected.code,
            existing,
            expected,
          );
          permissionsByCode.set(expected.code, existing.id);
          continue;
        }

        const permission = await transaction.permission.create({
          data: expected,
        });
        permissionsByCode.set(expected.code, permission.id);
        created.permissions += 1;
      }

      const usersByLogin = new Map<string, string>();
      for (const expected of bootstrapUsers) {
        const existing = await transaction.user.findUnique({
          where: { loginIdentifier: expected.loginIdentifier },
        });
        const expectedRecord = liveAuthorizationUpgrade
          ? expected
          : {
              ...expected,
              status: UserStatus.PENDING_ACTIVATION,
              activatedAt: null,
            };
        if (existing) {
          assertCompatibleRecord(
            'user ' + expected.loginIdentifier,
            existing,
            expectedRecord,
          );
          usersByLogin.set(expected.loginIdentifier, existing.id);
          continue;
        }

        const user = await transaction.user.create({
          data: {
            ...expectedRecord,
            status: UserStatus.PENDING_ACTIVATION,
            activatedAt: null,
          },
        });
        usersByLogin.set(expected.loginIdentifier, user.id);
        created.users += 1;
      }

      const existingWarehouseCodes = (
        await transaction.warehouse.findMany({ select: { code: true } })
      ).map(({ code }) => code);
      assertNoUnexpectedRecords(
        'warehouses',
        existingWarehouseCodes,
        bootstrapWarehouses.map(({ code }) => code),
      );

      for (const expected of bootstrapWarehouses) {
        const existing = await transaction.warehouse.findUnique({
          where: { code: expected.code },
        });
        const expectedRecord = { ...expected, active: true };
        if (existing) {
          assertCompatibleRecord(
            'warehouse ' + expected.code,
            existing,
            expectedRecord,
          );
          continue;
        }

        await transaction.warehouse.create({ data: expectedRecord });
        created.warehouses += 1;
      }

      const expectedUserRoleKeys = new Set(
        bootstrapUserRoles.map(({ loginIdentifier, roleCode }) =>
          grantKey(loginIdentifier, roleCode),
        ),
      );
      const activeUserRoles = await transaction.userRole.findMany({
        where: { revokedAt: null },
        include: { role: true, user: true },
      });
      assertNoUnexpectedRecords(
        'active user roles',
        activeUserRoles.map(({ role, user }) =>
          grantKey(user.loginIdentifier, role.code),
        ),
        expectedUserRoleKeys,
      );

      for (const expected of bootstrapUserRoles) {
        const userId = usersByLogin.get(expected.loginIdentifier);
        const roleId = rolesByCode.get(expected.roleCode);
        if (!userId || !roleId) {
          throw new BootstrapConflictError(
            'Bootstrap manifest references an unknown user or role.',
          );
        }

        const active = await transaction.userRole.findFirst({
          where: { roleId, userId, revokedAt: null },
        });
        if (active) continue;

        const historical = await transaction.userRole.findFirst({
          where: { roleId, userId, revokedAt: { not: null } },
        });
        if (historical) {
          throw new BootstrapConflictError(
            'Bootstrap will not reactivate a revoked user role.',
          );
        }

        await transaction.userRole.create({ data: { roleId, userId } });
        created.userRoles += 1;
      }

      const expectedRolePermissionKeys = new Set(
        bootstrapRolePermissions.map(({ roleCode, permissionCode }) =>
          grantKey(roleCode, permissionCode),
        ),
      );
      const activeRolePermissions = await transaction.rolePermission.findMany({
        where: { revokedAt: null },
        include: { permission: true, role: true },
      });
      assertNoUnexpectedRecords(
        'active role permissions',
        activeRolePermissions.map(({ permission, role }) =>
          grantKey(role.code, permission.code),
        ),
        expectedRolePermissionKeys,
      );

      for (const expected of bootstrapRolePermissions) {
        const roleId = rolesByCode.get(expected.roleCode);
        const permissionId = permissionsByCode.get(expected.permissionCode);
        if (!roleId || !permissionId) {
          throw new BootstrapConflictError(
            'Bootstrap manifest references an unknown role or permission.',
          );
        }

        const active = await transaction.rolePermission.findFirst({
          where: { permissionId, roleId, revokedAt: null },
        });
        if (active) continue;

        const historical = await transaction.rolePermission.findFirst({
          where: { permissionId, roleId, revokedAt: { not: null } },
        });
        if (historical) {
          throw new BootstrapConflictError(
            'Bootstrap will not reactivate a revoked role permission.',
          );
        }

        await transaction.rolePermission.create({
          data: { permissionId, roleId },
        });
        created.rolePermissions += 1;
      }

      const expectedUserPermissionKeys = new Set(
        bootstrapUserPermissions.map(({ loginIdentifier, permissionCode }) =>
          grantKey(loginIdentifier, permissionCode),
        ),
      );
      const activeUserPermissions = await transaction.userPermission.findMany({
        where: { revokedAt: null },
        include: { permission: true, user: true },
      });
      assertNoUnexpectedRecords(
        'active user permissions',
        activeUserPermissions.map(({ permission, user }) =>
          grantKey(user.loginIdentifier, permission.code),
        ),
        expectedUserPermissionKeys,
      );

      for (const expected of bootstrapUserPermissions) {
        const userId = usersByLogin.get(expected.loginIdentifier);
        const permissionId = permissionsByCode.get(expected.permissionCode);
        if (!userId || !permissionId) {
          throw new BootstrapConflictError(
            'Bootstrap manifest references an unknown user or permission.',
          );
        }

        const active = await transaction.userPermission.findFirst({
          where: { permissionId, userId, revokedAt: null },
        });
        if (active) continue;

        const historical = await transaction.userPermission.findFirst({
          where: { permissionId, userId, revokedAt: { not: null } },
        });
        if (historical) {
          throw new BootstrapConflictError(
            'Bootstrap will not reactivate a revoked user permission.',
          );
        }

        await transaction.userPermission.create({
          data: { permissionId, userId },
        });
        created.userPermissions += 1;
      }

      const mutationCount = Object.entries(created)
        .filter(([key]) => key !== 'auditLogs')
        .reduce((total, [, count]) => total + count, 0);

      if (mutationCount > 0) {
        await transaction.auditLog.create({
          data: {
            action: 'SYSTEM_BOOTSTRAP_APPLIED',
            entityType: 'SYSTEM_BOOTSTRAP',
            metadata: {
              createdRecordCount: mutationCount,
              phase: '7A-RBAC',
            },
          },
        });
        created.auditLogs = 1;
      }

      return { created };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
