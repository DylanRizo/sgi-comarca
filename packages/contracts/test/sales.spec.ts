import { describe, expect, it } from 'vitest';

import {
  saleCreationStatuses,
  saleStatuses,
  type CreateSaleRequest,
  type SaleItemView,
  type SaleView,
} from '../src/index.js';

describe('sales contracts', () => {
  it('keeps exact decimal strings on the creation DTO', () => {
    const request: CreateSaleRequest = {
      businessDate: '2026-08-27',
      items: [
        {
          productId: '00000000-0000-4000-8000-000000000001',
          warehouseId: '00000000-0000-4000-8000-000000000002',
          quantity: '2.5000',
          unitPrice: '10.00',
        },
      ],
      shippingAmount: '5.00',
      status: 'IN_TRANSIT',
    };

    expect(request.items[0]?.quantity).toBe('2.5000');
    expect(request.status).toBe('IN_TRANSIT');
  });

  it('only allows IN_TRANSIT or COMPLETED as creation statuses', () => {
    expect(saleCreationStatuses).toStrictEqual(['IN_TRANSIT', 'COMPLETED']);
    expect(saleStatuses).toContain('CANCELLED');
  });

  it('does not expose unit cost on the read view', () => {
    const item: SaleItemView = {
      id: '00000000-0000-4000-8000-000000000003',
      product: { id: 'p', code: 'C', name: 'N' },
      warehouse: { id: 'w', code: 'WC', name: 'WN', active: true },
      quantity: '2.5000',
      unitPriceSnapshot: '10.00',
      lineSubtotal: '25.00',
      shippingAllocation: '5.00',
    };
    expect(Object.keys(item)).not.toContain('unitCostSnapshot');

    const view = { items: [item] } as Pick<SaleView, 'items'>;
    expect(view.items[0]?.unitPriceSnapshot).toBe('10.00');
  });
});
