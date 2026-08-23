import type {
  InventoryAdjustmentRequest,
  InventoryAdjustmentResult,
  InventoryMovementType,
  InventoryMovementView,
  InventoryTransferRequest,
  InventoryTransferResult,
  PaginatedData,
  ProductInventoryView,
  ProductSummary,
  WarehouseSummary,
} from '@sgi/contracts';

import { apiRequest } from './api-client';
import { inventoryQueryString } from '../inventory/query';

export interface CatalogQuery {
  active?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface InventoryQuery extends CatalogQuery {
  availableOnly?: boolean;
  warehouseId?: string;
}

export interface InventoryMovementQuery {
  from?: string;
  movementType?: InventoryMovementType;
  page?: number;
  pageSize?: number;
  productId?: string;
  sourceType?: string;
  to?: string;
  warehouseId?: string;
}

async function allInventory(signal?: AbortSignal) {
  const first = await inventoryApi.inventory(
    { active: true, page: 1, pageSize: 100 },
    signal,
  );
  if (first.pagination.totalPages <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      inventoryApi.inventory(
        { active: true, page: index + 2, pageSize: 100 },
        signal,
      ),
    ),
  );
  return [first, ...remaining].flatMap(({ items }) => items);
}

export const inventoryApi = {
  adjust: (input: InventoryAdjustmentRequest, csrfToken: string) =>
    apiRequest<InventoryAdjustmentResult>('/api/v1/inventory/adjustments', {
      body: input,
      csrfToken,
      method: 'POST',
    }),
  inventory: (query: InventoryQuery, signal?: AbortSignal) => {
    const filters = { ...query };
    delete filters.warehouseId;
    const path = query.warehouseId
      ? `/api/v1/inventory/warehouses/${encodeURIComponent(query.warehouseId)}${inventoryQueryString(filters)}`
      : `/api/v1/inventory${inventoryQueryString(query)}`;
    return apiRequest<PaginatedData<ProductInventoryView>>(
      path,
      signal ? { signal } : {},
    );
  },
  allInventory,
  movements: (query: InventoryMovementQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<InventoryMovementView>>(
      `/api/v1/inventory/movements${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
  productInventory: (productId: string, signal?: AbortSignal) =>
    apiRequest<ProductInventoryView>(
      `/api/v1/inventory/products/${encodeURIComponent(productId)}`,
      signal ? { signal } : {},
    ),
  products: (query: CatalogQuery, signal?: AbortSignal) =>
    apiRequest<PaginatedData<ProductSummary>>(
      `/api/v1/products${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
  transfer: (
    input: InventoryTransferRequest,
    csrfToken: string,
    idempotencyKey: string,
  ) =>
    apiRequest<InventoryTransferResult>('/api/v1/inventory/transfers', {
      body: input,
      csrfToken,
      idempotencyKey,
      method: 'POST',
    }),
  warehouses: (signal?: AbortSignal) =>
    apiRequest<PaginatedData<WarehouseSummary>>(
      '/api/v1/warehouses?page=1&pageSize=100&active=true',
      signal ? { signal } : {},
    ),
};
