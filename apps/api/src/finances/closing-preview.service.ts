import type {
  ClosingDayExpense,
  ClosingSellerContribution,
  DailyClosingPreviewView,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { centsToMoney, moneyToCents } from '../common/money.js';
import { daySalesFigures } from './daily-closing.service.js';

/** Cash and digital as the business writes them; anything else is unspecified. */
function paymentBucket(
  method: string | null,
): 'cash' | 'digital' | 'unspecified' {
  const normalized = (method ?? '').trim().toLowerCase();
  if (normalized === 'efectivo' || normalized === 'cash') return 'cash';
  if (normalized === 'digital') return 'digital';
  return 'unspecified';
}

function cents(value: { toFixed(places: number): string }): bigint {
  return moneyToCents(value.toFixed(2)) ?? 0n;
}

/**
 * The day's figures a partner needs before counting the drawer, which the
 * closing dialog previously did not show at all.
 *
 * This is a pure read. It creates nothing, and seeing a preview never commits
 * the partner to closing the day.
 */
export class ClosingPreviewService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tolerance: string,
  ) {}

  async preview(businessDate: string): Promise<DailyClosingPreviewView> {
    const date = new Date(`${businessDate}T00:00:00.000Z`);

    const [figures, existing, sales, expenses] = await Promise.all([
      daySalesFigures(this.database, businessDate),
      this.database.dailyClosing.findUnique({
        select: { id: true, status: true },
        where: { businessDate: date },
      }),
      this.database.sale.findMany({
        select: {
          paymentMethodText: true,
          seller: { select: { displayName: true } },
          sellerUserId: true,
          total: true,
        },
        where: { businessDate: date, status: 'COMPLETED' },
      }),
      this.database.financialEntry.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          amount: true,
          category: { select: { name: true } },
          description: true,
          id: true,
        },
        where: { businessDate: date, entryType: 'EXPENSE' },
      }),
    ]);

    // Grouped in the application rather than in SQL because the seller may be
    // absent and the payment method is free text: both need a named bucket the
    // screen can show, not a null the reader has to interpret.
    const bySeller = new Map<
      string,
      ClosingSellerContribution & {
        cash: bigint;
        digital: bigint;
        other: bigint;
      }
    >();

    for (const sale of sales) {
      const key = sale.sellerUserId ?? '';
      const entry = bySeller.get(key) ?? {
        cash: 0n,
        cashAmount: '0.00',
        digital: 0n,
        digitalAmount: '0.00',
        other: 0n,
        saleCount: 0,
        sellerName: sale.seller?.displayName ?? 'Sin vendedor',
        sellerUserId: sale.sellerUserId,
        totalAmount: '0.00',
        unspecifiedAmount: '0.00',
      };

      const amount = cents(sale.total);
      const bucket = paymentBucket(sale.paymentMethodText);
      if (bucket === 'cash') entry.cash += amount;
      else if (bucket === 'digital') entry.digital += amount;
      else entry.other += amount;
      entry.saleCount += 1;

      bySeller.set(key, entry);
    }

    const contributions: ClosingSellerContribution[] = [...bySeller.values()]
      .map((entry) => ({
        cashAmount: centsToMoney(entry.cash),
        digitalAmount: centsToMoney(entry.digital),
        saleCount: entry.saleCount,
        sellerName: entry.sellerName,
        sellerUserId: entry.sellerUserId,
        totalAmount: centsToMoney(entry.cash + entry.digital + entry.other),
        unspecifiedAmount: centsToMoney(entry.other),
      }))
      .sort((left, right) =>
        left.sellerName.localeCompare(right.sellerName, 'es'),
      );

    const dayExpenses: ClosingDayExpense[] = expenses.map((expense) => ({
      amount: expense.amount.toFixed(2),
      categoryName: expense.category?.name ?? null,
      description: expense.description,
      id: expense.id,
    }));

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + cents(expense.amount),
      0n,
    );

    return {
      alreadyClosed: existing !== null,
      businessDate,
      bySeller: contributions,
      dayExpenses,
      existingClosingId: existing?.id ?? null,
      existingClosingStatus: existing?.status ?? null,
      inTransitSaleCount: figures.inTransitSaleCount,
      systemSales: figures.systemSales,
      tolerance: this.tolerance,
      totalExpenses: centsToMoney(totalExpenses),
    };
  }
}
