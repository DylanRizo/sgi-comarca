import type { WarehouseSummary } from './inventory-read.js';

export const inventoryCountSessionStatuses = [
  'OPEN',
  'PENDING_APPROVAL',
  'APPROVED',
  'CANCELLED',
] as const;

export type InventoryCountSessionStatus =
  (typeof inventoryCountSessionStatuses)[number];

export interface InventoryCountActor {
  id: string;
  displayName: string;
}

export interface InventoryCountLineView {
  id: string;
  product: { id: string; code: string; name: string };
  warehouse: WarehouseSummary;
  expectedQuantity: string;
  countedQuantity: string;
  difference: string;
  adjustmentMovementId: string | null;
  countedAt: string;
}

/**
 * A product/warehouse pair inside the declared scope that still has no counted
 * line. AT-AUD-02 requires reporting it as pending; it is never assumed zero
 * and never produces an adjustment.
 */
export interface InventoryCountPendingItem {
  product: { id: string; code: string; name: string };
  warehouse: WarehouseSummary;
  expectedQuantity: string;
}

export interface InventoryCountSessionView {
  id: string;
  status: InventoryCountSessionStatus;
  businessDate: string;
  reason: string;
  warehouses: WarehouseSummary[];
  lines: InventoryCountLineView[];
  pendingItems: InventoryCountPendingItem[];
  createdBy: InventoryCountActor;
  approvedBy: InventoryCountActor | null;
  cancelledBy: InventoryCountActor | null;
  cancellationReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface InventoryCountSessionSummary {
  id: string;
  status: InventoryCountSessionStatus;
  businessDate: string;
  reason: string;
  warehouses: WarehouseSummary[];
  lineCount: number;
  createdBy: InventoryCountActor;
  createdAt: string;
}

export interface CreateInventoryCountSessionRequest {
  businessDate: string;
  reason: string;
  warehouseIds: string[];
}

export interface CaptureInventoryCountLineRequest {
  productId: string;
  warehouseId: string;
  countedQuantity: string;
}

export interface CancelInventoryCountSessionRequest {
  reason: string;
}

export type InventoryCountPublicErrorCode =
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVENTORY_COUNT_ADJUSTMENT_FAILED'
  | 'INVENTORY_COUNT_APPROVER_CANNOT_ADJUST'
  | 'INVENTORY_COUNT_BALANCE_CHANGED'
  | 'INVENTORY_COUNT_CONFLICT'
  | 'INVENTORY_COUNT_INVALID_STATE'
  | 'INVENTORY_COUNT_LINE_ALREADY_CAPTURED'
  | 'INVENTORY_COUNT_NEGATIVE_BALANCE'
  | 'INVENTORY_COUNT_PERMISSION_DENIED'
  | 'INVENTORY_COUNT_PRODUCT_NOT_FOUND'
  | 'INVENTORY_COUNT_REQUEST_INVALID'
  | 'INVENTORY_COUNT_REQUIRES_LINES'
  | 'INVENTORY_COUNT_SESSION_NOT_FOUND'
  | 'INVENTORY_COUNT_WAREHOUSE_NOT_FOUND'
  | 'INVENTORY_COUNT_WAREHOUSE_OUT_OF_SCOPE';
