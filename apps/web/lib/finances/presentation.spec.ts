import type { DailyClosingView } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  canReopen,
  closingStatusLabel,
  entryTypeLabel,
  formatBusinessDate,
  lineSourceLabel,
} from './presentation';

function closing(overrides: Partial<DailyClosingView> = {}): DailyClosingView {
  return {
    balanced: true,
    businessDate: '2026-09-01',
    closedAt: '2026-09-01T20:00:00.000Z',
    closedByUserId: null,
    currencyCode: 'NIO',
    difference: '0.00',
    id: 'closing-1',
    inTransitSaleCount: 0,
    observations: null,
    origin: 'OPERATIONAL',
    realCash: '0.00',
    realDigital: '0.00',
    reopenings: [],
    status: 'CLOSED',
    systemSales: '0.00',
    toleranceApplied: '0.50',
    ...overrides,
  };
}

describe('finances presentation', () => {
  it('labels entry types and line sources in Spanish', () => {
    expect(entryTypeLabel('INCOME')).toBe('Ingreso');
    expect(entryTypeLabel('EXPENSE')).toBe('Gasto');
    expect(lineSourceLabel('SALE')).toBe('Venta');
    expect(lineSourceLabel('MANUAL')).toBe('Manual');
  });

  it('labels closing status in Spanish', () => {
    expect(closingStatusLabel('CLOSED')).toBe('Cerrado');
    expect(closingStatusLabel('REOPENED')).toBe('Reabierto');
  });

  it('allows reopening only a closed closing', () => {
    expect(canReopen(closing({ status: 'CLOSED' }))).toBe(true);
    expect(canReopen(closing({ status: 'REOPENED' }))).toBe(false);
  });

  it('renders the business date without shifting the civil day', () => {
    // A year boundary catches the west-of-Greenwich off-by-one day.
    expect(formatBusinessDate('2026-01-01')).toContain('2026');
    expect(formatBusinessDate('2026-01-01')).toContain('1');
    expect(formatBusinessDate('no-es-fecha')).toBe('no-es-fecha');
  });
});
