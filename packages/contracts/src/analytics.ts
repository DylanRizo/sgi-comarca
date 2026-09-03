/**
 * FASE 9B.3 analytics contracts.
 *
 * Analytics is a pure read. Two rules shape these types.
 *
 * Money is separated from operations: every monetary field is nullable and is
 * only populated for an actor who also holds `finances.read`, so
 * `analytics.read` alone never discloses revenue, value, profit, or margin
 * (plan §2).
 *
 * Margin declares its coverage instead of averaging silently. DEC-015 keeps
 * margin valid only where cost is trustworthy, and the data contains zero
 * costs flagged for review. `MarginCoverage` therefore reports how much of the
 * period the margin actually explains, so a partial figure can never be read
 * as a complete one.
 */

export interface MarginCoverage {
  /** Sale lines whose cost was trustworthy and entered the margin. */
  coveredLines: number;
  /** Sale lines excluded because their cost is absent or flagged for review. */
  excludedLines: number;
  /**
   * Covered share of the period, `0`–`1`, rounded to four decimals. `null`
   * when the period has no lines at all, which is not the same as zero
   * coverage.
   */
  ratio: string | null;
  totalLines: number;
}

export interface InventoryAnalytics {
  /** Balances whose cost is flagged for review; excluded from any valuation. */
  costReviewCount: number;
  distinctProducts: number;
  /** Balances at exactly zero, the stock-out alert. */
  outOfStockCount: number;
  priceReviewCount: number;
  /** Active products in the catalogue, whether or not they hold stock. */
  catalogProducts: number;
  /**
   * Share of the catalogue that currently has stock somewhere, `0`–`1`, four
   * decimals. Null when the catalogue is empty, which is not zero availability.
   * Not money, so it needs no financial permission.
   */
  availability: string | null;
  /** Balances at or below their product's minimum. Quantities, not money. */
  lowStock: readonly LowStockAlert[];
  /** Null unless the actor holds `finances.read`. */
  totalValue: string | null;
  /**
   * Share of balances a valuation could price, mirroring the margin rule: a
   * total that prices only part of the stock must say so. Null without
   * `finances.read`.
   */
  valuationCoverage: MarginCoverage | null;
  warehouses: number;
}

export interface SalesPeriodPoint {
  /** Period start as an ISO date. */
  period: string;
  saleCount: number;
  /** Null unless the actor holds `finances.read`. */
  revenue: string | null;
  unitsSold: string;
}

export interface TopProductPoint {
  productCode: string;
  productId: string;
  productName: string;
  /** Null unless the actor holds `finances.read`. */
  revenue: string | null;
  unitsSold: string;
  /** Share of the period's units, `0`–`1`, four decimals. Not money. */
  unitsShare: string;
}

export interface SellerPoint {
  saleCount: number;
  sellerUserId: string | null;
  /** Display name, or a stated placeholder when the sale named no seller. */
  sellerName: string;
  /** Null unless the actor holds `finances.read`. */
  revenue: string | null;
  /** Revenue divided by sales, so a high total earned on volume reads
   * differently from one earned on few large orders. Money-gated. */
  averageTicket: string | null;
}

/**
 * Sales grouped by the channel they came through. `share` is of sale count, not
 * money, so it stays visible without `finances.read`: knowing that most orders
 * arrive by WhatsApp is operational, not financial.
 */
export interface ChannelPoint {
  channel: string;
  saleCount: number;
  /** Share of the period's sale count, `0`–`1`, four decimals. */
  share: string;
  /** Null unless the actor holds `finances.read`. */
  revenue: string | null;
}

/** A balance at or below its product's minimum, worth restocking. */
export interface LowStockAlert {
  productId: string;
  productCode: string;
  productName: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: string;
  minimumStock: string;
}

export interface SalesAnalytics {
  bySeller: readonly SellerPoint[];
  /** Null unless the actor holds `finances.read`. */
  cost: string | null;
  /**
   * Revenue minus cost over covered lines only. Null without `finances.read`,
   * and also null when no line in the period had a trustworthy cost.
   */
  grossProfit: string | null;
  granularity: 'day' | 'month' | 'week';
  /** `grossProfit / coveredRevenue`, `0`–`1`, four decimals. */
  marginRatio: string | null;
  marginCoverage: MarginCoverage;
  periods: readonly SalesPeriodPoint[];
  saleCount: number;
  topProducts: readonly TopProductPoint[];
  byChannel: readonly ChannelPoint[];
  /** Null unless the actor holds `finances.read`. */
  totalRevenue: string | null;
  /** Revenue over sale count. Null without `finances.read`, and null when the
   * period has no sales, which is not a ticket of zero. */
  averageTicket: string | null;
}

export type AnalyticsPublicErrorCode =
  'ANALYTICS_RANGE_INVALID' | 'ANALYTICS_RANGE_TOO_WIDE';
