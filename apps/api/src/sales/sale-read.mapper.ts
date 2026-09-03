import type {
  SaleItemView,
  SaleOrigin,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
} from '@sgi/contracts';

import { centsToMoney, moneyToCents } from './sale-money.js';

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
  salesChannelText: string | null;
  delivererText: string | null;
  deliveryPlace: string | null;
  paymentMethodText: string | null;
  observations: string | null;
}

/**
 * The persisted `business_date` is a PostgreSQL `DATE`; Prisma returns it as a
 * UTC midnight `Date`. Render the civil date without a timezone shift.
 */
function civilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Money carries a canonical `Decimal(18,2)` presentation, so it is routed
 * through cents to restore the trailing zeros Prisma strips. Quantity is
 * deliberately not canonicalized: the approved plan bounds it to at most four
 * decimals rather than exactly four, so it is emitted as persisted.
 */
function moneyString(value: DecimalLike): string {
  const cents = moneyToCents(value.toString());
  if (cents === null) {
    throw new Error('Persisted sale money is outside Decimal(18,2).');
  }
  return centsToMoney(cents);
}

function saleItemView(item: SaleItemRecord): SaleItemView {
  return {
    id: item.id,
    lineSubtotal: moneyString(item.lineSubtotal),
    product: item.product,
    quantity: item.quantity.toString(),
    shippingAllocation: moneyString(item.shippingAllocation),
    // Operational snapshots are mandatory; a legacy row may hold null.
    unitPriceSnapshot:
      item.unitPriceSnapshot === null
        ? null
        : moneyString(item.unitPriceSnapshot),
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
    delivererText: sale.delivererText,
    deliveryPlace: sale.deliveryPlace,
    departureAt: sale.departureAt?.toISOString() ?? null,
    id: sale.id,
    items: sale.items.map(saleItemView),
    observations: sale.observations,
    origin: sale.origin,
    paymentMethodText: sale.paymentMethodText,
    paymentStatus: sale.paymentStatus,
    saleNumber: sale.saleNumber,
    salesChannelText: sale.salesChannelText,
    sellerUserId: sale.sellerUserId,
    shippingAmount: moneyString(sale.shippingAmount),
    status: sale.status,
    subtotal: moneyString(sale.subtotal),
    total: moneyString(sale.total),
  };
}
