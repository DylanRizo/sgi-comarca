import type {
  CreateProductInput,
  EditProductInput,
  PaginatedData,
  PendingValuation,
  ProductCreatedView,
  ProductDetail,
  ProductGroupView,
  ReceiptInput,
  ReceiptView,
  UnitSummary,
  ValuationInput,
} from '@sgi/contracts';
import { apiRequest } from './api-client';

const mutation = (
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) => ({ body, csrfToken, idempotencyKey, method: 'POST' as const });
export const stockOperationsApi = {
  groups: () => apiRequest<ProductGroupView[]>('/api/v1/product-groups'),
  units: () =>
    apiRequest<PaginatedData<UnitSummary>>(
      '/api/v1/units?active=true&page=1&pageSize=100',
    ),
  product: (id: string) =>
    apiRequest<ProductDetail>(`/api/v1/products/${encodeURIComponent(id)}`),
  createProduct: (input: CreateProductInput, csrf: string, key: string) =>
    apiRequest<ProductCreatedView>(
      '/api/v1/products',
      mutation(input, csrf, key),
    ),
  editProduct: (
    id: string,
    input: EditProductInput,
    csrf: string,
    key: string,
  ) =>
    apiRequest<ProductDetail>(`/api/v1/products/${encodeURIComponent(id)}`, {
      ...mutation(input, csrf, key),
      method: 'PATCH',
    }),
  receive: (input: ReceiptInput, csrf: string, key: string) =>
    apiRequest<ReceiptView>(
      '/api/v1/stock-receipts',
      mutation(input, csrf, key),
    ),
  receipts: (page: number) =>
    apiRequest<PaginatedData<ReceiptView>>(
      `/api/v1/stock-receipts?page=${page}&pageSize=25`,
    ),
  receipt: (id: string) =>
    apiRequest<ReceiptView>(`/api/v1/stock-receipts/${encodeURIComponent(id)}`),
  valuations: (search: string, page: number) =>
    apiRequest<PaginatedData<PendingValuation>>(
      `/api/v1/inventory/valuations?search=${encodeURIComponent(search)}&page=${page}&pageSize=25`,
    ),
  pendingValuations: (page: number) =>
    apiRequest<PaginatedData<PendingValuation>>(
      `/api/v1/inventory/valuations/pending?page=${page}&pageSize=25`,
    ),
  value: (id: string, input: ValuationInput, csrf: string, key: string) =>
    apiRequest<{ version: number }>(
      `/api/v1/inventory/valuations/${encodeURIComponent(id)}`,
      mutation(input, csrf, key),
    ),
};
