import { describe, expect, it } from 'vitest';

import {
  canonicalInventoryTransferRequest,
  InventoryTransferError,
} from './inventory-transfer.service.js';

describe('InventoryTransferService canonical request', () => {
  const input = {
    fromWarehouseId: '00000000-0000-4000-8000-000000000001',
    productId: '00000000-0000-4000-8000-000000000002',
    quantity: '1.2500',
    reason: 'Traslado controlado',
    toWarehouseId: '00000000-0000-4000-8000-000000000003',
  };

  it('normalizes quantity and keeps deterministic property order', () => {
    expect(canonicalInventoryTransferRequest(input)).toBe(
      '{"fromWarehouseId":"00000000-0000-4000-8000-000000000001","productId":"00000000-0000-4000-8000-000000000002","quantity":"1.25","reason":"Traslado controlado","toWarehouseId":"00000000-0000-4000-8000-000000000003"}',
    );
  });

  it('rejects zero and unsupported decimal precision', () => {
    for (const quantity of ['0', '-1', '1.00001']) {
      expect(() =>
        canonicalInventoryTransferRequest({ ...input, quantity }),
      ).toThrowError(new InventoryTransferError('INVENTORY_TRANSFER_INVALID'));
    }
  });
});
