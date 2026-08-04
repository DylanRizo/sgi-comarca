import { createHash, randomBytes } from 'node:crypto';

import type { DatabaseClient } from '@sgi/database';

import {
  LastAdminPolicy,
  LastAdminPolicyError,
  type TransactionClient,
} from './last-admin-policy.js';

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

const approvedRoleCodes = [
  'ADMIN',
  'FINANCE',
  'INVENTORY_MANAGER',
  'PARTNER',
  'READ_ONLY',
  'SALES',
] as const;

const approvedPermissionCodes = [
  'closings.create',
  'closings.read',
  'closings.reopen',
  'finances.manual.create',
  'finances.read',
  'inventory.adjust',
  'sales.cancel',
  'sales.confirm_in_transit',
  'sales.create',
  'transfers.create',
  'users.credentials.revoke',
  'users.invitations.create',
  'users.sessions.revoke',
  'users.status.manage',
] as const;

const approvedRolePermissionKeys = [
  'ADMIN:users.credentials.revoke',
  'ADMIN:users.invitations.create',
  'ADMIN:users.sessions.revoke',
  'ADMIN:users.status.manage',
  'FINANCE:closings.create',
  'FINANCE:closings.read',
  'FINANCE:closings.reopen',
  'FINANCE:finances.manual.create',
  'FINANCE:finances.read',
  'INVENTORY_MANAGER:inventory.adjust',
  'SALES:sales.confirm_in_transit',
  'SALES:sales.create',
] as const;

const approvedUserRoleSignatures = [
  'ADMIN,FINANCE,INVENTORY_MANAGER,SALES',
  'FINANCE,INVENTORY_MANAGER,SALES',
  'INVENTORY_MANAGER,SALES',
  'INVENTORY_MANAGER,SALES',
] as const;

export class AdminRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminRecoveryError';
  }
}

export type AdminRecoveryServiceOptions = {
  now?: () => Date;
  tokenFactory?: () => string;
};

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertExactValues(
  label: string,
  actual: Iterable<string>,
  expected: readonly string[],
): void {
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected))) {
    throw new AdminRecoveryError(
      'The approved authorization matrix is incompatible: ' + label + '.',
    );
  }
}

async function assertApprovedAuthorizationMatrix(
  transaction: TransactionClient,
  adminUserId: string,
): Promise<void> {
  const [roles, permissions, rolePermissions, userRoles, userPermissions] =
    await Promise.all([
      transaction.role.findMany({ select: { code: true } }),
      transaction.permission.findMany({ select: { code: true } }),
      transaction.rolePermission.findMany({
        where: { revokedAt: null },
        select: {
          permission: { select: { code: true } },
          role: { select: { code: true } },
        },
      }),
      transaction.userRole.findMany({
        where: { revokedAt: null },
        select: {
          role: { select: { code: true } },
          userId: true,
        },
      }),
      transaction.userPermission.findMany({
        where: { revokedAt: null },
        select: {
          permission: { select: { code: true } },
          userId: true,
        },
      }),
    ]);

  assertExactValues(
    'roles',
    roles.map(({ code }) => code),
    approvedRoleCodes,
  );
  assertExactValues(
    'permissions',
    permissions.map(({ code }) => code),
    approvedPermissionCodes,
  );
  assertExactValues(
    'role permissions',
    rolePermissions.map(
      ({ permission, role }) => role.code + ':' + permission.code,
    ),
    approvedRolePermissionKeys,
  );

  const rolesByUser = new Map<string, string[]>();
  for (const { role, userId } of userRoles) {
    const roleCodes = rolesByUser.get(userId) ?? [];
    roleCodes.push(role.code);
    rolesByUser.set(userId, roleCodes);
  }
  assertExactValues(
    'user role distribution',
    [...rolesByUser.values()].map((roleCodes) => sorted(roleCodes).join(',')),
    approvedUserRoleSignatures,
  );

  if (
    userPermissions.length !== 1 ||
    userPermissions[0]?.userId !== adminUserId ||
    userPermissions[0]?.permission.code !== 'sales.cancel'
  ) {
    throw new AdminRecoveryError(
      'The approved authorization matrix is incompatible: direct permissions.',
    );
  }
}

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class AdminRecoveryService {
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;

  constructor(
    private readonly client: DatabaseClient,
    private readonly lastAdminPolicy = new LastAdminPolicy(),
    options: AdminRecoveryServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.tokenFactory = options.tokenFactory ?? createToken;
  }

  async createInitialAdminInvitation(): Promise<string> {
    const token = this.tokenFactory();
    const tokenHash = hashToken(token);
    const now = this.now();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);

    await this.client.$transaction(
      async (transaction) => {
        const assignment =
          await this.lastAdminPolicy.requireExactlyOneAssignedAdmin(
            transaction,
          );
        await assertApprovedAuthorizationMatrix(
          transaction,
          assignment.user.id,
        );

        if (assignment.user.status === 'DISABLED') {
          throw new AdminRecoveryError('The assigned ADMIN is disabled.');
        }
        if (assignment.user.status === 'ACTIVE') {
          throw new AdminRecoveryError(
            'An active ADMIN already exists; bootstrap invitation is forbidden.',
          );
        }

        const invalidated = await transaction.userInvitation.updateMany({
          where: {
            userId: assignment.user.id,
            consumedAt: null,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: now,
            invalidationReason: 'REPLACED_BY_INITIAL_ADMIN_INVITATION',
          },
        });
        await transaction.userInvitation.create({
          data: {
            userId: assignment.user.id,
            tokenHash,
            createdAt: now,
            expiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'INITIAL_ADMIN_INVITATION_CREATED',
            entityType: 'USER',
            entityId: assignment.user.id,
            metadata: {
              invalidatedInvitationCount: invalidated.count,
              source: 'LOCAL_INTERACTIVE_CLI',
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return token;
  }

  async recoverAssignedAdmin(): Promise<string> {
    const token = this.tokenFactory();
    const tokenHash = hashToken(token);
    const now = this.now();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);

    await this.client.$transaction(
      async (transaction) => {
        const assignment =
          await this.lastAdminPolicy.requireExactlyOneAssignedAdmin(
            transaction,
          );
        await assertApprovedAuthorizationMatrix(
          transaction,
          assignment.user.id,
        );
        if (assignment.user.status === 'DISABLED') {
          throw new AdminRecoveryError('The assigned ADMIN is disabled.');
        }

        const [revokedSessions, invalidatedInvitations, revokedCredentials] =
          await Promise.all([
            transaction.session.updateMany({
              where: { userId: assignment.user.id, revokedAt: null },
              data: { revokedAt: now, revokeReason: 'ADMIN_RECOVERY' },
            }),
            transaction.userInvitation.updateMany({
              where: {
                userId: assignment.user.id,
                consumedAt: null,
                invalidatedAt: null,
              },
              data: {
                invalidatedAt: now,
                invalidationReason: 'REPLACED_BY_ADMIN_RECOVERY',
              },
            }),
            transaction.passwordCredential.updateMany({
              where: { userId: assignment.user.id, revokedAt: null },
              data: { revokedAt: now, revokeReason: 'ADMIN_RECOVERY' },
            }),
          ]);

        await transaction.user.update({
          where: { id: assignment.user.id },
          data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
        });
        await transaction.userInvitation.create({
          data: {
            userId: assignment.user.id,
            tokenHash,
            createdAt: now,
            expiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'SOLE_ADMIN_RECOVERED',
            entityType: 'USER',
            entityId: assignment.user.id,
            metadata: {
              invalidatedInvitationCount: invalidatedInvitations.count,
              revokedCredentialCount: revokedCredentials.count,
              revokedSessionCount: revokedSessions.count,
              source: 'LOCAL_INTERACTIVE_CLI',
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return token;
  }
}

export function isControlledAdminError(error: unknown): boolean {
  return (
    error instanceof AdminRecoveryError || error instanceof LastAdminPolicyError
  );
}
