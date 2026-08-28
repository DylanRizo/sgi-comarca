import { describe, expect, it } from 'vitest';

import {
  previewSaleDraft,
  type SaleDraft,
  type SaleDraftLine,
} from './create-sale-draft';

const productA = 'product-a';
const productB = 'product-b';
const warehouseA = 'warehouse-a';
const warehouseB = 'warehouse-b';

function line(overrides: Partial<SaleDraftLine> = {}): SaleDraftLine {
  return {
    productId: productA,
    quantity: '2',
    unitPrice: '',
    warehouseId: warehouseA,
    ...overrides,
  };
}

function draft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return {
    businessDate: '2026-08-27',
    lines: [line()],
    shippingAmount: '',
    status: 'IN_TRANSIT',
    ...overrides,
  };
}

const available = new Map([
  [`${productA}:${warehouseA}`, '10'],
  [`${productA}:${warehouseB}`, '5'],
  [`${productB}:${warehouseA}`, '1'],
]);

const prices = new Map<string, string | null>([
  [`${productA}:${warehouseA}`, '10.00'],
  [`${productA}:${warehouseB}`, '11.00'],
  [`${productB}:${warehouseA}`, null],
]);

describe('previewSaleDraft', () => {
  it('builds a request without client-owned money fields', () => {
    const preview = previewSaleDraft(draft(), available, prices);
    expect(preview.kind).toBe('valid');
    if (preview.kind !== 'valid') return;
    expect(preview.request).toStrictEqual({
      businessDate: '2026-08-27',
      items: [{ productId: productA, quantity: '2', warehouseId: warehouseA }],
      status: 'IN_TRANSIT',
    });
    const serialized = JSON.stringify(preview.request);
    expect(serialized).not.toContain('subtotal');
    expect(serialized).not.toContain('total');
    expect(serialized).not.toContain('paymentStatus');
    expect(serialized).not.toContain('saleNumber');
    expect(serialized).not.toContain('Cost');
  });

  it('estimates subtotal and total from the reference price', () => {
    const preview = previewSaleDraft(
      draft({ shippingAmount: '5.00' }),
      available,
      prices,
    );
    if (preview.kind !== 'valid') throw new Error('expected a valid draft');
    expect(preview.estimatedSubtotal).toBe('20.00');
    expect(preview.estimatedTotal).toBe('25.00');
  });

  it('keeps an explicit price override and prefers it over the reference', () => {
    const preview = previewSaleDraft(
      draft({ lines: [line({ quantity: '1', unitPrice: '7.50' })] }),
      available,
      prices,
    );
    if (preview.kind !== 'valid') throw new Error('expected a valid draft');
    expect(preview.request.items[0]?.unitPrice).toBe('7.50');
    expect(preview.estimatedSubtotal).toBe('7.50');
  });

  it('aggregates repeated pairs when checking stock', () => {
    const ok = previewSaleDraft(
      draft({ lines: [line({ quantity: '6' }), line({ quantity: '4' })] }),
      available,
      prices,
    );
    expect(ok.kind).toBe('valid');

    const tooMuch = previewSaleDraft(
      draft({ lines: [line({ quantity: '6' }), line({ quantity: '5' })] }),
      available,
      prices,
    );
    expect(tooMuch).toStrictEqual({
      issue: 'INSUFFICIENT_STOCK',
      kind: 'invalid',
      lineIndex: 0,
    });
  });

  it('allows several warehouses and several products in one sale', () => {
    const preview = previewSaleDraft(
      draft({
        lines: [
          line({ quantity: '1' }),
          line({ quantity: '1', warehouseId: warehouseB }),
        ],
      }),
      available,
      prices,
    );
    if (preview.kind !== 'valid') throw new Error('expected a valid draft');
    expect(preview.request.items).toHaveLength(2);
    expect(preview.estimatedSubtotal).toBe('21.00');
  });

  it('still builds the request when the reference price is unknown', () => {
    // The server rejects it with 422 unless an override is supplied; the
    // client must not silently invent a price.
    const preview = previewSaleDraft(
      draft({ lines: [line({ productId: productB, quantity: '1' })] }),
      available,
      prices,
    );
    if (preview.kind !== 'valid') throw new Error('expected a valid draft');
    expect(preview.estimatedSubtotal).toBe('0.00');
    expect(preview.request.items[0]?.unitPrice).toBeUndefined();
  });

  it('rejects malformed dates, quantities, prices and shipping', () => {
    expect(
      previewSaleDraft(
        draft({ businessDate: '27-08-2026' }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'BUSINESS_DATE_INVALID' });
    expect(
      previewSaleDraft(draft({ lines: [] }), available, prices),
    ).toMatchObject({ issue: 'NO_LINES' });
    expect(
      previewSaleDraft(
        draft({ lines: [line({ quantity: '0' })] }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'QUANTITY_INVALID' });
    expect(
      previewSaleDraft(
        draft({ lines: [line({ quantity: '1.00001' })] }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'QUANTITY_INVALID' });
    expect(
      previewSaleDraft(
        draft({ lines: [line({ unitPrice: '1.005' })] }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'PRICE_INVALID' });
    expect(
      previewSaleDraft(
        draft({ lines: [line({ unitPrice: '-1' })] }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'PRICE_INVALID' });
    expect(
      previewSaleDraft(draft({ shippingAmount: '-2' }), available, prices),
    ).toMatchObject({ issue: 'SHIPPING_INVALID' });
    expect(
      previewSaleDraft(
        draft({ lines: [line({ warehouseId: '' })] }),
        available,
        prices,
      ),
    ).toMatchObject({ issue: 'WAREHOUSE_MISSING' });
  });

  it('rounds a line subtotal half up, once', () => {
    const preview = previewSaleDraft(
      draft({ lines: [line({ quantity: '0.1250', unitPrice: '1.00' })] }),
      available,
      prices,
    );
    if (preview.kind !== 'valid') throw new Error('expected a valid draft');
    expect(preview.estimatedSubtotal).toBe('0.13');
  });
});
