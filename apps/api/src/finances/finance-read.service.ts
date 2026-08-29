import type {
  DailyClosingView,
  FinanceLineView,
  FinanceTotalsView,
  FinancialCategoryView,
  PaginatedData,
} from '@sgi/contracts';
import type { DatabaseClient, Prisma } from '@sgi/database';

import { centsToMoney, moneyToCents } from '../common/money.js';
import { pageOffset, pageResult } from '../common/pagination.js';
import type {
  DailyClosingQueryDto,
  FinanceLineQueryDto,
} from './dto/finance-query.dto.js';
import { FinanceError } from './finance.errors.js';

interface LineRow {
  id: string;
  source: 'MANUAL' | 'SALE';
  entry_type: 'EXPENSE' | 'INCOME';
  business_date: Date;
  amount: string;
  currency_code: string;
  description: string | null;
  responsible_user_id: string | null;
  sale_id: string | null;
  sale_number: string | null;
  created_at: Date | null;
  category_id: string | null;
}

/**
 * The merged source of finance lines (ADR-010, DEC-022).
 *
 * Manual entries are persisted; sale income is derived here and never stored,
 * so it cannot be double counted and cancelling a sale removes its line on its
 * own. Only `COMPLETED` sales count as income: in-transit and cancelled ones
 * never do.
 */
const financeLineUnion = `
  SELECT
    entry.id::text AS id,
    'MANUAL' AS source,
    entry.entry_type,
    entry.business_date,
    entry.amount::text AS amount,
    entry.currency_code,
    entry.description,
    entry.responsible_user_id::text AS responsible_user_id,
    NULL::text AS sale_id,
    NULL::text AS sale_number,
    entry.created_at,
    entry.category_id::text AS category_id
  FROM financial_entries entry
  UNION ALL
  SELECT
    sale.id::text AS id,
    'SALE' AS source,
    'INCOME'::financial_entry_type AS entry_type,
    sale.business_date,
    sale.total::text AS amount,
    sale.currency_code,
    NULL::varchar AS description,
    sale.seller_user_id::text AS responsible_user_id,
    sale.id::text AS sale_id,
    sale.sale_number AS sale_number,
    sale.created_at,
    NULL::text AS category_id
  FROM sales sale
  WHERE sale.status = 'COMPLETED'
`;

const financeLineFilters = `
  WHERE ($1::date IS NULL OR line.business_date >= $1::date)
    AND ($2::date IS NULL OR line.business_date <= $2::date)
    AND ($3::text IS NULL OR line.entry_type::text = $3::text)
    AND ($4::text IS NULL OR line.source = $4::text)
    AND ($5::uuid IS NULL OR line.category_id::uuid = $5::uuid)
`;

const closingSelect = {
  balanced: true,
  businessDate: true,
  closedAt: true,
  closedByUserId: true,
  currencyCode: true,
  difference: true,
  id: true,
  inTransitSaleCount: true,
  observations: true,
  origin: true,
  realCash: true,
  realDigital: true,
  reopenings: {
    orderBy: [{ reopenedAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      reason: true,
      reopenedAt: true,
      reopenedByUserId: true,
    },
  },
  status: true,
  systemSales: true,
  toleranceApplied: true,
} satisfies Prisma.DailyClosingSelect;

type ClosingRow = Prisma.DailyClosingGetPayload<{
  select: typeof closingSelect;
}>;

/**
 * `business_date` is a PostgreSQL `DATE`; Prisma returns UTC midnight. Render
 * the civil date without a timezone shift.
 */
function civilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Restore the canonical two-decimal scale that Prisma and PostgreSQL text
 * casts strip, preserving the sign a closing difference can carry.
 */
function money(value: string): string {
  const negative = value.startsWith('-');
  const cents = moneyToCents(negative ? value.slice(1) : value);
  if (cents === null) {
    throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
  }
  return centsToMoney(negative ? -cents : cents);
}

function mapClosing(row: ClosingRow): DailyClosingView {
  return {
    balanced: row.balanced,
    businessDate: civilDate(row.businessDate),
    closedAt: row.closedAt.toISOString(),
    closedByUserId: row.closedByUserId,
    currencyCode: row.currencyCode,
    difference: money(row.difference.toString()),
    id: row.id,
    inTransitSaleCount: row.inTransitSaleCount,
    observations: row.observations,
    origin: row.origin,
    realCash: money(row.realCash.toString()),
    realDigital: money(row.realDigital.toString()),
    reopenings: row.reopenings.map((reopening) => ({
      id: reopening.id,
      reason: reopening.reason,
      reopenedAt: reopening.reopenedAt.toISOString(),
      reopenedByUserId: reopening.reopenedByUserId,
    })),
    status: row.status,
    systemSales: money(row.systemSales.toString()),
    toleranceApplied: money(row.toleranceApplied.toString()),
  };
}

export class FinanceReadService {
  constructor(private readonly database: DatabaseClient) {}

  async categories(): Promise<readonly FinancialCategoryView[]> {
    return this.database.financialCategory.findMany({
      orderBy: [{ entryType: 'asc' }, { name: 'asc' }],
      select: {
        active: true,
        code: true,
        entryType: true,
        id: true,
        name: true,
      },
    });
  }

  /**
   * Both sources are merged and paginated in one statement, so a page is a
   * real page of the combined result rather than two lists stitched together.
   */
  async lines(
    input: FinanceLineQueryDto,
  ): Promise<PaginatedData<FinanceLineView>> {
    const parameters = this.filterParameters(input);
    const [countRows, rows] = await Promise.all([
      this.database.$queryRawUnsafe<{ total: bigint }[]>(
        `SELECT count(*)::bigint AS total FROM (${financeLineUnion}) line ${financeLineFilters}`,
        ...parameters,
      ),
      this.database.$queryRawUnsafe<LineRow[]>(
        `SELECT line.* FROM (${financeLineUnion}) line ${financeLineFilters}
         ORDER BY line.business_date DESC, line.created_at DESC, line.id DESC
         LIMIT $6 OFFSET $7`,
        ...parameters,
        input.pageSize,
        pageOffset(input),
      ),
    ]);

    const categories = new Map(
      (await this.categories()).map((category) => [category.id, category]),
    );
    const items = rows.map((row) => lineView(row, categories));
    return pageResult(items, Number(countRows[0]?.total ?? 0n), input);
  }

  /**
   * Totals cover the whole filtered set, not only the current page, so the
   * operator sees the real income, expense and net for the period.
   */
  async totals(input: FinanceLineQueryDto): Promise<FinanceTotalsView> {
    const rows = await this.database.$queryRawUnsafe<
      { entry_type: 'EXPENSE' | 'INCOME'; total: string }[]
    >(
      `SELECT line.entry_type, coalesce(sum(line.amount::numeric), 0)::text AS total
       FROM (${financeLineUnion}) line ${financeLineFilters}
       GROUP BY line.entry_type`,
      ...this.filterParameters(input),
    );

    const byType = new Map(rows.map((row) => [row.entry_type, row.total]));
    const income = moneyToCents(byType.get('INCOME') ?? '0') ?? 0n;
    const expense = moneyToCents(byType.get('EXPENSE') ?? '0') ?? 0n;
    return {
      expense: centsToMoney(expense),
      income: centsToMoney(income),
      net: centsToMoney(income - expense),
    };
  }

  async closings(
    input: DailyClosingQueryDto,
  ): Promise<PaginatedData<DailyClosingView>> {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.to
        ? {
            businessDate: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.to ? { lte: new Date(input.to) } : {}),
            },
          }
        : {}),
    };
    const [totalItems, rows] = await Promise.all([
      this.database.dailyClosing.count({ where }),
      this.database.dailyClosing.findMany({
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
        select: closingSelect,
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);
    return pageResult(rows.map(mapClosing), totalItems, input);
  }

  async closing(id: string): Promise<DailyClosingView> {
    const row = await this.database.dailyClosing.findUnique({
      select: closingSelect,
      where: { id },
    });
    if (!row) throw new FinanceError('CLOSING_NOT_FOUND');
    return mapClosing(row);
  }

  private filterParameters(
    input: FinanceLineQueryDto,
  ): [Date | null, Date | null, string | null, string | null, string | null] {
    return [
      input.from ? new Date(input.from) : null,
      input.to ? new Date(input.to) : null,
      input.entryType ?? null,
      input.source ?? null,
      input.categoryId ?? null,
    ];
  }
}

function lineView(
  row: LineRow,
  categories: ReadonlyMap<string, FinancialCategoryView>,
): FinanceLineView {
  return {
    amount: money(row.amount),
    businessDate: civilDate(row.business_date),
    category: row.category_id
      ? (categories.get(row.category_id) ?? null)
      : null,
    createdAt: row.created_at?.toISOString() ?? null,
    currencyCode: row.currency_code,
    description: row.description,
    entryType: row.entry_type,
    id: row.id,
    responsibleUserId: row.responsible_user_id,
    saleId: row.sale_id,
    saleNumber: row.sale_number,
    source: row.source,
  };
}
