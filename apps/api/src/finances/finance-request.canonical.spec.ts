import type { CreateFinancialEntryRequest } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  canonicalDailyClosingRequest,
  canonicalFinancialEntryRequest,
  canonicalReopeningRequest,
  sha256,
} from './finance-request.canonical.js';
import { FinanceError } from './finance.errors.js';

const categoryId = '00000000-0000-4000-8000-000000000001';
const responsibleUserId = '00000000-0000-4000-8000-000000000002';
const closingId = '00000000-0000-4000-8000-000000000003';

function entry(
  overrides: Partial<CreateFinancialEntryRequest> = {},
): CreateFinancialEntryRequest {
  return {
    amount: '25.00',
    businessDate: '2026-08-29',
    categoryId,
    entryType: 'EXPENSE',
    responsibleUserId,
    ...overrides,
  };
}

describe('canonicalFinancialEntryRequest', () => {
  it('normalizes money scale and uuid case', () => {
    const parsed = JSON.parse(
      canonicalFinancialEntryRequest(
        entry({ amount: '25', categoryId: categoryId.toUpperCase() }),
      ),
    );
    expect(parsed.amount).toBe('25.00');
    expect(parsed.categoryId).toBe(categoryId);
    expect(parsed.description).toBeNull();
  });

  it('hashes equivalent amounts identically', () => {
    expect(
      sha256(canonicalFinancialEntryRequest(entry({ amount: '25' }))),
    ).toBe(sha256(canonicalFinancialEntryRequest(entry({ amount: '25.00' }))));
  });

  it('distinguishes a different amount, type or date', () => {
    const base = sha256(canonicalFinancialEntryRequest(entry()));
    expect(
      sha256(canonicalFinancialEntryRequest(entry({ amount: '26.00' }))),
    ).not.toBe(base);
    expect(
      sha256(canonicalFinancialEntryRequest(entry({ entryType: 'INCOME' }))),
    ).not.toBe(base);
    expect(
      sha256(
        canonicalFinancialEntryRequest(entry({ businessDate: '2026-08-30' })),
      ),
    ).not.toBe(base);
  });

  it('trims a description and treats blank as absent', () => {
    const trimmed = JSON.parse(
      canonicalFinancialEntryRequest(entry({ description: '  Compra  ' })),
    );
    expect(trimmed.description).toBe('Compra');
    const blank = JSON.parse(
      canonicalFinancialEntryRequest(entry({ description: '   ' })),
    );
    expect(blank.description).toBeNull();
  });

  it('rejects a zero, negative or over-scaled amount', () => {
    for (const amount of ['0', '0.00', '-5.00', '5.005']) {
      expect(() => canonicalFinancialEntryRequest(entry({ amount }))).toThrow(
        new FinanceError('FINANCE_REQUEST_INVALID'),
      );
    }
  });

  it('rejects a malformed date, uuid or type', () => {
    expect(() =>
      canonicalFinancialEntryRequest(entry({ businessDate: '29-08-2026' })),
    ).toThrow(FinanceError);
    expect(() =>
      canonicalFinancialEntryRequest(entry({ categoryId: 'no-es-uuid' })),
    ).toThrow(FinanceError);
    expect(() =>
      canonicalFinancialEntryRequest(
        entry({ entryType: 'TRANSFER' as unknown as 'INCOME' }),
      ),
    ).toThrow(FinanceError);
  });

  it('produces a lowercase 64-char sha-256', () => {
    expect(sha256(canonicalFinancialEntryRequest(entry()))).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });
});

describe('canonicalDailyClosingRequest', () => {
  it('keeps only the counted intent, never server-resolved figures', () => {
    const parsed = JSON.parse(
      canonicalDailyClosingRequest({
        businessDate: '2026-08-29',
        realCash: '60',
        realDigital: '40.5',
      }),
    );
    expect(parsed).toStrictEqual({
      businessDate: '2026-08-29',
      observations: null,
      realCash: '60.00',
      realDigital: '40.50',
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('systemSales');
    expect(serialized).not.toContain('tolerance');
    expect(serialized).not.toContain('difference');
    expect(serialized).not.toContain('balanced');
  });

  it('rejects negative counted money', () => {
    expect(() =>
      canonicalDailyClosingRequest({
        businessDate: '2026-08-29',
        realCash: '-1.00',
        realDigital: '0.00',
      }),
    ).toThrow(new FinanceError('CLOSING_REQUEST_INVALID'));
  });
});

describe('canonicalReopeningRequest', () => {
  it('trims the reason and keeps the target', () => {
    const parsed = JSON.parse(
      canonicalReopeningRequest(closingId, '  Conteo corregido  '),
    );
    expect(parsed).toStrictEqual({
      closingId,
      reason: 'Conteo corregido',
    });
  });

  it('rejects a blank or oversized reason', () => {
    expect(() => canonicalReopeningRequest(closingId, '   ')).toThrow(
      new FinanceError('CLOSING_REQUEST_INVALID'),
    );
    expect(() => canonicalReopeningRequest(closingId, 'x'.repeat(501))).toThrow(
      FinanceError,
    );
  });
});
