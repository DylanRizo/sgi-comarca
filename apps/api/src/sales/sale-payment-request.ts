import type {
  RecordSalePaymentRequest,
  SplitPaymentLineRequest,
} from '@sgi/contracts';

import { centsToMoney, moneyToCents } from '../common/money.js';
import { SaleError } from './sale.errors.js';

export interface PreparedSalePayment {
  methodText: string;
  parts: SplitPaymentLineRequest[] | null;
  totalCents: bigint | null;
}

/** One full receipt, either one free-text method or an exact split. */
export function prepareSalePayment(
  input: string | RecordSalePaymentRequest,
): PreparedSalePayment {
  const value =
    typeof input === 'string' ? { paymentMethodText: input } : input;
  if (!value || typeof value !== 'object')
    throw new SaleError('SALES_REQUEST_INVALID');
  const single = value.paymentMethodText !== undefined;
  const split = value.splitPayments !== undefined;
  if (single === split) throw new SaleError('SALES_REQUEST_INVALID');
  const method = (text: unknown): string => {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 160)
      throw new SaleError('SALES_REQUEST_INVALID');
    return text.trim();
  };
  if (single)
    return {
      methodText: method(value.paymentMethodText),
      parts: null,
      totalCents: null,
    };
  if (
    !Array.isArray(value.splitPayments) ||
    value.splitPayments.length < 1 ||
    value.splitPayments.length > 10
  )
    throw new SaleError('SALES_REQUEST_INVALID');
  let totalCents = 0n;
  const parts = value.splitPayments.map((part) => {
    if (!part || typeof part !== 'object')
      throw new SaleError('SALES_REQUEST_INVALID');
    const amount =
      typeof part.amount === 'string' ? moneyToCents(part.amount) : null;
    if (amount === null || amount <= 0n)
      throw new SaleError('SALE_PAYMENT_AMOUNT_INVALID');
    totalCents += amount;
    return {
      methodText: method(part.methodText),
      amount: centsToMoney(amount),
    };
  });
  return {
    methodText: parts.length === 1 ? parts[0]!.methodText : 'Mixto',
    parts,
    totalCents,
  };
}

/** Keep the pre-ADR-022 hash for single-payment retries across deployment. */
export function paymentIntent(
  saleId: string,
  payment: PreparedSalePayment,
): string {
  return JSON.stringify(
    payment.parts
      ? { saleId, splitPayments: payment.parts }
      : { paymentMethodText: payment.methodText, saleId },
  );
}
