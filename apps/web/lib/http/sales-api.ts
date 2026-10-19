import type {
  CreateSaleRequest,
  PaginatedData,
  RecordSalePaymentRequest,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
  VoidDuplicateSaleRequest,
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
  byNumber: (number: string) =>
    apiRequest<SaleView>(
      `/api/v1/sales/by-number/${encodeURIComponent(number)}`,
    ),
  voidDuplicate: (
    saleId: string,
    input: VoidDuplicateSaleRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<SaleView>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/void-duplicate`,
      {
        body: input,
        csrfToken,
        idempotencyKey,
        method: 'POST',
      },
    ),
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
  recordPayment: (
    saleId: string,
    input: RecordSalePaymentRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<SaleView>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/payment`,
      { body: input, csrfToken, idempotencyKey, method: 'POST' },
    ),
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
