import type {
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

export const inventoryApi = {
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
  warehouses: (signal?: AbortSignal) =>
    apiRequest<PaginatedData<WarehouseSummary>>(
      '/api/v1/warehouses?page=1&pageSize=100&active=true',
      signal ? { signal } : {},
    ),
};
