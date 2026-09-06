import { describe, expect, it } from 'vitest';
import { sumQuantity } from './stock-form-quantity';
describe('receipt quantity preview', () => {
  it('adds decimal quantities without binary rounding', () => {
    expect(sumQuantity('0.1', '0.2')).toBe('0.3');
    expect(sumQuantity('99999999999998.9999', '1')).toBe('99999999999999.9999');
  });
  it('rejects invalid, empty, negative, zero or overflowing receipts', () => {
    for (const value of ['', '-1', '0', '1e3', '0.00001', 'NaN'])
      expect(sumQuantity('1', value)).toBeNull();
    expect(sumQuantity('99999999999999.9999', '0.0001')).toBeNull();
  });
});
