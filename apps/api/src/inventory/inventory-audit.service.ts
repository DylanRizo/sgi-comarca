import type { DatabaseClient } from '@sgi/database';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

export type InventoryAdjustmentAuditInput = {
  actorUserId: string;
  balanceAfter: string;
  balanceBefore: string;
  movementId: string;
  occurredAt: Date;
  productId: string;
  quantityDelta: string;
  reason: string;
  warehouseId: string;
};

export class InventoryAuditService {
  async recordAdjustment(
    transaction: TransactionClient,
    input: InventoryAdjustmentAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.adjusted',
        actorUserId: input.actorUserId,
        afterData: { quantity: input.balanceAfter },
        beforeData: { quantity: input.balanceBefore },
        entityId: input.movementId,
        entityType: 'InventoryMovement',
        metadata: {
          productId: input.productId,
          quantityDelta: input.quantityDelta,
          reason: input.reason,
          warehouseId: input.warehouseId,
        },
        occurredAt: input.occurredAt,
      },
    });
  }
}
