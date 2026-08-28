import type {
  InventoryBalanceView,
  ProductInventoryView,
  ProductSummary,
} from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import { formatMoney, latestValuation, productRows } from './presentation.js';

const product: ProductSummary = {
  active: true,
  code: 'TEST-1',
  id: '10000000-0000-4000-8000-000000000001',
  minimumStock: '0',
  name: 'Producto de prueba',
  unit: {
    active: true,
    code: 'UNIT',
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Unidad',
  },
};

function balance(quantity: string, withValuation = true): InventoryBalanceView {
  return {
    costReviewRequired: false,
    currentUnitCost: '0',
    currentUnitPrice: '10',
    id: crypto.randomUUID(),
    priceReviewRequired: false,
    quantity,
    valuations: withValuation
      ? [
          {
            currencyCode: 'NIO',
            effectiveAt: null,
            id: crypto.randomUUID(),
            observedAt: '2026-01-01T00:00:00.000Z',
            requiresHumanReview: false,
            unitCost: '0',
            unitPrice: '10',
          },
        ]
      : [],
    warehouse: {
      active: true,
      code: crypto.randomUUID(),
      id: crypto.randomUUID(),
      name: 'Almacén',
    },
  };
}

describe('inventory presentation', () => {
  it('merges paginated products with API totals without losing no-balance products', () => {
    const inventory: ProductInventoryView = {
      balances: [balance('2'), balance('0')],
      product: {
        ...product,
        createdAt: '2026-01-01T00:00:00.000Z',
        description: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      totalQuantity: '2',
    };
    expect(productRows([product], [inventory])).toEqual([
      expect.objectContaining({
        totalQuantity: '2',
        warehousesWithStock: 1,
      }),
    ]);
    expect(productRows([{ ...product, id: crypto.randomUUID() }], [])).toEqual([
      expect.objectContaining({ totalQuantity: '0', warehousesWithStock: 0 }),
    ]);
  });

  it('preserves zero cost and represents a missing valuation as absence', () => {
    const zero = balance('1');
    expect(formatMoney(latestValuation(zero)?.unitCost ?? null)).toContain(
      '0.00',
    );
    expect(latestValuation(balance('1', false))).toBeNull();
  });
});
