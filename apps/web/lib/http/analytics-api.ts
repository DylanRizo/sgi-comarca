import type { InventoryAnalytics, SalesAnalytics } from '@sgi/contracts';

import { apiRequest } from './api-client';
import { inventoryQueryString } from '../inventory/query';

export interface SalesAnalyticsQuery {
  from: string;
  granularity?: 'day' | 'month' | 'week';
  to: string;
}

export const analyticsApi = {
  inventory: (signal?: AbortSignal) =>
    apiRequest<InventoryAnalytics>(
      '/api/v1/analytics/inventory',
      signal ? { signal } : {},
    ),
  sales: (query: SalesAnalyticsQuery, signal?: AbortSignal) =>
    apiRequest<SalesAnalytics>(
      `/api/v1/analytics/sales${inventoryQueryString(query)}`,
      signal ? { signal } : {},
    ),
};
