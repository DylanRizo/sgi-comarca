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
}

export interface SellerPoint {
  saleCount: number;
  sellerUserId: string | null;
  /** Null unless the actor holds `finances.read`. */
  revenue: string | null;
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
  /** Null unless the actor holds `finances.read`. */
  totalRevenue: string | null;
}

export type AnalyticsPublicErrorCode =
  'ANALYTICS_RANGE_INVALID' | 'ANALYTICS_RANGE_TOO_WIDE';
