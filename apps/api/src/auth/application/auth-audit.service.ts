import type { TransactionClient } from './last-admin-policy.js';

export type AuthenticationAuditAction =
  | 'AUTH_ACTIVATION_SUCCEEDED'
  | 'AUTH_LOGIN_BLOCKED'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGIN_SUCCEEDED'
  | 'AUTH_LOGOUT'
  | 'AUTH_PASSWORD_CHANGED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_SESSIONS_REVOKED';

type SafeAuditValue = boolean | number | string | null;

export type AuthenticationAuditInput = {
  action: AuthenticationAuditAction;
  actorUserId?: string;
  entityId?: string;
  metadata?: Record<string, SafeAuditValue>;
  occurredAt: Date;
};

const forbiddenMetadataKeys =
  /(cookie|credential|identifier|origin|password|secret|token)/iu;

export class AuthAuditService {
  async record(
    transaction: TransactionClient,
    input: AuthenticationAuditInput,
  ): Promise<void> {
    const metadata = input.metadata ?? {};
    for (const key of Object.keys(metadata)) {
      if (forbiddenMetadataKeys.test(key)) {
        throw new Error('Authentication audit metadata contains a secret key.');
      }
    }

    await transaction.auditLog.create({
      data: {
        action: input.action,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
        entityType: 'AUTHENTICATION',
        metadata,
        occurredAt: input.occurredAt,
      },
    });
  }
}
