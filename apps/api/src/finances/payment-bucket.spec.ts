import { describe, expect, it } from 'vitest';
import { paymentBucket } from './payment-bucket.js';
describe('payment allocation classification', () => {
  it.each(['Efectivo', ' cash '])('classifies %s as cash', (method) =>
    expect(paymentBucket(method)).toBe('cash'),
  );
  it.each([
    'Digital',
    'Tarjeta',
    ' Transferencia ',
    'Tarjeta de crédito',
    'tarjeta de débito',
    'Transferencia bancaria',
  ])('classifies %s as digital', (method) =>
    expect(paymentBucket(method)).toBe('digital'),
  );
  it.each([null, 'Mixto', 'Efectivo / Digital', 'Otro'])(
    'does not invent a split for %s',
    (method) => expect(paymentBucket(method)).toBe('unspecified'),
  );
});
