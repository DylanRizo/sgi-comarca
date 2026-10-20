import type { RecordSalePaymentRequest } from '@sgi/contracts';

export interface PaymentDraftLine {
  id: string;
  methodText: string;
  amount: string;
}

/** Exact integer cents, bounded by NUMERIC(18,2); never parseFloat/Number. */
export function paymentCents(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  const cents = BigInt(whole + fraction.padEnd(2, '0'));
  return cents <= 9_999_999_999_999_999n ? cents : null;
}

export function paymentMoney(value: bigint): string {
  const absolute = (value < 0n ? -value : value).toString().padStart(3, '0');
  return `${value < 0n ? '-' : ''}${absolute.slice(0, -2)}.${absolute.slice(-2)}`;
}

export function splitPaymentDraft(
  total: string,
  lines: readonly PaymentDraftLine[],
): {
  assigned: string;
  remaining: string;
  request: RecordSalePaymentRequest | null;
} {
  const expected = paymentCents(total);
  let assigned = 0n;
  let valid = expected !== null && lines.length >= 1 && lines.length <= 10;
  for (const line of lines) {
    const amount = paymentCents(line.amount);
    if (
      amount === null ||
      amount <= 0n ||
      !line.methodText.trim() ||
      line.methodText.trim().length > 160
    )
      valid = false;
    if (amount !== null) assigned += amount;
  }
  const remaining = (expected ?? 0n) - assigned;
  return {
    assigned: paymentMoney(assigned),
    remaining: paymentMoney(remaining),
    request:
      valid && remaining === 0n
        ? {
            splitPayments: lines.map((line) => ({
              methodText: line.methodText.trim(),
              amount: paymentMoney(paymentCents(line.amount)!),
            })),
          }
        : null,
  };
}
