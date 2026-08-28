import type {
  CreateSaleRequest,
  PaginatedData,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
} from '@sgi/contracts';

import { apiRequest } from './api-client';
import { inventoryQueryString } from '../inventory/query';

export interface SalesQuery {
  from?: string;
  page?: number;
  pageSize?: number;
  paymentStatus?: SalePaymentStatus;
  sellerUserId?: string;
  status?: SaleStatus;
  to?: string;
  warehouseId?: string;
}

export const salesApi = {
  cancel: (
    saleId: string,
    reason: string,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<SaleView>(`/api/v1/sales/${encodeURIComponent(saleId)}/cancel`, {
      body: { reason },
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  confirmInTransit: (
    saleId: string,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<SaleView>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/confirm-in-transit`,
      { csrfToken, idempotencyKey, method: 'POST' },
    ),
  create: (
    input: CreateSaleRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<SaleView>('/api/v1/sales', {
      body: input,
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  sale: (saleId: string, signal?: AbortSignal) =>
    apiRequest<SaleView>(
      `/api/v1/sales/${encodeURIComponent(saleId)}`,
      signal ? { signal } : {},
    ),
  sales: (query: SalesQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<SaleView>>(
      `/api/v1/sales${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
};
