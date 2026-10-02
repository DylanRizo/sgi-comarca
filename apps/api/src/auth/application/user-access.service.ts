import type { DatabaseClient } from '@sgi/database';

import type { Clock } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import {
  findOverrideChangeViolation,
  findRoleChangeViolation,
  hasChanges,
  planOverrideChange,
  planRoleChange,
  type PermissionOverride,
} from '../domain/user-access-policy.js';
import { AuthAuditService } from './auth-audit.service.js';
import {
  LastAdminPolicy,
  type TransactionClient,
} from './last-admin-policy.js';
import {
  isTransactionConflict,
  UserAdministrationError,
} from './user-administration.service.js';

/**
 * Roles and permission exceptions edited from the administration panel
 * (ADR-018). Each command receives the complete desired set and replaces what
 * is in force, so repeating it changes nothing and writes no audit. Nothing is
 * deleted: a removed assignment is revoked with its actor and time, and a new
 * one is a new row, which keeps the whole history in the database.
 *
 * Every command locks the ADMIN role through `LastAdminPolicy` before reading,
 * so it serializes with any other change that could affect who administers the
 * system, and then locks the target user.
 */
export class UserAccessService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly audit = new AuthAuditService(),
    private readonly lastAdminPolicy = new LastAdminPolicy(),
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async replaceRoles(
    actorUserId: string,
    targetUserId: string,
    roleCodes: readonly string[],
  ): Promise<void> {
    await this.run(async (transaction) => {
      await this.lastAdminPolicy.lockAssignedAdmins(transaction);
      await this.lockUser(transaction, targetUserId);

      const desired = [...new Set(roleCodes)];
      const roles = await transaction.role.findMany({
        where: { code: { in: desired } },
        select: { code: true, id: true },
      });
      if (roles.length !== desired.length) {
        throw new UserAdministrationError('ADMIN_UNKNOWN_CODE');
      }

      const current = await transaction.userRole.findMany({
        where: { revokedAt: null, userId: targetUserId },
        select: { id: true, role: { select: { code: true } } },
      });
      const plan = planRoleChange(
        current.map(({ role }) => role.code),
        desired,
      );
      const violation = findRoleChangeViolation(plan);
      if (violation) throw new UserAdministrationError(violation);
      if (!hasChanges(plan)) return;

      const now = this.clock.now();
      const removedIds = current
        .filter(({ role }) => plan.removed.includes(role.code))
        .map(({ id }) => id);
      await transaction.userRole.updateMany({
        where: { id: { in: removedIds }, revokedAt: null },
        data: { revokedAt: now, revokedByUserId: actorUserId },
      });
      await transaction.userRole.createMany({
        data: roles
          .filter(({ code }) => plan.added.includes(code))
          .map(({ id }) => ({
            grantedAt: now,
            grantedByUserId: actorUserId,
            roleId: id,
            userId: targetUserId,
          })),
      });
      await this.audit.record(transaction, {
        action: 'ADMIN_USER_ROLES_CHANGED',
        actorUserId,
        entityId: targetUserId,
        metadata: {
          addedRoles: plan.added.join(','),
          operationType: 'REPLACE_ROLES',
          removedRoles: plan.removed.join(','),
        },
        occurredAt: now,
      });
    });
  }

  async replaceOverrides(
    actorUserId: string,
    targetUserId: string,
    overrides: readonly PermissionOverride[],
  ): Promise<void> {
    await this.run(async (transaction) => {
      const administrators =
        await this.lastAdminPolicy.lockAssignedAdmins(transaction);
      await this.lockUser(transaction, targetUserId);

      const codes = [...new Set(overrides.map(({ code }) => code))];
      if (codes.length !== overrides.length) {
        throw new UserAdministrationError('ADMIN_UNKNOWN_CODE');
      }
      const permissions = await transaction.permission.findMany({
        where: { code: { in: codes } },
        select: { code: true, id: true },
      });
      if (permissions.length !== codes.length) {
        throw new UserAdministrationError('ADMIN_UNKNOWN_CODE');
      }

      const current = await transaction.userPermission.findMany({
        where: { revokedAt: null, userId: targetUserId },
        select: {
          effect: true,
          id: true,
          permission: { select: { code: true } },
        },
      });
      const plan = planOverrideChange(
        current.map(({ effect, permission }) => ({
          code: permission.code,
          effect,
        })),
        overrides,
      );
      const targetIsAdministrator = administrators.some(
        ({ user }) => user.id === targetUserId,
      );
      const violation = findOverrideChangeViolation(
        plan,
        targetIsAdministrator,
      );
      if (violation) throw new UserAdministrationError(violation);
      if (!hasChanges(plan)) return;

      const now = this.clock.now();
      const permissionIds = new Map(
        permissions.map(({ code, id }) => [code, id]),
      );
      // The partial unique index allows one active row per pair, so the old
      // side of a changed effect is revoked before the new one is inserted.
      await transaction.userPermission.updateMany({
        where: {
          id: {
            in: current
              .filter(({ permission }) => plan.revoke.includes(permission.code))
              .map(({ id }) => id),
          },
          revokedAt: null,
        },
        data: { revokedAt: now, revokedByUserId: actorUserId },
      });
      await transaction.userPermission.createMany({
        data: plan.create.map(({ code, effect }) => {
          const permissionId = permissionIds.get(code);
          if (!permissionId) {
            throw new UserAdministrationError('ADMIN_UNKNOWN_CODE');
          }
          return {
            effect,
            grantedAt: now,
            grantedByUserId: actorUserId,
            permissionId,
            userId: targetUserId,
          };
        }),
      });

      const created = new Set(plan.create.map(({ code }) => code));
      await this.audit.record(transaction, {
        action: 'ADMIN_USER_PERMISSIONS_CHANGED',
        actorUserId,
        entityId: targetUserId,
        metadata: {
          clearedPermissions: plan.revoke
            .filter((code) => !created.has(code))
            .join(','),
          deniedPermissions: plan.create
            .filter(({ effect }) => effect === 'DENY')
            .map(({ code }) => code)
            .join(','),
          grantedPermissions: plan.create
            .filter(({ effect }) => effect === 'GRANT')
            .map(({ code }) => code)
            .join(','),
          operationType: 'REPLACE_PERMISSIONS',
        },
        occurredAt: now,
      });
    });
  }

  private async run(
    body: (transaction: TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await this.client.$transaction(body, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof UserAdministrationError) throw error;
      if (isTransactionConflict(error)) {
        throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
      }
      throw error;
    }
  }

  private async lockUser(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM users
      WHERE id = ${targetUserId}::uuid
      FOR UPDATE
    `;
    if (!locked[0]) {
      throw new UserAdministrationError('ADMIN_USER_NOT_FOUND');
    }
  }
}
