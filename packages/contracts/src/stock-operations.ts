import type {
  ProductDetail,
  UnitSummary,
  WarehouseSummary,
} from './inventory-read.js';

export interface ProductGroupView {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
export interface ProductInput {
  code: string;
  name: string;
  unitId: string;
  groupId: string;
  description?: string;
  minimumStock: string;
}
export interface ReceiptInput {
  productId: string;
  warehouseId: string;
  quantity: string;
  reason: string;
  unitCost?: string;
  unitPrice?: string;
}
export interface CreateProductInput extends ProductInput {
  initialReceipt?: Omit<ReceiptInput, 'productId'>;
}
export interface EditProductInput extends ProductInput {
  expectedUpdatedAt: string;
}
export interface ReceiptView {
  id: string;
  reason: string;
  occurredAt: string;
  actor: { id: string; displayName: string };
  items: {
    id: string;
    product: { id: string; code: string; name: string };
    warehouse: WarehouseSummary;
    quantity: string;
    unitCost: string | null;
    unitPrice: string | null;
    movementId: string;
    balanceBefore: string;
    balanceAfter: string;
  }[];
}
export interface ProductCreatedView {
  product: ProductDetail;
  receipt: ReceiptView | null;
}
export interface ProductCatalogs {
  units: UnitSummary[];
  groups: ProductGroupView[];
}
export interface PendingValuation {
  id: string;
  product: { id: string; code: string; name: string };
  warehouse: WarehouseSummary;
  quantity: string;
  unitCost: string | null;
  unitPrice: string | null;
  version: number;
}
export interface ValuationInput {
  expectedVersion: number;
  unitCost?: string;
  unitPrice?: string;
  reason: string;
}
export type StockOperationErrorCode =
  | 'STOCK_REQUEST_INVALID'
  | 'PRODUCT_CODE_DUPLICATE'
  | 'PRODUCT_HISTORY_LOCKED'
  | 'STOCK_RESOURCE_NOT_FOUND'
  | 'STOCK_PERMISSION_DENIED'
  | 'STOCK_OPERATION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED';
