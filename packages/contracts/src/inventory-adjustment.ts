export type InventoryAdjustmentRequest = {
  productId: string;
  warehouseId: string;
  quantityDelta: string;
  reason: string;
};

export type InventoryAdjustmentResult = {
  movementId: string;
  product: {
    id: string;
    code: string;
    name: string;
  };
  warehouse: {
    id: string;
    code: string;
    name: string;
  };
  balanceBefore: string;
  quantityDelta: string;
  balanceAfter: string;
  occurredAt: string;
};

export type InventoryAdjustmentPublicErrorCode =
  | 'INVENTORY_ADJUSTMENT_CONFLICT'
  | 'INVENTORY_ADJUSTMENT_INVALID'
  | 'INVENTORY_BALANCE_NOT_FOUND'
  | 'INVENTORY_NEGATIVE_BALANCE'
  | 'INVENTORY_PRODUCT_NOT_FOUND'
  | 'INVENTORY_WAREHOUSE_NOT_FOUND';
