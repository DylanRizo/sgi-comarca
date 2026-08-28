import { inventoryScaledInteger } from '../inventory/inventory-quantity.js';

/**
 * Money is PostgreSQL `NUMERIC(18,2)` / Prisma `Decimal(18,2)` and is handled
 * here as a non-negative scaled integer (cents). No `number`/float is used.
 * Quantities are `Decimal(18,4)` and reuse `inventory-quantity.ts` (scale 4).
 */
const moneyPattern = /^(\d{1,16})(?:\.(\d{1,2}))?$/u;
const moneyScale = 2;
/** Quantities are scaled by 10^4 (`Decimal(18,4)`), matching inventory-quantity. */
const quantityFactor = 10_000n;

/** Largest representable amount in cents for `Decimal(18,2)`. */
export const maximumMoneyCents = 9_999_999_999_999_999n;

/**
 * Parse a non-negative money string into cents. Returns `null` for a negative
 * sign, wrong scale, or out-of-range value; callers map `null` to a typed
 * domain error rather than relying on the database CHECK as an error surface.
 */
export function moneyToCents(value: string): bigint | null {
  const match = moneyPattern.exec(value);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(moneyScale, '0');
  const cents = BigInt(`${whole}${fraction}`);
  return cents > maximumMoneyCents ? null : cents;
}

/** Format non-negative cents back into a canonical `Decimal(18,2)` string. */
export function centsToMoney(cents: bigint): string {
  const padded = cents.toString().padStart(moneyScale + 1, '0');
  const whole = padded.slice(0, -moneyScale);
  const fraction = padded.slice(-moneyScale);
  return `${whole}.${fraction}`;
}

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

/** Exact sum of already-rounded cent values, bounded by the money range. */
export function sumCents(values: readonly bigint[]): bigint | null {
  let total = 0n;
  for (const value of values) {
    total += value;
    if (total > maximumMoneyCents) return null;
  }
  return total;
}
