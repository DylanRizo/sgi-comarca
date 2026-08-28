import { describe, expect, it } from 'vitest';

import { resolveLinePricing, type LockedBalancePricing } from './sale-pricing.js';
import { SaleError } from './sale.errors.js';

function balance(
  overrides: Partial<LockedBalancePricing>,
): LockedBalancePricing {
  return {
    currentUnitPrice: '10.00',
    currentUnitCost: '4.00',
    priceReviewRequired: false,
    costReviewRequired: false,
    ...overrides,
  };
}

describe('resolveLinePricing', () => {
  it('uses the reference price when no override is supplied', () => {
    const result = resolveLinePricing(balance({}), null);
    expect(result.unitPriceSnapshot).toBe('10.00');
    expect(result.unitCostSnapshot).toBe('4.00');
    expect(result.priceOverridden).toBe(false);
  });

  it('treats an override equal to the reference as not overridden', () => {
    const result = resolveLinePricing(balance({}), '10.00');
    expect(result.priceOverridden).toBe(false);
    // canonical comparison: 10 == 10.0 == 10.00
    expect(resolveLinePricing(balance({}), '10').priceOverridden).toBe(false);
  });

  it('marks a different override and keeps the reference for audit', () => {
    const result = resolveLinePricing(balance({}), '12.50');
    expect(result.unitPriceSnapshot).toBe('12.50');
    expect(result.priceOverridden).toBe(true);
    expect(result.referenceUnitPrice).toBe('10.00');
  });

  it('accepts an override when the reference price is null', () => {
    const result = resolveLinePricing(
      balance({ currentUnitPrice: null }),
      '9.00',
    );
    expect(result.unitPriceSnapshot).toBe('9.00');
    expect(result.priceOverridden).toBe(true);
    expect(result.referenceUnitPrice).toBeNull();
  });

  it('rejects a null reference price with no override', () => {
    expect(() =>
      resolveLinePricing(balance({ currentUnitPrice: null }), null),
    ).toThrow(new SaleError('SALE_PRICE_MISSING'));
  });

  it('always takes cost from the balance and preserves zero', () => {
    const result = resolveLinePricing(balance({ currentUnitCost: '0.00' }), null);
    expect(result.unitCostSnapshot).toBe('0.00');
  });

  it('rejects a null cost', () => {
    expect(() =>
      resolveLinePricing(balance({ currentUnitCost: null }), null),
    ).toThrow(new SaleError('SALE_COST_MISSING'));
  });

  it('rejects a corrupt stored reference value', () => {
    expect(() =>
      resolveLinePricing(balance({ currentUnitPrice: '-1.00' }), null),
    ).toThrow(new SaleError('SALE_REFERENCE_VALUE_INVALID'));
    expect(() =>
      resolveLinePricing(balance({ currentUnitCost: '-1.00' }), null),
    ).toThrow(new SaleError('SALE_REFERENCE_VALUE_INVALID'));
  });

  it('surfaces review flags without blocking', () => {
    const result = resolveLinePricing(
      balance({ priceReviewRequired: true, costReviewRequired: true }),
      null,
    );
    expect(result.priceReviewRequired).toBe(true);
    expect(result.costReviewRequired).toBe(true);
    expect(result.unitPriceSnapshot).toBe('10.00');
  });
});
