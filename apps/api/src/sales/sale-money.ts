import {
  centsToMoney,
  maximumMoneyCents,
  moneyToCents,
  sumCents,
} from '../common/money.js';
import { inventoryScaledInteger } from '../inventory/inventory-quantity.js';

/**
 * Sale-specific money rules. The shared primitives live in `common/money.ts`
 * and are re-exported here so the sales module keeps one import surface.
 */
export { centsToMoney, maximumMoneyCents, moneyToCents, sumCents };

/** Quantities are scaled by 10^4 (`Decimal(18,4)`), matching inventory-quantity. */
const quantityFactor = 10_000n;

/**
 * `lineSubtotal = quantity × unitPrice`, rounded to cents exactly once with
 * ROUND_HALF_UP (plan §6). Both inputs are non-negative, so half-up reduces to
 * an even-denominator midpoint bias: `(product + factor/2) / factor`.
 *
 * quantity is scaled by 10^4 and price by 10^2, so their product is scaled by
 * 10^6; dividing by 10^4 yields cents (scale 2).
 */
export function lineSubtotalCents(
  quantity: string,
  unitPrice: string,
): bigint | null {
  const scaledQuantity = inventoryScaledInteger(quantity);
  const priceCents = moneyToCents(unitPrice);
  if (scaledQuantity === null || scaledQuantity <= 0n) return null;
  if (priceCents === null) return null;
  const scaledProduct = scaledQuantity * priceCents; // scaled by 10^6
  const halfUp = scaledProduct + quantityFactor / 2n;
  const cents = halfUp / quantityFactor;
  return cents > maximumMoneyCents ? null : cents;
}
