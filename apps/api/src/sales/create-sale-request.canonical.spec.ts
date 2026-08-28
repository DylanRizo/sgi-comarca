import type { CreateSaleRequest } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  canonicalCreateSaleRequest,
  createSaleRequestHash,
} from './create-sale-request.canonical.js';
import { SaleError } from './sale.errors.js';

const productId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';

function request(
  overrides: Partial<CreateSaleRequest> = {},
): CreateSaleRequest {
  return {
    businessDate: '2026-08-27',
    items: [{ productId, warehouseId, quantity: '2.5000', unitPrice: '10.00' }],
    status: 'IN_TRANSIT',
    ...overrides,
  };
}

describe('canonicalCreateSaleRequest', () => {
  it('normalizes quantities, prices, shipping, and uuid case', () => {
    const canonical = canonicalCreateSaleRequest(
      request({
        items: [
          {
            productId: productId.toUpperCase(),
            warehouseId,
            quantity: '2.5000',
            unitPrice: '10',
          },
        ],
      }),
    );
    const parsed = JSON.parse(canonical);
    expect(parsed.items[0].productId).toBe(productId);
    expect(parsed.items[0].quantity).toBe('2.5');
    expect(parsed.items[0].unitPrice).toBe('10.00');
    expect(parsed.shippingAmount).toBe('0.00');
    expect(parsed.sellerUserId).toBeNull();
  });

  it('is stable regardless of equivalent decimal spelling', () => {
    const a = createSaleRequestHash(
      request({
        items: [{ productId, warehouseId, quantity: '2.5', unitPrice: '10' }],
      }),
    );
    const b = createSaleRequestHash(
      request({
        items: [
          { productId, warehouseId, quantity: '2.5000', unitPrice: '10.00' },
        ],
      }),
    );
    expect(a).toBe(b);
  });

  it('preserves item order as a semantic ordinal', () => {
    const secondProduct = '00000000-0000-4000-8000-000000000003';
    const forward = createSaleRequestHash(
      request({
        items: [
          { productId, warehouseId, quantity: '1', unitPrice: '1.00' },
          {
            productId: secondProduct,
            warehouseId,
            quantity: '1',
            unitPrice: '1.00',
          },
        ],
      }),
    );
    const reversed = createSaleRequestHash(
      request({
        items: [
          {
            productId: secondProduct,
            warehouseId,
            quantity: '1',
            unitPrice: '1.00',
          },
          { productId, warehouseId, quantity: '1', unitPrice: '1.00' },
        ],
      }),
    );
    expect(forward).not.toBe(reversed);
  });

  it('distinguishes omitted price from an explicit value', () => {
    const withPrice = createSaleRequestHash(request());
    const withoutPrice = createSaleRequestHash(
      request({ items: [{ productId, warehouseId, quantity: '2.5000' }] }),
    );
    expect(withPrice).not.toBe(withoutPrice);
  });

  it('produces a lowercase 64-char sha-256', () => {
    expect(createSaleRequestHash(request())).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects malformed dates, statuses, ids, and empty items', () => {
    expect(() =>
      canonicalCreateSaleRequest(request({ businessDate: '2026/08/27' })),
    ).toThrow(SaleError);
    expect(() => canonicalCreateSaleRequest(request({ items: [] }))).toThrow(
      SaleError,
    );
    expect(() =>
      canonicalCreateSaleRequest(
        request({
          items: [{ productId: 'not-a-uuid', warehouseId, quantity: '1' }],
        }),
      ),
    ).toThrow(SaleError);
    expect(() =>
      canonicalCreateSaleRequest(
        request({ items: [{ productId, warehouseId, quantity: '0' }] }),
      ),
    ).toThrow(SaleError);
  });
});
