export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: readonly T[];
  pagination: PaginationMeta;
}

export interface UnitSummary {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface WarehouseSummary {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  minimumStock: string;
  active: boolean;
  unit: UnitSummary | null;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWarehouseValuationView {
  id: string;
  unitPrice: string | null;
  unitCost: string | null;
  currencyCode: string;
  observedAt: string;
  effectiveAt: string | null;
  requiresHumanReview: boolean;
}

export interface InventoryBalanceView {
  id: string;
  warehouse: WarehouseSummary;
  quantity: string;
  currentUnitPrice: string | null;
  currentUnitCost: string | null;
  priceReviewRequired: boolean;
  costReviewRequired: boolean;
  valuations: readonly ProductWarehouseValuationView[];
}

export interface ProductInventoryView {
  product: ProductDetail;
  totalQuantity: string;
  balances: readonly InventoryBalanceView[];
}
