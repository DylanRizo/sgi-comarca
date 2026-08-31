import type { DatabaseClient } from '@sgi/database';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

export type InventoryCountAdjustmentAuditEntry = {
  difference: string;
  lineId: string;
  movementId: string;
  productId: string;
  warehouseId: string;
};

export type InventoryCountSessionCreatedAuditInput = {
  actorUserId: string;
  businessDate: string;
  occurredAt: Date;
  reason: string;
  sessionId: string;
  warehouseIds: string[];
};

export type InventoryCountLineCapturedAuditInput = {
  actorUserId: string;
  countedQuantity: string;
  difference: string;
  expectedQuantity: string;
  lineId: string;
  occurredAt: Date;
  productId: string;
  sessionId: string;
  warehouseId: string;
};

export type InventoryCountSessionSubmittedAuditInput = {
  actorUserId: string;
  lineCount: number;
  occurredAt: Date;
  sessionId: string;
};

export type InventoryCountSessionApprovedAuditInput = {
  actorUserId: string;
  adjustments: InventoryCountAdjustmentAuditEntry[];
  occurredAt: Date;
  pendingItemCount: number;
  sessionId: string;
  unchangedLineCount: number;
};

export type InventoryCountSessionCancelledAuditInput = {
  actorUserId: string;
  occurredAt: Date;
  previousStatus: string;
  reason: string;
  sessionId: string;
};

/**
 * Physical count audit events. Metadata is sanitized by construction: the
 * idempotency key and request hashes are never recorded, and no cost or price
 * is exposed — a count only ever concerns quantities.
 */
export class InventoryCountAuditService {
  async recordSessionCreated(
    transaction: TransactionClient,
    input: InventoryCountSessionCreatedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.count_session.created',
        actorUserId: input.actorUserId,
        entityId: input.sessionId,
        entityType: 'InventoryCountSession',
        metadata: {
          businessDate: input.businessDate,
          reason: input.reason,
          warehouseIds: input.warehouseIds,
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordLineCaptured(
    transaction: TransactionClient,
    input: InventoryCountLineCapturedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.count_line.captured',
        actorUserId: input.actorUserId,
        entityId: input.lineId,
        entityType: 'InventoryCountLine',
        metadata: {
          countedQuantity: input.countedQuantity,
          difference: input.difference,
          expectedQuantity: input.expectedQuantity,
          productId: input.productId,
          sessionId: input.sessionId,
          warehouseId: input.warehouseId,
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordSessionSubmitted(
    transaction: TransactionClient,
    input: InventoryCountSessionSubmittedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.count_session.submitted',
        actorUserId: input.actorUserId,
        entityId: input.sessionId,
        entityType: 'InventoryCountSession',
        metadata: {
          lineCount: input.lineCount,
          newStatus: 'PENDING_APPROVAL',
          previousStatus: 'OPEN',
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordSessionApproved(
    transaction: TransactionClient,
    input: InventoryCountSessionApprovedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.count_session.approved',
        actorUserId: input.actorUserId,
        entityId: input.sessionId,
        entityType: 'InventoryCountSession',
        metadata: {
          adjustments: input.adjustments,
          newStatus: 'APPROVED',
          pendingItemCount: input.pendingItemCount,
          previousStatus: 'PENDING_APPROVAL',
          unchangedLineCount: input.unchangedLineCount,
        },
        occurredAt: input.occurredAt,
      },
    });
  }

  async recordSessionCancelled(
    transaction: TransactionClient,
    input: InventoryCountSessionCancelledAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.count_session.cancelled',
        actorUserId: input.actorUserId,
        entityId: input.sessionId,
        entityType: 'InventoryCountSession',
        metadata: {
          newStatus: 'CANCELLED',
          previousStatus: input.previousStatus,
          reason: input.reason,
        },
        occurredAt: input.occurredAt,
      },
    });
  }
}
