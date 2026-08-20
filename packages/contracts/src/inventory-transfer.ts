import type { WarehouseSummary } from './inventory-read.js';

export const inventoryMovementTypes = [
  'INITIAL_BALANCE',
  'LEGACY',
  'RECEIPT',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'SALE',
  'SALE_CANCELLATION',
] as const;

export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

export interface InventoryMovementActor {
  id: string;
  displayName: string;
}

export interface InventoryMovementTransferInfo {
  transferId: string;
  transferItemId: string;
  fromWarehouse: WarehouseSummary;
  toWarehouse: WarehouseSummary;
}

export interface InventoryMovementView {
  id: string;
  product: { id: string; code: string; name: string };
  warehouse: WarehouseSummary;
  type: InventoryMovementType;
  quantityDelta: string;
  balanceBefore: string;
  balanceAfter: string;
  sourceType: string | null;
  sourceId: string | null;
  observation: string | null;
  actor: InventoryMovementActor | null;
  occurredAt: string;
  createdAt: string;
  transfer: InventoryMovementTransferInfo | null;
}

export interface InventoryTransferRequest {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  reason: string;
}

export interface InventoryTransferResult {
  transferId: string;
  transferItemId: string;
  product: { id: string; code: string; name: string };
  fromWarehouse: WarehouseSummary;
  toWarehouse: WarehouseSummary;
  quantity: string;
  reason: string;
  originBalanceBefore: string;
  originBalanceAfter: string;
  destinationBalanceBefore: string;
  destinationBalanceAfter: string;
  stockTotal: string;
  occurredAt: string;
  movements: {
    outId: string;
    inId: string;
  };
}

export type InventoryTransferPublicErrorCode =
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVENTORY_TRANSFER_CONFLICT'
  | 'INVENTORY_TRANSFER_INSUFFICIENT_STOCK'
  | 'INVENTORY_TRANSFER_INVALID'
  | 'INVENTORY_TRANSFER_PRODUCT_NOT_FOUND'
  | 'INVENTORY_TRANSFER_SOURCE_BALANCE_NOT_FOUND'
  | 'INVENTORY_TRANSFER_WAREHOUSE_NOT_FOUND';
