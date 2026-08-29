export const financialEntryTypes = ['INCOME', 'EXPENSE'] as const;
export type FinancialEntryType = (typeof financialEntryTypes)[number];

export const financeOrigins = ['OPERATIONAL', 'LEGACY_IMPORT'] as const;
export type FinanceOrigin = (typeof financeOrigins)[number];

export const dailyClosingStatuses = ['CLOSED', 'REOPENED'] as const;
export type DailyClosingStatus = (typeof dailyClosingStatuses)[number];

/**
 * How an income line reached the finances view. `SALE` lines are derived from
 * completed sales when reading and are never persisted as entries, so they can
 * never be duplicated (ADR-010, DEC-022).
 */
export const financeLineSources = ['MANUAL', 'SALE'] as const;
export type FinanceLineSource = (typeof financeLineSources)[number];

export interface FinancialCategoryView {
  id: string;
  code: string;
  name: string;
  entryType: FinancialEntryType;
  active: boolean;
}

export interface CreateFinancialEntryRequest {
  /** Civil date in America/Managua, `YYYY-MM-DD`. */
  businessDate: string;
  entryType: FinancialEntryType;
  categoryId: string;
  /** Decimal(18,2) string, strictly greater than zero. */
  amount: string;
  responsibleUserId: string;
  description?: string;
}

/**
 * One line of the finances view. A manual line maps to a persisted entry; a
 * `SALE` line is derived at read time and has no entry id.
 */
export interface FinanceLineView {
  id: string;
  source: FinanceLineSource;
  entryType: FinancialEntryType;
  businessDate: string;
  amount: string;
  currencyCode: string;
  category: FinancialCategoryView | null;
  description: string | null;
  responsibleUserId: string | null;
  /** Present only on a `SALE` line, so the operator can reach the sale. */
  saleId: string | null;
  saleNumber: string | null;
  createdAt: string | null;
}

export interface FinanceTotalsView {
  income: string;
  expense: string;
  net: string;
}

export interface DailyClosingReopeningView {
  id: string;
  reason: string;
  reopenedByUserId: string;
  reopenedAt: string;
}

export interface DailyClosingView {
  id: string;
  origin: FinanceOrigin;
  businessDate: string;
  status: DailyClosingStatus;
  realCash: string;
  realDigital: string;
  systemSales: string;
  /** Signed: negative means the counted money fell short of system sales. */
  difference: string;
  toleranceApplied: string;
  balanced: boolean;
  inTransitSaleCount: number;
  currencyCode: string;
  observations: string | null;
  closedByUserId: string | null;
  closedAt: string;
  reopenings: DailyClosingReopeningView[];
}

export interface CreateDailyClosingRequest {
  businessDate: string;
  /** Decimal(18,2) strings, non-negative. */
  realCash: string;
  realDigital: string;
  observations?: string;
}

export interface ReopenDailyClosingRequest {
  reason: string;
}

export type FinancesPublicErrorCode =
  | 'CLOSING_ALREADY_EXISTS'
  | 'CLOSING_ALREADY_REOPENED'
  | 'CLOSING_NOT_FOUND'
  | 'CLOSING_PERMISSION_DENIED'
  | 'CLOSING_REQUEST_INVALID'
  | 'FINANCE_CATEGORY_INVALID'
  | 'FINANCE_CONCURRENCY_CONFLICT'
  | 'FINANCE_PERMISSION_DENIED'
  | 'FINANCE_REQUEST_INVALID'
  | 'FINANCE_RESPONSIBLE_INVALID';
