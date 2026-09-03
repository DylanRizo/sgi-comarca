import type {
  CreateDailyClosingRequest,
  DailyClosingPreviewView,
  CreateFinancialEntryRequest,
  DailyClosingStatus,
  DailyClosingView,
  FinanceLineSource,
  FinanceLineView,
  FinancesPublicErrorCode,
  FinanceTotalsView,
  FinancialCategoryView,
  FinancialEntryType,
  PaginatedData,
} from '@sgi/contracts';

import { apiRequest } from './api-client';
import { inventoryQueryString } from '../inventory/query';

export type { FinancesPublicErrorCode };

export interface FinanceLineQuery {
  categoryId?: string;
  entryType?: FinancialEntryType;
  from?: string;
  page?: number;
  pageSize?: number;
  source?: FinanceLineSource;
  to?: string;
}

export interface DailyClosingQuery {
  from?: string;
  page?: number;
  pageSize?: number;
  status?: DailyClosingStatus;
  to?: string;
}

export const financesApi = {
  categories: (signal?: AbortSignal) =>
    apiRequest<readonly FinancialCategoryView[]>(
      '/api/v1/finances/categories',
      signal ? { signal } : {},
    ),
  createEntry: (
    input: CreateFinancialEntryRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<FinanceLineView>('/api/v1/finances', {
      body: input,
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  lines: (query: FinanceLineQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<FinanceLineView>>(
      `/api/v1/finances${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
  totals: (query: FinanceLineQuery, signal?: AbortSignal) =>
    apiRequest<FinanceTotalsView>(
      `/api/v1/finances/totals${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
};

export const closingsApi = {
  preview: (businessDate: string, signal?: AbortSignal) =>
    apiRequest<DailyClosingPreviewView>(
      `/api/v1/closings/preview${inventoryQueryString({ businessDate })}`,
      signal ? { signal } : {},
    ),
  closing: (id: string, signal?: AbortSignal) =>
    apiRequest<DailyClosingView>(
      `/api/v1/closings/${encodeURIComponent(id)}`,
      signal ? { signal } : {},
    ),
  closings: (query: DailyClosingQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<DailyClosingView>>(
      `/api/v1/closings${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
  create: (
    input: CreateDailyClosingRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<DailyClosingView>('/api/v1/closings', {
      body: input,
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  reopen: (
    id: string,
    reason: string,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<DailyClosingView>(
      `/api/v1/closings/${encodeURIComponent(id)}/reopen`,
      {
        body: { reason },
        csrfToken,
        idempotencyKey,
        method: 'POST',
      },
    ),
};
