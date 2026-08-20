import { describe, expect, it } from 'vitest';

import type {
  InventoryAdjustmentRequest,
  InventoryAdjustmentResult,
} from '../src/index.js';

describe('inventory adjustment contracts', () => {
  it('keeps decimal quantities as exact strings', () => {
    const request: InventoryAdjustmentRequest = {
      productId: '00000000-0000-4000-8000-000000000001',
      quantityDelta: '-1.2500',
      reason: 'Conteo fisico controlado',
      warehouseId: '00000000-0000-4000-8000-000000000002',
    };
    const result: InventoryAdjustmentResult = {
      balanceAfter: '8.75',
      balanceBefore: '10',
      movementId: '00000000-0000-4000-8000-000000000003',
      occurredAt: '2026-08-16T12:00:00.000Z',
      product: {
        code: 'SYN-1',
        id: request.productId,
        name: 'Synthetic product',
      },
      quantityDelta: request.quantityDelta,
      warehouse: {
        code: 'SYN-W',
        id: request.warehouseId,
        name: 'Synthetic warehouse',
      },
    };

    expect(result.quantityDelta).toBe('-1.2500');
    expect(result.balanceAfter).toBe('8.75');
  });
});
