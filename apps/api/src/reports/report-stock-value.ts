import { maximumMoneyCents } from '../common/money.js';
import { inventoryScaledInteger } from '../inventory/inventory-quantity.js';
import { moneyToCents } from '../common/money.js';

/**
 * Stock value for one balance line, in cents.
 *
 * Quantity carries four decimals and unit cost two, so their product carries
 * six. Rounding that back to cents is done half-up on the exact scaled integer
 * rather than in floating point, so a valuation total can never drift by a
 * cent the way a `number` multiplication would.
 *
 * Returns `null` when either input is absent or out of range; the caller emits
 * an empty column instead of guessing a value.
 */
export function stockValueCents(
  quantity: string,
  unitCost: string,
): bigint | null {
  const scaledQuantity = inventoryScaledInteger(quantity);
  const costCents = moneyToCents(unitCost);
  if (scaledQuantity === null || costCents === null) return null;

  const negative = scaledQuantity < 0n;
  const magnitude = negative ? -scaledQuantity : scaledQuantity;
  // scale 4 * scale 2 = scale 6; divide by 10^4 to land back on cents.
  const scaled = magnitude * costCents;
  const divisor = 10_000n;
  const truncated = scaled / divisor;
  const remainder = scaled % divisor;
  const rounded = remainder * 2n >= divisor ? truncated + 1n : truncated;
  if (rounded > maximumMoneyCents) return null;
  return negative ? -rounded : rounded;
}
