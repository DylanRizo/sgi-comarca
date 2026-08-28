import type {
  SaleItemView,
  SaleOrigin,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
} from '@sgi/contracts';

interface DecimalLike {
  toString(): string;
}

interface WarehouseRecord {
  active: boolean;
  code: string;
  id: string;
  name: string;
}

export interface SaleItemRecord {
  id: string;
  product: { code: string; id: string; name: string };
  quantity: DecimalLike;
  lineSubtotal: DecimalLike;
  shippingAllocation: DecimalLike;
  unitPriceSnapshot: DecimalLike | null;
  warehouse: WarehouseRecord;
}

export interface SaleRecord {
  id: string;
  saleNumber: string;
  origin: SaleOrigin;
  businessDate: Date;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  sellerUserId: string | null;
  currencyCode: string;
  shippingAmount: DecimalLike;
  subtotal: DecimalLike;
  total: DecimalLike;
  departureAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  items: SaleItemRecord[];
}

/**
 * The persisted `business_date` is a PostgreSQL `DATE`; Prisma returns it as a
 * UTC midnight `Date`. Render the civil date without a timezone shift.
 */
function civilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function saleItemView(item: SaleItemRecord): SaleItemView {
  return {
    id: item.id,
    lineSubtotal: item.lineSubtotal.toString(),
    product: item.product,
    quantity: item.quantity.toString(),
    shippingAllocation: item.shippingAllocation.toString(),
    // Operational snapshots are mandatory; a legacy row may hold null.
    unitPriceSnapshot: item.unitPriceSnapshot?.toString() ?? null,
    warehouse: {
      active: item.warehouse.active,
      code: item.warehouse.code,
      id: item.warehouse.id,
      name: item.warehouse.name,
    },
  };
}

/**
 * Map a persisted sale to its read view.
 *
 * `unitCostSnapshot` is deliberately never read or emitted: `sales.read`
 * grants no financial permission (ADR-009). Idempotency and request hashes,
 * legacy free text, and delivery place are likewise never exposed.
 */
export function mapSale(sale: SaleRecord): SaleView {
  return {
    businessDate: civilDate(sale.businessDate),
    completedAt: sale.completedAt?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    currencyCode: sale.currencyCode,
    departureAt: sale.departureAt?.toISOString() ?? null,
    id: sale.id,
    items: sale.items.map(saleItemView),
    origin: sale.origin,
    paymentStatus: sale.paymentStatus,
    saleNumber: sale.saleNumber,
    sellerUserId: sale.sellerUserId,
    shippingAmount: sale.shippingAmount.toString(),
    status: sale.status,
    subtotal: sale.subtotal.toString(),
    total: sale.total.toString(),
  };
}
