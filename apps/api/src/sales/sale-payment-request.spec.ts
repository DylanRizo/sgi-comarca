import { describe, expect, it } from 'vitest';
import { paymentIntent, prepareSalePayment } from './sale-payment-request.js';

describe('full sale payment intent', () => {
  it('keeps a one-line allocation readable as its actual method', () => {
    expect(
      prepareSalePayment({
        splitPayments: [{ methodText: 'Efectivo', amount: '1' }],
      }).methodText,
    ).toBe('Efectivo');
  });
  it('preserves the old single-method canonical hash input', () => {
    expect(
      paymentIntent(
        'sale',
        prepareSalePayment({ paymentMethodText: ' Digital ' }),
      ),
    ).toBe(JSON.stringify({ paymentMethodText: 'Digital', saleId: 'sale' }));
  });
  it('normalizes amounts exactly and covers all split lines', () => {
    const payment = prepareSalePayment({
      splitPayments: [
        { methodText: ' Efectivo ', amount: '0.10' },
        { methodText: 'Digital', amount: '0.2' },
      ],
    });
    expect(payment.totalCents).toBe(30n);
    expect(payment.parts?.[1]?.amount).toBe('0.20');
    expect(paymentIntent('sale', payment)).toContain('0.20');
  });
  it.each([
    '0',
    '0.00',
    '-1',
    '0.001',
    '1e2',
    'NaN',
    '10000000000000000',
    '9999999999999999.99',
    ' 1 ',
    '',
  ])('rejects invalid/out-of-range positive amount %s', (amount) => {
    expect(() =>
      prepareSalePayment({
        splitPayments: [{ methodText: 'Digital', amount }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'SALE_PAYMENT_AMOUNT_INVALID' }),
    );
  });
  it.each([
    {},
    {
      paymentMethodText: 'Efectivo',
      splitPayments: [{ methodText: 'Digital', amount: '1' }],
    },
    { splitPayments: [] },
    {
      splitPayments: Array.from({ length: 11 }, () => ({
        methodText: 'Digital',
        amount: '1',
      })),
    },
    { paymentMethodText: ' ' },
    { splitPayments: [{ methodText: ' ', amount: '1' }] },
  ])('rejects ambiguous or incomplete shape', (input) => {
    expect(() => prepareSalePayment(input)).toThrowError(
      expect.objectContaining({ code: 'SALES_REQUEST_INVALID' }),
    );
  });
});
