import type {
  FinanceReportRow,
  InventoryReportRow,
  MovementReportRow,
  PaginatedData,
  SalesReportRow,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { centsToMoney } from '../common/money.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import type {
  FinanceReportQueryDto,
  InventoryReportQueryDto,
  MovementReportQueryDto,
  SalesReportQueryDto,
} from './dto/report-query.dto.js';
import { stockValueCents } from './report-stock-value.js';

interface DecimalValue {
  toFixed(decimalPlaces?: number): string;
  toString(): string;
}

/**
 * Reports pin the decimal scale instead of using the bare `toFixed()` the JSON
 * read surfaces use. A report is tabular output destined for a spreadsheet, so
 * a cost must read `4.00` next to a value of `50.00`; letting one column drop
 * its trailing zeros while a computed one keeps them looks like a data error
 * to the person reading the export.
 */
const quantityScale = 4;
const moneyScale = 2;

function decimal(value: DecimalValue | null, scale: number): string | null {
  return value === null ? null : value.toFixed(scale);
}

/**
 * Inclusive civil-date range, expressed as the half-open instant range the
 * date columns need. The upper bound moves to the following day and stays
 * exclusive, so `to` includes everything recorded on that date.
 */
function dateRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const upper = new Date(`${to}T00:00:00.000Z`);
    upper.setUTCDate(upper.getUTCDate() + 1);
    range.lt = upper;
  }
  return range;
}

/**
 * FASE 9B.2 report reads.
 *
 * Every method is a pure read. None selects `unitCostSnapshot`, an idempotency
 * or request hash, a delivery place, or legacy free text, so a report cannot
 * disclose what the FASE 7B sales reads already refuse to expose (plan §5).
 *
 * `includeMoney` is passed by the controller from an explicit `finances.read`
 * check. When false the monetary columns are emitted as null rather than
 * dropped, so a CSV keeps one stable column set regardless of who exports it.
 */
export class ReportReadService {
  constructor(private readonly database: DatabaseClient) {}

  async inventory(
    input: InventoryReportQueryDto,
    includeMoney: boolean,
  ): Promise<PaginatedData<InventoryReportRow>> {
    const search = input.search;
    const where = {
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(search
        ? {
            product: {
              OR: [
                { code: { contains: search, mode: 'insensitive' as const } },
                { name: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.database.inventoryBalance.count({ where }),
      this.database.inventoryBalance.findMany({
        orderBy: [{ product: { code: 'asc' } }, { warehouse: { code: 'asc' } }],
        select: {
          currentUnitCost: true,
          product: { select: { code: true, id: true, name: true } },
          quantity: true,
          warehouse: { select: { code: true, id: true, name: true } },
        },
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);

    const items = rows.map((row): InventoryReportRow => {
      const quantity = row.quantity.toFixed(quantityScale);
      const unitCost = includeMoney
        ? decimal(row.currentUnitCost, moneyScale)
        : null;
      const value =
        unitCost === null ? null : stockValueCents(quantity, unitCost);
      return {
        productCode: row.product.code,
        productId: row.product.id,
        productName: row.product.name,
        quantity,
        stockValue: value === null ? null : centsToMoney(value),
        unitCost,
        warehouseCode: row.warehouse.code,
        warehouseId: row.warehouse.id,
        warehouseName: row.warehouse.name,
      };
    });

    return pageResult(items, totalItems, input);
  }

  async movements(
    input: MovementReportQueryDto,
  ): Promise<PaginatedData<MovementReportRow>> {
    const occurredAt = dateRange(input.from, input.to);
    const where = {
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.type ? { type: input.type as never } : {}),
      ...(occurredAt ? { occurredAt } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.database.inventoryMovement.count({ where }),
      this.database.inventoryMovement.findMany({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: {
          balanceAfter: true,
          id: true,
          occurredAt: true,
          product: { select: { code: true, name: true } },
          quantityDelta: true,
          sourceType: true,
          type: true,
          warehouse: { select: { code: true, name: true } },
        },
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);

    const items = rows.map((row): MovementReportRow => ({
      balanceAfter: row.balanceAfter.toFixed(quantityScale),
      movementId: row.id,
      occurredAt: row.occurredAt.toISOString(),
      productCode: row.product.code,
      productName: row.product.name,
      quantityDelta: row.quantityDelta.toFixed(quantityScale),
      sourceType: row.sourceType,
      type: row.type,
      warehouseCode: row.warehouse.code,
      warehouseName: row.warehouse.name,
    }));

    return pageResult(items, totalItems, input);
  }

  async sales(
    input: SalesReportQueryDto,
  ): Promise<PaginatedData<SalesReportRow>> {
    const businessDate = dateRange(input.from, input.to);
    const where = {
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.sellerUserId ? { sellerUserId: input.sellerUserId } : {}),
      ...(input.warehouseId
        ? { items: { some: { warehouseId: input.warehouseId } } }
        : {}),
      ...(businessDate ? { businessDate } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.database.sale.count({ where }),
      this.database.sale.findMany({
        orderBy: [{ businessDate: 'desc' }, { saleNumber: 'desc' }],
        select: {
          _count: { select: { items: true } },
          businessDate: true,
          currencyCode: true,
          id: true,
          paymentStatus: true,
          saleNumber: true,
          sellerUserId: true,
          shippingAmount: true,
          status: true,
          subtotal: true,
          total: true,
        },
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);

    const items = rows.map((row): SalesReportRow => ({
      businessDate: row.businessDate.toISOString().slice(0, 10),
      currencyCode: row.currencyCode,
      itemCount: row._count.items,
      paymentStatus: row.paymentStatus,
      saleId: row.id,
      saleNumber: row.saleNumber,
      sellerUserId: row.sellerUserId,
      shippingAmount: row.shippingAmount.toFixed(moneyScale),
      status: row.status,
      subtotal: row.subtotal.toFixed(moneyScale),
      total: row.total.toFixed(moneyScale),
    }));

    return pageResult(items, totalItems, input);
  }

  async finances(
    input: FinanceReportQueryDto,
  ): Promise<PaginatedData<FinanceReportRow>> {
    const businessDate = dateRange(input.from, input.to);
    const where = {
      ...(input.entryType ? { entryType: input.entryType as never } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.origin ? { origin: input.origin as never } : {}),
      ...(businessDate ? { businessDate } : {}),
    };

    const [totalItems, rows] = await Promise.all([
      this.database.financialEntry.count({ where }),
      this.database.financialEntry.findMany({
        orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          amount: true,
          businessDate: true,
          category: { select: { code: true, name: true } },
          currencyCode: true,
          description: true,
          entryType: true,
          id: true,
          origin: true,
        },
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);

    const items = rows.map((row): FinanceReportRow => ({
      amount: row.amount.toFixed(moneyScale),
      businessDate: row.businessDate.toISOString().slice(0, 10),
      categoryCode: row.category?.code ?? null,
      categoryName: row.category?.name ?? null,
      currencyCode: row.currencyCode,
      description: row.description,
      entryId: row.id,
      entryType: row.entryType,
      origin: row.origin,
    }));

    return pageResult(items, totalItems, input);
  }
}
