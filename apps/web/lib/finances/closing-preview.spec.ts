import { describe, expect, it } from 'vitest';

import { closingBalance, closingPreview } from './closing-preview';

describe('closingPreview', () => {
  it('accepts valid non-negative counted amounts', () => {
    expect(closingPreview('2026-09-01', '0', '0')).toStrictEqual({
      kind: 'valid',
    });
    expect(closingPreview('2026-09-01', '60.00', '40.50')).toStrictEqual({
      kind: 'valid',
    });
  });

  it('rejects a malformed business date', () => {
    expect(closingPreview('01-09-2026', '0', '0')).toStrictEqual({
      field: 'businessDate',
      kind: 'invalid',
    });
  });

  it('rejects negative or over-scaled counted amounts', () => {
    expect(closingPreview('2026-09-01', '-1', '0')).toStrictEqual({
      field: 'realCash',
      kind: 'invalid',
    });
    expect(closingPreview('2026-09-01', '0', '5.005')).toStrictEqual({
      field: 'realDigital',
      kind: 'invalid',
    });
  });
});

describe('closingBalance', () => {
  it('reports a balanced drawer when the counted money matches', () => {
    expect(closingBalance('100.00', '60.00', '40.00', '0.50')).toEqual({
      balanced: true,
      difference: '0.00',
      kind: 'known',
    });
  });

  it('signs a shortfall negative and a surplus positive', () => {
    expect(closingBalance('100.00', '50.00', '40.00', '0.50')).toMatchObject({
      balanced: false,
      difference: '-10.00',
    });
    expect(closingBalance('100.00', '70.00', '40.00', '0.50')).toMatchObject({
      balanced: false,
      difference: '10.00',
    });
  });

  it('accepts a difference inside the tolerance', () => {
    expect(closingBalance('100.00', '100.40', '0', '0.50')).toMatchObject({
      balanced: true,
      difference: '0.40',
    });
  });

  it('treats a difference exactly equal to the tolerance as unbalanced', () => {
    // The server compares strictly, so the screen must not promise a result
    // the server would then contradict.
    expect(closingBalance('100.00', '100.50', '0', '0.50')).toMatchObject({
      balanced: false,
      difference: '0.50',
    });
  });

  it('keeps cents exact where floating point would drift', () => {
    expect(closingBalance('0.30', '0.10', '0.20', '0.50')).toMatchObject({
      difference: '0.00',
    });
  });

  it('reads an empty input as zero counted', () => {
    expect(closingBalance('50.00', '', '', '0.50')).toMatchObject({
      difference: '-50.00',
    });
  });

  it('reports unknown rather than guessing on a malformed amount', () => {
    expect(closingBalance('100.00', 'abc', '0', '0.50')).toEqual({
      kind: 'unknown',
    });
  });
});
