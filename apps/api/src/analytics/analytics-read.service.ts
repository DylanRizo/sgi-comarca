import type {
  ChannelPoint,
  InventoryAnalytics,
  LowStockAlert,
  SalesAnalytics,
  SalesPeriodPoint,
  SellerPoint,
  TopProductPoint,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { centsToMoney, moneyToCents } from '../common/money.js';
import {
  inventoryDecimalString,
  inventoryScaledInteger,
} from '../inventory/inventory-quantity.js';
import { stockValueCents } from '../reports/report-stock-value.js';
import {
  calculateMargin,
  coverageOf,
  periodStart,
  ratioString,
  type MarginLine,
} from './analytics-margin.js';
import type { SalesAnalyticsQueryDto } from './dto/analytics-query.dto.js';

/** Widest period analytics will aggregate in one request. */
export const maximumAnalyticsDays = 366;

export class AnalyticsError extends Error {
  constructor(
    readonly code: 'ANALYTICS_RANGE_INVALID' | 'ANALYTICS_RANGE_TOO_WIDE',
  ) {
    super(`Analytics request failed with ${code}.`);
    this.name = 'AnalyticsError';
  }
}

/**
 * FASE 9B.3 analytics reads.
 *
 * Every method is a pure read. `includeMoney` comes from an explicit
 * `finances.read` check in the controller; when false every monetary field is
 * emitted as null, so `analytics.read` alone never discloses revenue, value,
 * profit, or margin (plan §2).
 */
export class AnalyticsReadService {
  constructor(private readonly database: DatabaseClient) {}

  async inventory(includeMoney: boolean): Promise<InventoryAnalytics> {
    const [warehouses, catalogProducts, balances] = await Promise.all([
      this.database.warehouse.count({ where: { active: true } }),
      this.database.product.count({ where: { active: true } }),
      this.database.inventoryBalance.findMany({
        orderBy: [{ product: { code: 'asc' } }],
        select: {
          costReviewRequired: true,
          currentUnitCost: true,
          priceReviewRequired: true,
          product: {
            select: { code: true, id: true, minimumStock: true, name: true },
          },
          productId: true,
          quantity: true,
          warehouse: { select: { code: true, name: true } },
        },
      }),
    ]);

    const products = new Set<string>();
    const stocked = new Set<string>();
    const lowStock: LowStockAlert[] = [];
    let outOfStock = 0;
    let costReview = 0;
    let priceReview = 0;
    let valued = 0;
    let totalValue = 0n;

    for (const balance of balances) {
      products.add(balance.productId);
      const quantity = balance.quantity.toFixed(4);
      const scaled = inventoryScaledInteger(quantity) ?? 0n;
      if (scaled === 0n) outOfStock += 1;
      else stocked.add(balance.productId);
      if (balance.costReviewRequired) costReview += 1;
      if (balance.priceReviewRequired) priceReview += 1;

      // A minimum of zero is the default and means nobody set one, so it is not
      // a threshold to alert on.
      const minimum = balance.product.minimumStock.toFixed(4);
      const scaledMinimum = inventoryScaledInteger(minimum) ?? 0n;
      if (scaledMinimum > 0n && scaled <= scaledMinimum) {
        lowStock.push({
          minimumStock: minimum,
          productCode: balance.product.code,
          productId: balance.product.id,
          productName: balance.product.name,
          quantity,
          warehouseCode: balance.warehouse.code,
          warehouseName: balance.warehouse.name,
        });
      }

      // A cost flagged for review is not a cost: pricing stock with it would
      // report a valuation the business has already said it cannot trust.
      if (balance.costReviewRequired || balance.currentUnitCost === null) {
        continue;
      }
      const value = stockValueCents(
        quantity,
        balance.currentUnitCost.toFixed(2),
      );
      if (value === null) continue;
      totalValue += value;
      valued += 1;
    }

    return {
      availability:
        catalogProducts === 0
          ? null
          : ratioString(BigInt(stocked.size), BigInt(catalogProducts)),
      catalogProducts,
      costReviewCount: costReview,
      distinctProducts: products.size,
      lowStock,
      outOfStockCount: outOfStock,
      priceReviewCount: priceReview,
      totalValue: includeMoney ? centsToMoney(totalValue) : null,
      valuationCoverage: includeMoney
        ? coverageOf(valued, balances.length)
        : null,
      warehouses,
    };
  }

  async sales(
    input: SalesAnalyticsQueryDto,
    includeMoney: boolean,
  ): Promise<SalesAnalytics> {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.to}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
      throw new AnalyticsError('ANALYTICS_RANGE_INVALID');
    }
    if (toExclusive < from) throw new AnalyticsError('ANALYTICS_RANGE_INVALID');
    const spanDays =
      (toExclusive.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) + 1;
    if (spanDays > maximumAnalyticsDays) {
      throw new AnalyticsError('ANALYTICS_RANGE_TOO_WIDE');
    }
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    // Only completed sales carry meaning for revenue and margin; an in-transit
    // or cancelled sale has not earned anything. The status/business-date index
    // backs exactly this filter.
    const sales = await this.database.sale.findMany({
      select: {
        businessDate: true,
        id: true,
        salesChannelText: true,
        seller: { select: { displayName: true } },
        items: {
          select: {
            lineSubtotal: true,
            product: { select: { code: true, id: true, name: true } },
            quantity: true,
            unitCostSnapshot: true,
          },
        },
        sellerUserId: true,
        total: true,
      },
      where: {
        businessDate: { gte: from, lt: toExclusive },
        status: 'COMPLETED',
      },
    });

    const periods = new Map<
      string,
      { revenue: bigint; sales: number; units: bigint }
    >();
    const sellers = new Map<
      string,
      { name: string; revenue: bigint; sales: number }
    >();
    const channels = new Map<string, { revenue: bigint; sales: number }>();
    const products = new Map<
      string,
      { code: string; name: string; revenue: bigint; units: bigint }
    >();
    const marginLines: MarginLine[] = [];

    for (const sale of sales) {
      const bucket = periodStart(sale.businessDate, input.granularity);
      const saleTotal = moneyToCents(sale.total.toFixed(2)) ?? 0n;

      const period = periods.get(bucket) ?? {
        revenue: 0n,
        sales: 0,
        units: 0n,
      };
      period.revenue += saleTotal;
      period.sales += 1;

      const sellerKey = sale.sellerUserId ?? '';
      const seller = sellers.get(sellerKey) ?? {
        name: sale.seller?.displayName ?? 'Sin vendedor',
        revenue: 0n,
        sales: 0,
      };
      seller.revenue += saleTotal;
      seller.sales += 1;
      sellers.set(sellerKey, seller);

      // A blank channel is reported as unstated rather than dropped: knowing
      // how many orders arrived through no recorded channel is itself useful.
      const channelKey =
        (sale.salesChannelText ?? '').trim() || 'No especificado';
      const channel = channels.get(channelKey) ?? { revenue: 0n, sales: 0 };
      channel.revenue += saleTotal;
      channel.sales += 1;
      channels.set(channelKey, channel);

      for (const item of sale.items) {
        const quantity = inventoryScaledInteger(item.quantity.toFixed(4)) ?? 0n;
        const revenue = moneyToCents(item.lineSubtotal.toFixed(2)) ?? 0n;
        period.units += quantity;

        const product = products.get(item.product.id) ?? {
          code: item.product.code,
          name: item.product.name,
          revenue: 0n,
          units: 0n,
        };
        product.revenue += revenue;
        product.units += quantity;
        products.set(item.product.id, product);

        // DEC-015: a cost is trustworthy only when it is present and non-zero.
        // The data holds zero costs precisely as a review flag, so treating one
        // as real would report the whole line as pure profit.
        const rawCost = item.unitCostSnapshot;
        const costCents =
          rawCost === null ? null : (moneyToCents(rawCost.toFixed(2)) ?? null);
        const trustworthy =
          costCents !== null && costCents > 0n
            ? (costCents * quantity) / 10_000n
            : null;
        marginLines.push({ costCents: trustworthy, revenueCents: revenue });
      }

      periods.set(bucket, period);
    }

    const margin = calculateMargin(marginLines);
    const totalRevenue = [...periods.values()].reduce(
      (sum, period) => sum + period.revenue,
      0n,
    );

    const periodPoints: SalesPeriodPoint[] = [...periods.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, value]) => ({
        period,
        revenue: includeMoney ? centsToMoney(value.revenue) : null,
        saleCount: value.sales,
        unitsSold: inventoryDecimalString(value.units),
      }));

    const totalUnits = [...products.values()].reduce(
      (sum, value) => sum + value.units,
      0n,
    );
    const topProducts: TopProductPoint[] = [...products.entries()]
      .sort(([, left], [, right]) => (right.units > left.units ? 1 : -1))
      .slice(0, 10)
      .map(([productId, value]) => ({
        productCode: value.code,
        productId,
        productName: value.name,
        revenue: includeMoney ? centsToMoney(value.revenue) : null,
        unitsShare:
          totalUnits === 0n
            ? '0.0000'
            : (ratioString(value.units, totalUnits) ?? '0.0000'),
        unitsSold: inventoryDecimalString(value.units),
      }));

    const bySeller: SellerPoint[] = [...sellers.entries()]
      .sort(([, left], [, right]) =>
        right.revenue === left.revenue
          ? right.sales - left.sales
          : right.revenue > left.revenue
            ? 1
            : -1,
      )
      .map(([sellerUserId, value]) => ({
        averageTicket:
          includeMoney && value.sales > 0
            ? centsToMoney(value.revenue / BigInt(value.sales))
            : null,
        revenue: includeMoney ? centsToMoney(value.revenue) : null,
        saleCount: value.sales,
        sellerName: value.name,
        sellerUserId: sellerUserId === '' ? null : sellerUserId,
      }));

    const byChannel: ChannelPoint[] = [...channels.entries()]
      .sort(([, left], [, right]) => right.sales - left.sales)
      .map(([channel, value]) => ({
        channel,
        revenue: includeMoney ? centsToMoney(value.revenue) : null,
        saleCount: value.sales,
        share:
          sales.length === 0
            ? '0.0000'
            : (ratioString(BigInt(value.sales), BigInt(sales.length)) ??
              '0.0000'),
      }));

    return {
      averageTicket:
        includeMoney && sales.length > 0
          ? centsToMoney(totalRevenue / BigInt(sales.length))
          : null,
      byChannel,
      bySeller,
      cost: includeMoney ? centsToMoney(margin.costCents) : null,
      granularity: input.granularity,
      grossProfit:
        includeMoney && margin.grossProfitCents !== null
          ? centsToMoney(margin.grossProfitCents)
          : null,
      marginCoverage: margin.coverage,
      marginRatio: includeMoney ? margin.ratio : null,
      periods: periodPoints,
      saleCount: sales.length,
      topProducts,
      totalRevenue: includeMoney ? centsToMoney(totalRevenue) : null,
    };
  }
}
