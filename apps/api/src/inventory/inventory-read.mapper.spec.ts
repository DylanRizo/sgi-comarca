import { describe, expect, it } from 'vitest';

import {
  mapProductInventory,
  sumDecimalValues,
  type InventoryProductRecord,
} from './inventory-read.mapper.js';

function decimal(value: string): { toFixed(): string; toString(): string } {
  return { toFixed: () => value, toString: () => value };
}

function product(): InventoryProductRecord {
  const warehouse = {
    active: true,
    code: 'W-A',
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Warehouse A',
  };
  return {
    active: true,
    code: 'SYN-A',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: null,
    id: '00000000-0000-4000-8000-000000000001',
    inventoryBalances: [
      {
        costReviewRequired: false,
        currentUnitCost: decimal('0'),
        currentUnitPrice: decimal('15.25'),
        id: '00000000-0000-4000-8000-000000000003',
        priceReviewRequired: false,
        quantity: decimal('1.25'),
        warehouse,
        warehouseId: warehouse.id,
      },
      {
        costReviewRequired: true,
        currentUnitCost: null,
        currentUnitPrice: null,
        id: '00000000-0000-4000-8000-000000000004',
        priceReviewRequired: true,
        quantity: decimal('2.75'),
        warehouse: {
          ...warehouse,
          code: 'W-B',
          id: '00000000-0000-4000-8000-000000000005',
        },
        warehouseId: '00000000-0000-4000-8000-000000000005',
      },
    ],
    minimumStock: decimal('2'),
    name: 'Synthetic A',
    productWarehouseValuations: [
      {
        currencyCode: 'NIO',
        effectiveAt: null,
        id: '00000000-0000-4000-8000-000000000006',
        observedAt: new Date('2026-01-03T00:00:00.000Z'),
        requiresHumanReview: false,
        unitCost: decimal('0'),
        unitPrice: decimal('15.25'),
        warehouseId: warehouse.id,
      },
    ],
    unit: null,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

describe('inventory read mapper', () => {
  it('sums decimal quantities without floating-point loss', () => {
    expect(
      sumDecimalValues([decimal('0.1'), decimal('0.2'), decimal('1.2500')]),
    ).toBe('1.55');
    expect(sumDecimalValues([decimal('-1.5'), decimal('0.25')])).toBe('-1.25');
  });

  it('preserves zero cost and keeps a missing valuation absent', () => {
    const result = mapProductInventory(product());
    expect(result.totalQuantity).toBe('4');
    expect(result.balances[0]?.currentUnitCost).toBe('0');
    expect(result.balances[0]?.valuations[0]?.unitCost).toBe('0');
    expect(result.balances[1]?.valuations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('legacyRecord');
  });
});
