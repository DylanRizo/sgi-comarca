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

export type InventoryTransferAuditInput = {
  actorUserId: string;
  fromWarehouseId: string;
  incomingMovementId: string;
  occurredAt: Date;
  outgoingMovementId: string;
  productId: string;
  quantity: string;
  reason: string;
  toWarehouseId: string;
  transferId: string;
  transferItemId: string;
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

  async recordTransfer(
    transaction: TransactionClient,
    input: InventoryTransferAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'inventory.transferred',
        actorUserId: input.actorUserId,
        entityId: input.transferId,
        entityType: 'InventoryTransfer',
        metadata: {
          fromWarehouseId: input.fromWarehouseId,
          incomingMovementId: input.incomingMovementId,
          outgoingMovementId: input.outgoingMovementId,
          productId: input.productId,
          quantity: input.quantity,
          reason: input.reason,
          toWarehouseId: input.toWarehouseId,
          transferItemId: input.transferItemId,
        },
        occurredAt: input.occurredAt,
      },
    });
  }
}
