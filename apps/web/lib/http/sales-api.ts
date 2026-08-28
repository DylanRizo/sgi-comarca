import type {
  PaginatedData,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
} from '@sgi/contracts';

import { apiRequest } from './api-client';
import { searchQueryString } from './query';

/**
 * Server-side filters accepted by `GET /api/v1/sales`. Fulfillment (`status`)
 * and payment (`paymentStatus`) are independent filters because they are
 * independent states; neither implies the other.
 */
export interface SalesQuery {
  /** Inclusive civil-date lower bound, `YYYY-MM-DD`. */
  from?: string;
  page?: number;
  pageSize?: number;
  paymentStatus?: SalePaymentStatus;
  sellerUserId?: string;
  status?: SaleStatus;
  /** Inclusive civil-date upper bound, `YYYY-MM-DD`. */
  to?: string;
  /** Matches sales having at least one line in this warehouse. */
  warehouseId?: string;
}

export const salesApi = {
  detail: (saleId: string, signal?: AbortSignal) =>
    apiRequest<SaleView>(
      `/api/v1/sales/${encodeURIComponent(saleId)}`,
      signal ? { signal } : {},
    ),
  list: (query: SalesQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<SaleView>>(
      `/api/v1/sales${searchQueryString(query)}`,
      signal ? { signal } : {},
    ),
};
