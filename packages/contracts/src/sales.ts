import type { WarehouseSummary } from './inventory-read.js';

/** Mirrors the persisted `sale_status` enum; `LEGACY_UNKNOWN` is legacy-only. */
export const saleStatuses = [
  'LEGACY_UNKNOWN',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
] as const;
export type SaleStatus = (typeof saleStatuses)[number];

export const saleOrigins = ['OPERATIONAL', 'LEGACY_IMPORT'] as const;
export type SaleOrigin = (typeof saleOrigins)[number];

export const salePaymentStatuses = ['PENDING', 'PAID', 'UNKNOWN'] as const;
export type SalePaymentStatus = (typeof salePaymentStatuses)[number];

/**
 * The bounded initial status a client may request when creating a sale.
 * The server never accepts `CANCELLED`, `paymentStatus`, `saleNumber`,
 * `origin`, or any calculated money field; those are server-owned.
 */
export const saleCreationStatuses = ['IN_TRANSIT', 'COMPLETED'] as const;
export type SaleCreationStatus = (typeof saleCreationStatuses)[number];

export interface CreateSaleItemRequest {
  productId: string;
  warehouseId: string;
  /** Decimal(18,4) string, strictly greater than zero. */
  quantity: string;
  /**
   * Optional Decimal(18,2) non-negative override. Omission uses the locked
   * `InventoryBalance.currentUnitPrice` reference (ADR-009).
   */
  unitPrice?: string;
}

export interface CreateSaleRequest {
  /** Civil date in America/Managua, `YYYY-MM-DD`. */
  businessDate: string;
  items: CreateSaleItemRequest[];
  /** Optional active user; omission is persisted as null. */
  sellerUserId?: string;
  /** Optional Decimal(18,2) non-negative amount; canonical default `0.00`. */
  shippingAmount?: string;
  status: SaleCreationStatus;

  /**
   * Operational logistics captured at the counter. FASE 7A created these
   * columns to preserve legacy text on import; the business also needs them
   * for new sales, so they are writable here and blank when unknown.
   */
  salesChannelText?: string;
  delivererText?: string;
  deliveryPlace?: string;
  paymentMethodText?: string;
  observations?: string;
  /** Instant the order left with the courier, when it leaves on creation. */
  departureAt?: string;
}

/**
 * Read-safe view of a sale line. `unitCostSnapshot` is intentionally absent:
 * `sales.read` grants no financial permission (ADR-009, AGENTS.md).
 *
 * Money fields always carry two decimals. Quantity does not: it is emitted as
 * persisted, so an equivalent value may appear as `3`, `2.5`, or `2.5000`.
 * Parse decimals by value, never by string equality.
 */
export interface SaleItemView {
  id: string;
  product: { id: string; code: string; name: string };
  warehouse: WarehouseSummary;
  /** Decimal(18,4) with at most four decimals; scale is not normalized. */
  quantity: string;
  /** Always present for operational lines; a legacy line may have none. */
  unitPriceSnapshot: string | null;
  lineSubtotal: string;
  shippingAllocation: string;
}

export interface SaleView {
  id: string;
  saleNumber: string;
  origin: SaleOrigin;
  businessDate: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  sellerUserId: string | null;
  currencyCode: string;
  shippingAmount: string;
  subtotal: string;
  total: string;
  items: SaleItemView[];
  departureAt: string | null;
  completedAt: string | null;
  createdAt: string;

  salesChannelText: string | null;
  delivererText: string | null;
  paymentMethodText: string | null;
  observations: string | null;
  /**
   * Delivery address. Read here because the courier needs it, but deliberately
   * absent from every report and CSV export: a single order is operational,
   * a bulk export of customer addresses is not (FASE 9 plan section 5).
   */
  deliveryPlace: string | null;
}

export type SalesPublicErrorCode =
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'SALES_PERMISSION_DENIED'
  | 'SALES_REQUEST_INVALID'
  | 'SALE_BALANCE_NOT_FOUND'
  | 'SALE_CONCURRENCY_CONFLICT'
  | 'SALE_COST_MISSING'
  | 'SALE_INSUFFICIENT_STOCK'
  | 'SALE_INVALID_STATE'
  | 'SALE_NOT_FOUND'
  | 'SALE_PRICE_MISSING'
  | 'SALE_PRODUCT_UNAVAILABLE'
  | 'SALE_REFERENCE_VALUE_INVALID'
  | 'SALE_WAREHOUSE_UNAVAILABLE';
