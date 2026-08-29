import { describe, expect, it } from 'vitest';

import {
  calculateClosing,
  defaultClosingTolerance,
} from './daily-closing.calculation.js';
import { FinanceError } from './finance.errors.js';

function closing(
  overrides: Partial<Parameters<typeof calculateClosing>[0]> = {},
) {
  return calculateClosing({
    realCash: '60.00',
    realDigital: '40.00',
    systemSales: '100.00',
    tolerance: defaultClosingTolerance,
    ...overrides,
  });
}

describe('calculateClosing', () => {
  it('applies the approved formula without expenses', () => {
    const result = closing();
    expect(result.difference).toBe('0.00');
    expect(result.balanced).toBe(true);
    expect(result.toleranceApplied).toBe('0.50');
  });

  it('reports a signed shortfall when counted money falls short', () => {
    expect(closing({ systemSales: '100.60' }).difference).toBe('-0.60');
    expect(closing({ systemSales: '100.60' }).balanced).toBe(false);
  });

  it('reports a signed surplus when counted money exceeds sales', () => {
    expect(closing({ realCash: '60.75' }).difference).toBe('0.75');
    expect(closing({ realCash: '60.75' }).balanced).toBe(false);
  });

  it('treats the tolerance as strict, matching the database CHECK', () => {
    // Exactly at the tolerance is NOT balanced: abs(difference) < tolerance.
    expect(closing({ realCash: '60.50' }).difference).toBe('0.50');
    expect(closing({ realCash: '60.50' }).balanced).toBe(false);
    expect(closing({ realCash: '60.49' }).balanced).toBe(true);
    expect(closing({ systemSales: '100.50' }).balanced).toBe(false);
    expect(closing({ systemSales: '100.49' }).balanced).toBe(true);
  });

  it('honours a configured tolerance other than the legacy default', () => {
    expect(closing({ realCash: '61.00', tolerance: '2.00' }).balanced).toBe(
      true,
    );
    expect(closing({ realCash: '61.00', tolerance: '0.50' }).balanced).toBe(
      false,
    );
    expect(closing({ tolerance: '0.00' }).balanced).toBe(false);
  });

  it('keeps every amount at canonical two-decimal scale', () => {
    const result = closing({ realCash: '60', realDigital: '40.5' });
    expect(result.realCash).toBe('60.00');
    expect(result.realDigital).toBe('40.50');
    expect(result.systemSales).toBe('100.00');
    expect(result.difference).toBe('0.50');
  });

  it('rejects negative or over-scaled amounts before reaching the database', () => {
    for (const bad of ['-1.00', '1.005', 'abc', '']) {
      expect(() => closing({ realCash: bad })).toThrow(
        new FinanceError('CLOSING_REQUEST_INVALID'),
      );
    }
    expect(() => closing({ tolerance: '-0.50' })).toThrow(FinanceError);
  });

  it('never loses a cent to floating point', () => {
    // 0.1 + 0.2 is the classic float trap; scaled integers keep it exact.
    const result = closing({
      realCash: '0.10',
      realDigital: '0.20',
      systemSales: '0.30',
    });
    expect(result.difference).toBe('0.00');
    expect(result.balanced).toBe(true);
  });
});
