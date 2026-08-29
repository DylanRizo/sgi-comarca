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
