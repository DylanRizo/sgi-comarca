import type { SaleView } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  canCancel,
  canConfirm,
  formatBusinessDate,
  paymentStatusLabel,
  saleStatusLabel,
  saleWarehouseNames,
} from './presentation';

function sale(overrides: Partial<SaleView> = {}): SaleView {
  return {
    businessDate: '2026-08-27',
    completedAt: null,
    createdAt: '2026-08-27T15:04:05.000Z',
    currencyCode: 'NIO',
    delivererText: null,
    deliveryPlace: null,
    departureAt: '2026-08-27T15:04:05.000Z',
    id: 'sale-1',
    items: [],
    observations: null,
    origin: 'OPERATIONAL',
    paymentMethodText: null,
    paymentStatus: 'PENDING',
    saleNumber: 'VTA-000000001',
    salesChannelText: null,
    sellerUserId: null,
    shippingAmount: '0.00',
    status: 'IN_TRANSIT',
    subtotal: '0.00',
    total: '0.00',
    ...overrides,
  };
}

describe('sale presentation', () => {
  it('labels fulfillment and payment separately', () => {
    expect(saleStatusLabel('IN_TRANSIT')).toBe('En tránsito');
    expect(saleStatusLabel('COMPLETED')).toBe('Completada');
    expect(saleStatusLabel('CANCELLED')).toBe('Cancelada');
    expect(paymentStatusLabel('PENDING')).toBe('Pendiente');
    expect(paymentStatusLabel('PAID')).toBe('Pagada');
  });

  it('allows confirmation and cancellation only for in-transit unpaid sales', () => {
    expect(canConfirm(sale())).toBe(true);
    expect(canCancel(sale())).toBe(true);
    expect(canConfirm(sale({ status: 'COMPLETED' }))).toBe(false);
    expect(canCancel(sale({ status: 'COMPLETED' }))).toBe(false);
    expect(canCancel(sale({ status: 'CANCELLED' }))).toBe(false);
    expect(canCancel(sale({ paymentStatus: 'PAID' }))).toBe(false);
  });

  it('renders the business date without shifting the civil day', () => {
    // A year boundary catches the west-of-Greenwich off-by-one day.
    expect(formatBusinessDate('2026-01-01')).toContain('2026');
    expect(formatBusinessDate('2026-01-01')).toContain('1');
    expect(formatBusinessDate('2026-08-27')).toContain('27');
    expect(formatBusinessDate('no-es-fecha')).toBe('no-es-fecha');
  });

  it('lists each warehouse once', () => {
    const warehouse = (id: string, name: string) => ({
      active: true,
      code: id,
      id,
      name,
    });
    const item = (id: string, name: string) => ({
      id: `item-${id}`,
      lineSubtotal: '10.00',
      product: { code: 'P', id: 'p', name: 'Producto' },
      quantity: '1',
      shippingAllocation: '0.00',
      unitPriceSnapshot: '10.00',
      warehouse: warehouse(id, name),
    });
    const view = sale({
      items: [
        item('a', 'Casa Dylan'),
        item('a', 'Casa Dylan'),
        item('b', 'Casa Jean'),
      ],
    });
    expect(saleWarehouseNames(view)).toStrictEqual(['Casa Dylan', 'Casa Jean']);
  });
});
