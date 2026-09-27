import { describe, expect, it } from 'vitest';

import {
  inheritedTransferValuation,
  type TransferBalanceValuation,
} from './inventory-transfer-valuation.js';

const valued: TransferBalanceValuation = {
  costReviewRequired: false,
  currentUnitCost: '82.00',
  currentUnitPrice: '330.00',
  priceReviewRequired: false,
};
const empty: TransferBalanceValuation = {
  costReviewRequired: false,
  currentUnitCost: null,
  currentUnitPrice: null,
  priceReviewRequired: false,
};

describe('inheritedTransferValuation', () => {
  it('gives an unvalued destination the origin cost and price', () => {
    expect(inheritedTransferValuation(valued, empty)).toEqual({
      cost: { costReviewRequired: false, currentUnitCost: '82.00' },
      price: { currentUnitPrice: '330.00', priceReviewRequired: false },
    });
  });

  it('never replaces an existing destination value, even a different one', () => {
    expect(
      inheritedTransferValuation(valued, {
        ...valued,
        currentUnitCost: '90.00',
        currentUnitPrice: '350.00',
      }),
    ).toEqual({ cost: null, price: null });
  });

  it('keeps an existing zero cost, which is a value and not a gap', () => {
    expect(
      inheritedTransferValuation(valued, {
        ...empty,
        costReviewRequired: true,
        currentUnitCost: '0.00',
      }).cost,
    ).toBeNull();
  });

  it('decides cost and price independently', () => {
    expect(
      inheritedTransferValuation(valued, {
        ...empty,
        currentUnitCost: '75.00',
      }),
    ).toEqual({
      cost: null,
      price: { currentUnitPrice: '330.00', priceReviewRequired: false },
    });
    expect(
      inheritedTransferValuation(valued, {
        ...empty,
        currentUnitPrice: '300.00',
      }),
    ).toEqual({
      cost: { costReviewRequired: false, currentUnitCost: '82.00' },
      price: null,
    });
  });

  it('carries the origin review flags with the inherited values', () => {
    expect(
      inheritedTransferValuation(
        {
          costReviewRequired: true,
          currentUnitCost: '0.00',
          currentUnitPrice: '120.00',
          priceReviewRequired: true,
        },
        empty,
      ),
    ).toEqual({
      cost: { costReviewRequired: true, currentUnitCost: '0.00' },
      price: { currentUnitPrice: '120.00', priceReviewRequired: true },
    });
  });

  it('invents nothing when the origin is also missing a value', () => {
    expect(
      inheritedTransferValuation(
        { ...empty, costReviewRequired: true, priceReviewRequired: true },
        empty,
      ),
    ).toEqual({ cost: null, price: null });
    expect(
      inheritedTransferValuation({ ...valued, currentUnitPrice: null }, empty),
    ).toEqual({
      cost: { costReviewRequired: false, currentUnitCost: '82.00' },
      price: null,
    });
  });
});
