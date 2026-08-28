import { SaleError } from './sale.errors.js';

/**
 * Distribute a shipping amount (in cents) across `lineCount` lines so the
 * allocations sum back to exactly `shippingCents` (plan §6).
 *
 * `base = floor(S / N)`, `residue = S mod N`; the first `residue` lines, by
 * validated item ordinal, each receive one extra cent. Every allocation is
 * non-negative and their sum is exactly `shippingCents`.
 */
export function allocateShipping(
  shippingCents: bigint,
  lineCount: number,
): bigint[] {
  if (!Number.isInteger(lineCount) || lineCount <= 0) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  if (shippingCents < 0n) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  const count = BigInt(lineCount);
  const base = shippingCents / count;
  const residue = shippingCents % count;
  const allocations: bigint[] = [];
  for (let ordinal = 0n; ordinal < count; ordinal += 1n) {
    allocations.push(ordinal < residue ? base + 1n : base);
  }
  return allocations;
}
