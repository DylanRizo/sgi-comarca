import { describe, expect, it } from 'vitest';

import { transferPreview } from './transfer-preview';

describe('transferPreview', () => {
  it('moves stock without changing the consolidated total', () => {
    expect(transferPreview('10', '4', '3', false, '14')).toEqual({
      destinationAfter: '7',
      destinationBefore: '4',
      kind: 'valid',
      originAfter: '7',
      originBefore: '10',
      quantity: '3',
      stockTotalAfter: '14',
      stockTotalBefore: '14',
    });
  });

  it('rejects same warehouse, zero, invalid precision and insufficient stock', () => {
    expect(transferPreview('10', '4', '3', true, '14').kind).toBe(
      'same-warehouse',
    );
    expect(transferPreview('10', '4', '0', false, '14').kind).toBe('zero');
    expect(transferPreview('10', '4', '1.00001', false, '14').kind).toBe(
      'invalid',
    );
    expect(transferPreview('2', '4', '3', false, '6').kind).toBe(
      'insufficient',
    );
  });

  it('uses zero for a destination without a prior balance', () => {
    expect(transferPreview('5', undefined, '2', false, '5')).toMatchObject({
      destinationAfter: '2',
      destinationBefore: '0',
      kind: 'valid',
      originAfter: '3',
    });
  });
});
