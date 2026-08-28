import { describe, expect, it } from 'vitest';

import { allocateShipping } from './sale-shipping-allocation.js';
import { SaleError } from './sale.errors.js';

describe('allocateShipping', () => {
  it('splits evenly when divisible', () => {
    expect(allocateShipping(900n, 3)).toStrictEqual([300n, 300n, 300n]);
  });

  it('gives the residue to the first lines by ordinal', () => {
    // 1000 / 3 = 333 base, residue 1 → first line +1
    expect(allocateShipping(1000n, 3)).toStrictEqual([334n, 333n, 333n]);
    // 1001 / 3 = 333 base, residue 2 → first two lines +1
    expect(allocateShipping(1001n, 3)).toStrictEqual([334n, 334n, 333n]);
  });

  it('always sums back to the shipping amount', () => {
    for (const cents of [0n, 1n, 7n, 999n, 1000n, 123_456n]) {
      for (const lines of [1, 2, 3, 5, 7]) {
        const allocations = allocateShipping(cents, lines);
        const total = allocations.reduce((acc, value) => acc + value, 0n);
        expect(total).toBe(cents);
        expect(allocations.every((value) => value >= 0n)).toBe(true);
      }
    }
  });

  it('handles a single line and zero shipping', () => {
    expect(allocateShipping(500n, 1)).toStrictEqual([500n]);
    expect(allocateShipping(0n, 4)).toStrictEqual([0n, 0n, 0n, 0n]);
  });

  it('rejects a non-positive line count or negative shipping', () => {
    expect(() => allocateShipping(100n, 0)).toThrow(SaleError);
    expect(() => allocateShipping(100n, -1)).toThrow(SaleError);
    expect(() => allocateShipping(-1n, 2)).toThrow(SaleError);
  });
});
