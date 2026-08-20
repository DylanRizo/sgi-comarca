import { describe, expect, it } from 'vitest';

import { adjustmentPreview } from './adjustment-preview.js';

describe('inventory adjustment preview', () => {
  it('shows exact positive and negative results', () => {
    expect(adjustmentPreview('10.25', '+5')).toEqual({
      balanceAfter: '15.25',
      direction: 'ENTRY',
      kind: 'valid',
      quantityDelta: '5',
    });
    expect(adjustmentPreview('10.25', '-3.125')).toEqual({
      balanceAfter: '7.125',
      direction: 'EXIT',
      kind: 'valid',
      quantityDelta: '-3.125',
    });
  });

  it('rejects zero, invalid precision and negative results', () => {
    expect(adjustmentPreview('10', '0')).toEqual({ kind: 'zero' });
    expect(adjustmentPreview('10', '1.00001')).toEqual({ kind: 'invalid' });
    expect(adjustmentPreview('2', '-3')).toEqual({ kind: 'negative' });
    expect(adjustmentPreview('99999999999999.9999', '0.0001')).toEqual({
      kind: 'invalid',
    });
  });
});
