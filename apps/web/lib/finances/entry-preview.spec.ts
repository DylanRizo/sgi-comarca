import { describe, expect, it } from 'vitest';

import { entryPreview } from './entry-preview';

describe('entryPreview', () => {
  it('accepts a positive amount with up to two decimals', () => {
    expect(entryPreview('25')).toStrictEqual({ amount: '25', kind: 'valid' });
    expect(entryPreview('25.50')).toStrictEqual({
      amount: '25.50',
      kind: 'valid',
    });
  });

  it('rejects an empty, zero, negative or over-scaled amount', () => {
    expect(entryPreview('')).toStrictEqual({ kind: 'empty' });
    expect(entryPreview('0')).toStrictEqual({ kind: 'zero' });
    expect(entryPreview('0.00')).toStrictEqual({ kind: 'zero' });
    expect(entryPreview('-5')).toStrictEqual({ kind: 'invalid' });
    expect(entryPreview('5.005')).toStrictEqual({ kind: 'invalid' });
    expect(entryPreview('abc')).toStrictEqual({ kind: 'invalid' });
  });
});
