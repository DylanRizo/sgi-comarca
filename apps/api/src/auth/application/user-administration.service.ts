import type { DatabaseClient } from '@sgi/database';

import type { Clock } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import {
  AuthTokenService,
  type SecretToken,
} from '../infrastructure/auth-token.service.js';
import { AuthAuditService } from './auth-audit.service.js';
import {
  LastAdminPolicy,
  type TransactionClient,
} from './last-admin-policy.js';
import { SessionService } from './session.service.js';

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type UserAdministrationFailure =
  | 'ADMIN_OPERATION_CONFLICT'
  | 'ADMIN_USER_NOT_FOUND'
  | 'ADMIN_USER_STATE_CONFLICT';

export class UserAdministrationError extends Error {
  constructor(readonly code: UserAdministrationFailure) {
    super(code);
    this.name = 'UserAdministrationError';
  }
}

export type CreatedAdminInvitation = {
  secret: SecretToken;
};

type LockedUser = {
  activatedAt: Date | null;
  id: string;
  status: 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';
};

function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === 'P2034') return true;
  const serialized = JSON.stringify(error);
  return serialized.includes('40001') || serialized.includes('55P03');
}

export class UserAdministrationService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly tokens = new AuthTokenService(),
    private readonly audit = new AuthAuditService(),
    private readonly sessions = new SessionService(client),
    private readonly lastAdminPolicy = new LastAdminPolicy(),
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async createInvitation(
    actorUserId: string,
    targetUserId: string,
  ): Promise<CreatedAdminInvitation> {
    const generated = this.tokens.generate();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);

    try {
      await this.client.$transaction(
        async (transaction) => {
          await this.acquireInvitationLock(transaction, targetUserId);
          const user = await this.lockUser(transaction, targetUserId);
          if (user.status !== 'PENDING_ACTIVATION') {
            throw new UserAdministrationError('ADMIN_USER_STATE_CONFLICT');
          }

          const invalidated = await transaction.userInvitation.updateMany({
            where: {
              consumedAt: null,
              invalidatedAt: null,
              userId: targetUserId,
            },
            data: {
              invalidatedAt: now,
              invalidatedByUserId: actorUserId,
              invalidationReason: 'REPLACED_BY_ADMINISTRATIVE_INVITATION',
            },
          });
          await transaction.userInvitation.create({
            data: {
              createdAt: now,
              createdByUserId: actorUserId,
              expiresAt,
              tokenHash: generated.tokenHash,
              userId: targetUserId,
            },
          });
          await this.audit.record(transaction, {
            action: 'ADMIN_INVITATION_CREATED',
            actorUserId,
            entityId: targetUserId,
            metadata: {
              invalidatedInvitationCount: invalidated.count,
              operationType: 'CREATE_OR_REGENERATE',
            },
            occurredAt: now,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof UserAdministrationError) throw error;
      if (isTransactionConflict(error)) {
        throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
      }
      throw error;
    }

    return { secret: generated.secret };
  }

  async revokeCredential(
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    try {
      await this.client.$transaction(
        async (transaction) => {
          await this.lastAdminPolicy.assertCanAdministrativelyRevokeCredential(
            transaction,
            targetUserId,
          );
          const user = await this.lockUser(transaction, targetUserId);
          if (user.status === 'DISABLED') {
            throw new UserAdministrationError('ADMIN_USER_STATE_CONFLICT');
          }

          const credential = await transaction.passwordCredential.findUnique({
            where: { userId: targetUserId },
            select: { id: true, revokedAt: true },
          });
          if (
            user.status === 'ACTIVE' &&
            (!credential || credential.revokedAt)
          ) {
            throw new UserAdministrationError('ADMIN_USER_STATE_CONFLICT');
          }

          const now = this.clock.now();
          let revokedCredential = 0;
          if (credential && !credential.revokedAt) {
            revokedCredential = (
              await transaction.passwordCredential.updateMany({
                where: { id: credential.id, revokedAt: null },
                data: {
                  revokedAt: now,
                  revokedByUserId: actorUserId,
                  revokeReason: 'ADMINISTRATIVE_REVOCATION',
                },
              })
            ).count;
          }
          const revokedSessionCount =
            await this.sessions.revokeAllInTransaction(
              transaction,
              targetUserId,
              'ADMINISTRATIVE_CREDENTIAL_REVOCATION',
              now,
            );
          const userNeedsUpdate =
            user.status !== 'PENDING_ACTIVATION' || user.activatedAt !== null;
          if (userNeedsUpdate) {
            await transaction.user.update({
              where: { id: targetUserId },
              data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
            });
          }

          if (
            revokedCredential === 0 &&
            revokedSessionCount === 0 &&
            !userNeedsUpdate
          ) {
            return;
          }
          await this.audit.record(transaction, {
            action: 'ADMIN_CREDENTIAL_REVOKED',
            actorUserId,
            entityId: targetUserId,
            metadata: {
              operationType: 'ADMINISTRATIVE_REVOCATION',
              revokedSessionCount,
              statusChanged: userNeedsUpdate,
            },
            occurredAt: now,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof UserAdministrationError) throw error;
      if (isTransactionConflict(error)) {
        throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
      }
      throw error;
    }
  }

  async revokeSessions(
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    try {
      await this.client.$transaction(
        async (transaction) => {
          await this.lockUser(transaction, targetUserId);
          const now = this.clock.now();
          const revokedSessionCount =
            await this.sessions.revokeAllInTransaction(
              transaction,
              targetUserId,
              'ADMINISTRATIVE_SESSION_REVOCATION',
              now,
            );
          if (revokedSessionCount === 0) return;
          await this.audit.record(transaction, {
            action: 'ADMIN_SESSIONS_REVOKED',
            actorUserId,
            entityId: targetUserId,
            metadata: {
              operationType: 'REVOKE_ALL',
              revokedSessionCount,
            },
            occurredAt: now,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof UserAdministrationError) throw error;
      if (isTransactionConflict(error)) {
        throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
      }
      throw error;
    }
  }

  async deactivateUser(
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    try {
      await this.client.$transaction(
        async (transaction) => {
          await this.lastAdminPolicy.assertCanDisableUser(
            transaction,
            targetUserId,
          );
          const user = await this.lockUser(transaction, targetUserId);
          if (user.status === 'DISABLED') return;

          const now = this.clock.now();
          const revokedSessionCount =
            await this.sessions.revokeAllInTransaction(
              transaction,
              targetUserId,
              'USER_DISABLED',
              now,
            );
          const invalidated = await transaction.userInvitation.updateMany({
            where: {
              consumedAt: null,
              invalidatedAt: null,
              userId: targetUserId,
            },
            data: {
              invalidatedAt: now,
              invalidatedByUserId: actorUserId,
              invalidationReason: 'USER_DISABLED',
            },
          });
          await transaction.user.update({
            where: { id: targetUserId },
            data: { status: 'DISABLED' },
          });
          await this.audit.record(transaction, {
            action: 'ADMIN_USER_DEACTIVATED',
            actorUserId,
            entityId: targetUserId,
            metadata: {
              invalidatedInvitationCount: invalidated.count,
              operationType: 'DEACTIVATE',
              revokedSessionCount,
            },
            occurredAt: now,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof UserAdministrationError) throw error;
      if (isTransactionConflict(error)) {
        throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
      }
      throw error;
    }
  }

  private async acquireInvitationLock(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(
        hashtextextended(${'admin-invitation:' + targetUserId}, 73411)
      ) AS acquired
    `;
    if (rows[0]?.acquired !== true) {
      throw new UserAdministrationError('ADMIN_OPERATION_CONFLICT');
    }
  }

  private async lockUser(
    transaction: TransactionClient,
    targetUserId: string,
  ): Promise<LockedUser> {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM users
      WHERE id = ${targetUserId}::uuid
      FOR UPDATE
    `;
    if (!locked[0]) {
      throw new UserAdministrationError('ADMIN_USER_NOT_FOUND');
    }
    return transaction.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: { activatedAt: true, id: true, status: true },
    });
  }
}

export const administrativeInvitationLifetimeMs = INVITATION_LIFETIME_MS;
