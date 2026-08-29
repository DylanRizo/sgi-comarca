import type { DatabaseClient } from '@sgi/database';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

export type FinancialEntryAuditInput = {
  actorUserId: string;
  amount: string;
  businessDate: string;
  categoryId: string;
  entryId: string;
  entryType: string;
  occurredAt: Date;
  responsibleUserId: string;
};

export type DailyClosingAuditInput = {
  actorUserId: string;
  balanced: boolean;
  businessDate: string;
  closingId: string;
  difference: string;
  inTransitSaleCount: number;
  occurredAt: Date;
  systemSales: string;
  toleranceApplied: string;
};

export type DailyClosingReopenedAuditInput = {
  actorUserId: string;
  closingId: string;
  occurredAt: Date;
  reason: string;
  reopeningId: string;
};

/**
 * Finance audit events. Metadata is sanitized by construction: idempotency
 * keys, request hashes, cookies and tokens are never recorded.
 */
export class FinanceAuditService {
  async recordEntryCreated(
    transaction: TransactionClient,
    input: FinancialEntryAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'finances.entry_created',
        actorUserId: input.actorUserId,
        entityId: input.entryId,
        entityType: 'FinancialEntry',
        metadata: {
          amount: input.amount,
          businessDate: input.businessDate,
          categoryId: input.categoryId,
          entryType: input.entryType,
          responsibleUserId: input.responsibleUserId,
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordClosingCreated(
    transaction: TransactionClient,
    input: DailyClosingAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'closings.created',
        actorUserId: input.actorUserId,
        entityId: input.closingId,
        entityType: 'DailyClosing',
        metadata: {
          balanced: input.balanced,
          businessDate: input.businessDate,
          difference: input.difference,
          inTransitSaleCount: input.inTransitSaleCount,
          systemSales: input.systemSales,
          toleranceApplied: input.toleranceApplied,
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordClosingReopened(
    transaction: TransactionClient,
    input: DailyClosingReopenedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'closings.reopened',
        actorUserId: input.actorUserId,
        entityId: input.closingId,
        entityType: 'DailyClosing',
        metadata: {
          reason: input.reason,
          reopeningId: input.reopeningId,
        },
        occurredAt: input.occurredAt,
      },
    });
  }
}
