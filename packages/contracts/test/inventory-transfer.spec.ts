import { describe, expect, it } from 'vitest';

import {
  inventoryMovementTypes,
  type InventoryTransferRequest,
  type InventoryTransferResult,
} from '../src/index.js';

describe('inventory transfer contracts', () => {
  it('keeps exact decimal strings and every persisted movement type', () => {
    const request: InventoryTransferRequest = {
      fromWarehouseId: '00000000-0000-4000-8000-000000000001',
      productId: '00000000-0000-4000-8000-000000000002',
      quantity: '4.2500',
      reason: 'Reposicion controlada',
      toWarehouseId: '00000000-0000-4000-8000-000000000003',
    };
    const result = {
      quantity: request.quantity,
      stockTotal: '13',
    } as InventoryTransferResult;

    expect(result.quantity).toBe('4.2500');
    expect(inventoryMovementTypes).toContain('ADJUSTMENT');
    expect(inventoryMovementTypes).toContain('TRANSFER_OUT');
    expect(inventoryMovementTypes).toContain('TRANSFER_IN');
  });
});
