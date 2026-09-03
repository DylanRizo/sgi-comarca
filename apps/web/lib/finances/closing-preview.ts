const nonNegativeMoneyPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

export type ClosingPreview =
  | { field: 'businessDate' | 'realCash' | 'realDigital'; kind: 'invalid' }
  | { kind: 'valid' };

/**
 * Validate the counted amounts before sending a closing. The system sales
 * figure, the tolerance and the balanced flag are resolved by the server
 * (ADR-010), so this cannot preview the difference — only that the request
 * is well-formed.
 */
export function closingPreview(
  businessDate: string,
  realCash: string,
  realDigital: string,
): ClosingPreview {
  if (!businessDatePattern.test(businessDate)) {
    return { field: 'businessDate', kind: 'invalid' };
  }
  if (!nonNegativeMoneyPattern.test(realCash)) {
    return { field: 'realCash', kind: 'invalid' };
  }
  if (!nonNegativeMoneyPattern.test(realDigital)) {
    return { field: 'realDigital', kind: 'invalid' };
  }
  return { kind: 'valid' };
}

export type ClosingBalance =
  | { kind: 'unknown' }
  | {
      kind: 'known';
      balanced: boolean;
      /** Signed canonical `Decimal(18,2)`; negative means money fell short. */
      difference: string;
    };

function toCents(value: string): bigint | null {
  if (!nonNegativeMoneyPattern.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(2, '0').slice(0, 2));
}

function fromCents(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const padded = magnitude.toString().padStart(3, '0');
  return `${negative ? '-' : ''}${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

/**
 * The balance the partner sees while typing, using the same formula and the
 * same tolerance the server will apply (ADR-010, DEC-023 and DEC-024).
 *
 * `difference = cash + digital − system sales`, and expenses take no part.
 * Balanced is a strict comparison, so a difference exactly equal to the
 * tolerance is not balanced — the screen must not promise a result the server
 * would then contradict.
 *
 * Arithmetic runs on integer cents, never `number`, so the indicator cannot
 * drift from the recorded figure by a cent.
 */
export function closingBalance(
  systemSales: string,
  realCash: string,
  realDigital: string,
  tolerance: string,
): ClosingBalance {
  const sales = toCents(systemSales);
  const cash = toCents(realCash || '0');
  const digital = toCents(realDigital || '0');
  const allowed = toCents(tolerance);
  if (sales === null || cash === null || digital === null || allowed === null) {
    return { kind: 'unknown' };
  }

  const difference = cash + digital - sales;
  const magnitude = difference < 0n ? -difference : difference;
  return {
    balanced: magnitude < allowed,
    difference: fromCents(difference),
    kind: 'known',
  };
}
