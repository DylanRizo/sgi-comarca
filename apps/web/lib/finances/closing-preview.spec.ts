import { describe, expect, it } from 'vitest';

import { closingPreview } from './closing-preview';

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
