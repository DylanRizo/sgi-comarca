import type {
  CancelInventoryCountSessionRequest,
  CaptureInventoryCountLineRequest,
  CreateInventoryCountSessionRequest,
  InventoryCountSessionStatus,
  InventoryCountSessionSummary,
  InventoryCountSessionView,
  PaginatedData,
} from '@sgi/contracts';

import { apiRequest } from './api-client';
import { inventoryQueryString } from '../inventory/query';

export interface InventoryCountQuery {
  page?: number;
  pageSize?: number;
  status?: InventoryCountSessionStatus;
}

const base = '/api/v1/inventory/counts';

export const inventoryCountsApi = {
  approve: (id: string, csrfToken: string) =>
    apiRequest<InventoryCountSessionView>(
      `${base}/${encodeURIComponent(id)}/approve`,
      { csrfToken, method: 'POST' },
    ),
  cancel: (
    id: string,
    input: CancelInventoryCountSessionRequest,
    csrfToken: string,
  ) =>
    apiRequest<InventoryCountSessionView>(
      `${base}/${encodeURIComponent(id)}/cancel`,
      { body: input, csrfToken, method: 'POST' },
    ),
  captureLine: (
    id: string,
    input: CaptureInventoryCountLineRequest,
    csrfToken: string,
  ) =>
    apiRequest<InventoryCountSessionView>(
      `${base}/${encodeURIComponent(id)}/lines`,
      { body: input, csrfToken, method: 'POST' },
    ),
  create: (
    input: CreateInventoryCountSessionRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<InventoryCountSessionView>(base, {
      body: input,
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  detail: (id: string, signal?: AbortSignal) =>
    apiRequest<InventoryCountSessionView>(
      `${base}/${encodeURIComponent(id)}`,
      signal ? { signal } : {},
    ),
  list: (query: InventoryCountQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<InventoryCountSessionSummary>>(
      `${base}${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
  submit: (id: string, csrfToken: string) =>
    apiRequest<InventoryCountSessionView>(
      `${base}/${encodeURIComponent(id)}/submit`,
      { csrfToken, method: 'POST' },
    ),
};
