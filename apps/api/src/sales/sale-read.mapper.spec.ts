import { describe, expect, it } from 'vitest';

import { mapSale, type SaleRecord } from './sale-read.mapper.js';

function decimal(value: string): { toString(): string } {
  return { toString: () => value };
}

function sale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    businessDate: new Date('2026-08-27T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-27T15:04:05.000Z'),
    currencyCode: 'NIO',
    departureAt: new Date('2026-08-27T15:04:05.000Z'),
    id: '00000000-0000-4000-8000-000000000001',
    items: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        lineSubtotal: decimal('25.00'),
        product: {
          code: 'SYN-A',
          id: '00000000-0000-4000-8000-000000000003',
          name: 'Producto A',
        },
        quantity: decimal('2.5000'),
        shippingAllocation: decimal('5.00'),
        unitPriceSnapshot: decimal('10.00'),
        warehouse: {
          active: true,
          code: 'CASA_DYLAN',
          id: '00000000-0000-4000-8000-000000000004',
          name: 'Casa Dylan',
        },
      },
    ],
    origin: 'OPERATIONAL',
    paymentStatus: 'PENDING',
    saleNumber: 'VTA-000000001',
    sellerUserId: null,
    shippingAmount: decimal('5.00'),
    status: 'IN_TRANSIT',
    subtotal: decimal('25.00'),
    total: decimal('30.00'),
    ...overrides,
  };
}

describe('mapSale', () => {
  it('preserves exact decimal strings', () => {
    const view = mapSale(sale());
    expect(view.subtotal).toBe('25.00');
    expect(view.total).toBe('30.00');
    expect(view.shippingAmount).toBe('5.00');
    expect(view.items[0]?.quantity).toBe('2.5000');
    expect(view.items[0]?.unitPriceSnapshot).toBe('10.00');
  });

  it('never exposes unit cost or persisted hashes', () => {
    const view = mapSale(sale());
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('unitCostSnapshot');
    expect(serialized).not.toContain('idempotencyKeyHash');
    expect(serialized).not.toContain('requestHash');
    expect(Object.keys(view.items[0] ?? {})).not.toContain('unitCostSnapshot');
  });

  it('renders the business date as a civil date without shifting', () => {
    expect(mapSale(sale()).businessDate).toBe('2026-08-27');
  });

  it('emits null for an absent legacy price snapshot', () => {
    const legacy = sale({ origin: 'LEGACY_IMPORT', status: 'LEGACY_UNKNOWN' });
    const [item] = legacy.items;
    if (item) item.unitPriceSnapshot = null;
    const view = mapSale(legacy);
    expect(view.items[0]?.unitPriceSnapshot).toBeNull();
    expect(view.status).toBe('LEGACY_UNKNOWN');
  });

  it('keeps lifecycle timestamps as ISO strings or null', () => {
    const view = mapSale(
      sale({
        completedAt: new Date('2026-08-28T10:00:00.000Z'),
        status: 'COMPLETED',
      }),
    );
    expect(view.completedAt).toBe('2026-08-28T10:00:00.000Z');
    expect(mapSale(sale()).completedAt).toBeNull();
  });
});
