/**
 * Operational price/cost of one locked `InventoryBalance`. Money travels as the
 * exact NUMERIC text PostgreSQL returned, never as a float.
 */
export type TransferBalanceValuation = {
  costReviewRequired: boolean;
  currentUnitCost: string | null;
  currentUnitPrice: string | null;
  priceReviewRequired: boolean;
};

export type InheritedTransferValuation = {
  cost: { currentUnitCost: string; costReviewRequired: boolean } | null;
  price: { currentUnitPrice: string; priceReviewRequired: boolean } | null;
};

/**
 * ADR-019: a destination balance without a cost or price takes the origin's,
 * together with its review flag. Cost and price are decided independently. An
 * existing destination value is never replaced, even when it differs from the
 * origin, and a missing origin value leaves the destination missing too: no
 * value is ever invented.
 */
export function inheritedTransferValuation(
  source: TransferBalanceValuation,
  destination: TransferBalanceValuation,
): InheritedTransferValuation {
  return {
    cost:
      destination.currentUnitCost === null && source.currentUnitCost !== null
        ? {
            costReviewRequired: source.costReviewRequired,
            currentUnitCost: source.currentUnitCost,
          }
        : null,
    price:
      destination.currentUnitPrice === null && source.currentUnitPrice !== null
        ? {
            currentUnitPrice: source.currentUnitPrice,
            priceReviewRequired: source.priceReviewRequired,
          }
        : null,
  };
}
