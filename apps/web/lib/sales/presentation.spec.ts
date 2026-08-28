import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  formatBusinessDate,
  formatSaleInstant,
  formatSaleMoney,
  formatSaleQuantity,
  saleOriginLabel,
  salePaymentStatusLabel,
  salePaymentStatusTone,
  saleStatusLabel,
  saleStatusTone,
  saleWarehouseCodes,
} from './presentation.js';

const originalTimeZone = process.env.TZ;

// The operational zone is west of UTC, which is precisely where a civil date
// rendered as an instant shifts to the previous day.
beforeAll(() => {
  process.env.TZ = 'America/Managua';
});

afterAll(() => {
  process.env.TZ = originalTimeZone;
});

describe('formatBusinessDate', () => {
  it('keeps the civil date when the viewer is west of UTC', () => {
    expect(formatBusinessDate('2026-01-01')).toContain('2026');
    expect(formatBusinessDate('2026-01-01')).not.toContain('2025');
  });

  it('does not shift a mid-year date backwards', () => {
    expect(formatBusinessDate('2026-08-28')).toBe('28 ago 2026');
  });

  it('returns the raw value when the date is unparseable', () => {
    expect(formatBusinessDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatSaleInstant', () => {
  it('renders a stored instant in America/Managua', () => {
    // 2026-01-01T02:00Z is still 2025-12-31 20:00 in Managua.
    expect(formatSaleInstant('2026-01-01T02:00:00.000Z')).toContain('2025');
  });

  it('reports an absent instant instead of failing', () => {
    expect(formatSaleInstant(null)).toBe('Sin registrar');
  });
});

describe('money and quantity', () => {
  it('formats money with the sale currency', () => {
    expect(formatSaleMoney('1500.5', 'NIO')).toContain('1,500.50');
  });

  it('reports absent money rather than rendering zero', () => {
    expect(formatSaleMoney(null, 'NIO')).toBe('No disponible');
  });

  it('normalizes an unnormalized persisted quantity', () => {
    expect(formatSaleQuantity('2.5000')).toBe(formatSaleQuantity('2.5'));
  });
});

describe('labels', () => {
  it('names fulfillment and payment independently', () => {
    expect(saleStatusLabel('IN_TRANSIT')).toBe('En tránsito');
    expect(saleStatusLabel('COMPLETED')).toBe('Entregada');
    expect(salePaymentStatusLabel('PENDING')).toBe('Pendiente de pago');
    expect(salePaymentStatusLabel('PAID')).toBe('Pagada');
  });

  it('tones a completed but unpaid sale as delivered and pending', () => {
    expect(saleStatusTone('COMPLETED')).toBe('positive');
    expect(salePaymentStatusTone('PENDING')).toBe('warning');
  });

  it('distinguishes operational from legacy sales', () => {
    expect(saleOriginLabel('OPERATIONAL')).toBe('Operativa');
    expect(saleOriginLabel('LEGACY_IMPORT')).toBe('Importada del legacy');
  });
});

describe('saleWarehouseCodes', () => {
  it('lists each warehouse once in first-appearance order', () => {
    expect(
      saleWarehouseCodes([
        { warehouse: { code: 'ALM-2' } },
        { warehouse: { code: 'ALM-1' } },
        { warehouse: { code: 'ALM-2' } },
      ]),
    ).toEqual(['ALM-2', 'ALM-1']);
  });
});
