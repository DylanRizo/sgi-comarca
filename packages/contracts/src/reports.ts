/**
 * FASE 9B.2 report contracts.
 *
 * Reports are pure reads. No report route mutates data, and no report ever
 * emits `unitCostSnapshot`, idempotency or request hashes, delivery place, or
 * legacy free text, matching what the FASE 7B sales reads already refuse to
 * expose (plan section 5).
 *
 * Money is separated from operations: the valuation columns of the inventory
 * report are only populated for an actor who also holds `finances.read`, so
 * `reports.read` alone never discloses monetary value (plan section 2).
 */

export type ReportFormat = 'csv' | 'json';

export interface InventoryReportRow {
  productCode: string;
  productId: string;
  productName: string;
  quantity: string;
  /** Null unless the actor holds `finances.read`. */
  stockValue: string | null;
  /** Null unless the actor holds `finances.read`. */
  unitCost: string | null;
  warehouseCode: string;
  warehouseId: string;
  warehouseName: string;
}

export interface MovementReportRow {
  balanceAfter: string;
  movementId: string;
  occurredAt: string;
  productCode: string;
  productName: string;
  quantityDelta: string;
  sourceType: string | null;
  type: string;
  warehouseCode: string;
  warehouseName: string;
}

export interface SalesReportRow {
  businessDate: string;
  currencyCode: string;
  itemCount: number;
  paymentStatus: string;
  saleId: string;
  saleNumber: string;
  sellerUserId: string | null;
  shippingAmount: string;
  status: string;
  subtotal: string;
  total: string;
}

export interface FinanceReportRow {
  amount: string;
  businessDate: string;
  categoryCode: string | null;
  categoryName: string | null;
  currencyCode: string;
  description: string | null;
  entryId: string;
  entryType: string;
  origin: string;
}

export type ReportPublicErrorCode =
  | 'REPORT_MONEY_PERMISSION_DENIED'
  | 'REPORT_RANGE_INVALID'
  | 'REPORT_RANGE_TOO_WIDE';
