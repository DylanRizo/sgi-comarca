/**
 * Money primitives shared by every module that stores currency.
 *
 * Money is PostgreSQL `NUMERIC(18,2)` / Prisma `Decimal(18,2)` and is handled
 * here as a non-negative scaled integer (cents). No `number`/float is used, so
 * no amount is ever subject to binary floating-point rounding.
 */
const moneyPattern = /^(\d{1,16})(?:\.(\d{1,2}))?$/u;

export const moneyScale = 2;

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

/**
 * Format cents back into a canonical `Decimal(18,2)` string. Negative values
 * are supported because a signed amount, such as a closing difference, is
 * still money.
 */
export function centsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const padded = absolute.toString().padStart(moneyScale + 1, '0');
  const whole = padded.slice(0, -moneyScale);
  const fraction = padded.slice(-moneyScale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
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
