import { describe, expect, it } from 'vitest';

import type {
  PaginatedData,
  ProductInventoryView,
  ProductSummary,
} from '../src/index.js';

describe('inventory read contracts', () => {
  it('keeps pagination and decimal values explicit for clients', () => {
    const product: ProductSummary = {
      active: true,
      code: 'SYN-1',
      id: '00000000-0000-4000-8000-000000000001',
      minimumStock: '2.5',
      name: 'Synthetic product',
      unit: null,
    };
    const page: PaginatedData<ProductSummary> = {
      items: [product],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    };

    expect(page.items[0]?.minimumStock).toBe('2.5');
    expect(page.pagination.totalPages).toBe(1);
  });

  it('represents a missing valuation as an empty collection', () => {
    const view: ProductInventoryView = {
      balances: [
        {
          costReviewRequired: true,
          currentUnitCost: null,
          currentUnitPrice: '100',
          id: '00000000-0000-4000-8000-000000000002',
          priceReviewRequired: false,
          quantity: '3',
          valuations: [],
          warehouse: {
            active: true,
            code: 'TEST',
            id: '00000000-0000-4000-8000-000000000003',
            name: 'Test warehouse',
          },
        },
      ],
      product: {
        active: true,
        code: 'SYN-1',
        createdAt: new Date(0).toISOString(),
        description: null,
        id: '00000000-0000-4000-8000-000000000001',
        minimumStock: '0',
        name: 'Synthetic product',
        unit: null,
        updatedAt: new Date(0).toISOString(),
      },
      totalQuantity: '3',
    };

    expect(view.balances[0]?.valuations).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('legacyRecord');
    expect(JSON.stringify(view)).not.toContain('ReconciliationIssue');
  });
});
