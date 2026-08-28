import { describe, expect, it } from 'vitest';

import {
  centsToMoney,
  lineSubtotalCents,
  maximumMoneyCents,
  moneyToCents,
  sumCents,
} from './sale-money.js';

describe('moneyToCents', () => {
  it('parses non-negative amounts at scale 2', () => {
    expect(moneyToCents('0')).toBe(0n);
    expect(moneyToCents('10')).toBe(1000n);
    expect(moneyToCents('10.5')).toBe(1050n);
    expect(moneyToCents('10.00')).toBe(1000n);
    expect(moneyToCents('0.01')).toBe(1n);
  });

  it('rejects negatives, over-scale, and out-of-range values', () => {
    expect(moneyToCents('-1.00')).toBeNull();
    expect(moneyToCents('1.234')).toBeNull();
    expect(moneyToCents('abc')).toBeNull();
    expect(moneyToCents('')).toBeNull();
    expect(moneyToCents('99999999999999999')).toBeNull();
  });
});

describe('centsToMoney', () => {
  it('is the canonical inverse of parsing', () => {
    expect(centsToMoney(0n)).toBe('0.00');
    expect(centsToMoney(1n)).toBe('0.01');
    expect(centsToMoney(1000n)).toBe('10.00');
    expect(centsToMoney(1050n)).toBe('10.50');
  });
});

describe('lineSubtotalCents', () => {
  it('multiplies quantity by price and rounds to cents', () => {
    expect(lineSubtotalCents('2.5000', '10.00')).toBe(2500n);
    expect(lineSubtotalCents('3', '0')).toBe(0n);
    expect(lineSubtotalCents('1.0000', '0.01')).toBe(1n);
  });

  it('rounds half up exactly once', () => {
    // 1.005 → 100.5 cents → 101
    expect(lineSubtotalCents('0.1000', '10.05')).toBe(101n);
    // 0.125 * 1.00 = 0.125 → 12.5 cents → 13
    expect(lineSubtotalCents('0.1250', '1.00')).toBe(13n);
    // 0.375 → 37.5 cents → 38
    expect(lineSubtotalCents('0.3750', '1.00')).toBe(38n);
  });

  it('rejects a non-positive quantity or invalid price', () => {
    expect(lineSubtotalCents('0', '10.00')).toBeNull();
    expect(lineSubtotalCents('-1.0000', '10.00')).toBeNull();
    expect(lineSubtotalCents('1.0000', '-1.00')).toBeNull();
  });
});

describe('sumCents', () => {
  it('adds exactly and bounds the money range', () => {
    expect(sumCents([2500n, 1n, 0n])).toBe(2501n);
    expect(sumCents([])).toBe(0n);
    expect(sumCents([maximumMoneyCents, 1n])).toBeNull();
  });
});
