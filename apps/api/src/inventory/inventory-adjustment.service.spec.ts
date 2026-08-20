import { describe, expect, it } from 'vitest';

import {
  calculateInventoryAdjustment,
  InventoryAdjustmentError,
} from './inventory-adjustment.service.js';

describe('InventoryAdjustmentService calculation', () => {
  it('calculates positive and negative signed adjustments exactly', () => {
    expect(calculateInventoryAdjustment('10.2500', '+5')).toEqual({
      balanceAfter: '15.25',
      balanceBefore: '10.25',
      quantityDelta: '5',
    });
    expect(calculateInventoryAdjustment('15.25', '-3.1250')).toEqual({
      balanceAfter: '12.125',
      balanceBefore: '15.25',
      quantityDelta: '-3.125',
    });
  });

  it('rejects zero, invalid precision and a negative final balance', () => {
    for (const delta of ['0', '0.0000', '-0']) {
      expect(() => calculateInventoryAdjustment('10', delta)).toThrowError(
        new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID'),
      );
    }
    expect(() => calculateInventoryAdjustment('10', '1.00001')).toThrowError(
      new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID'),
    );
    expect(() => calculateInventoryAdjustment('2', '-2.0001')).toThrowError(
      new InventoryAdjustmentError('INVENTORY_NEGATIVE_BALANCE'),
    );
    expect(() =>
      calculateInventoryAdjustment('99999999999999.9999', '0.0001'),
    ).toThrowError(
      new InventoryAdjustmentError('INVENTORY_ADJUSTMENT_INVALID'),
    );
  });
});
