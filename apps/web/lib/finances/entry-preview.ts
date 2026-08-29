const positiveMoneyPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u;

export type EntryPreview =
  { kind: 'empty' | 'invalid' | 'zero' } | { amount: string; kind: 'valid' };

/**
 * Validate the amount typed for a manual financial entry. The server is the
 * final authority (a strictly positive `Decimal(18,2)`); this only gives
 * immediate feedback before sending the request.
 */
export function entryPreview(amount: string): EntryPreview {
  if (!amount) return { kind: 'empty' };
  if (!positiveMoneyPattern.test(amount)) return { kind: 'invalid' };
  if (Number(amount) === 0) return { kind: 'zero' };
  return { amount, kind: 'valid' };
}
