import type { TransactionClient } from '../auth/application/last-admin-policy.js';

export type IntegrationAuditAction =
  | 'INTEGRATION_CATALOG_READ'
  | 'INTEGRATION_KEY_CREATED'
  | 'INTEGRATION_KEY_REVOKED';

type SafeAuditValue = boolean | number | string | null;

export type IntegrationAuditInput = {
  action: IntegrationAuditAction;
  actorUserId: string;
  entityId: string;
  metadata?: Record<string, SafeAuditValue>;
  occurredAt: Date;
};

// The key itself, its hash and any request credential must never reach the
// audit trail, even under an innocent-looking metadata name.
const forbiddenMetadataKeys =
  /(authorization|cookie|credential|csrf|hash|password|secret|token)/iu;

export class IntegrationAuditService {
  async record(
    transaction: TransactionClient,
    input: IntegrationAuditInput,
  ): Promise<void> {
    const metadata = input.metadata ?? {};
    for (const key of Object.keys(metadata)) {
      if (forbiddenMetadataKeys.test(key)) {
        throw new Error('Integration audit metadata contains a secret key.');
      }
    }

    await transaction.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId,
        entityId: input.entityId,
        entityType: 'INTEGRATION',
        metadata,
        occurredAt: input.occurredAt,
      },
    });
  }
}
