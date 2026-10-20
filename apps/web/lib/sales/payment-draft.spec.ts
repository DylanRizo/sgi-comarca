import { describe, expect, it } from 'vitest';
import { splitPaymentDraft } from './payment-draft';
const lines = (a: string, b: string) => [
  { id: 'a', methodText: 'Efectivo', amount: a },
  { id: 'b', methodText: 'Digital', amount: b },
];
describe('hybrid payment preview', () => {
  it('keeps cents exact', () =>
    expect(splitPaymentDraft('0.30', lines('0.10', '0.20'))).toMatchObject({
      assigned: '0.30',
      remaining: '0.00',
      request: {
        splitPayments: [
          { methodText: 'Efectivo', amount: '0.10' },
          { methodText: 'Digital', amount: '0.20' },
        ],
      },
    }));
  it.each([
    ['400', '599.99'],
    ['400', '600.01'],
    ['0', '1000'],
    ['-1', '1001'],
    ['0.001', '1000'],
    ['', '1000'],
  ])('blocks incomplete or invalid %s/%s', (a, b) =>
    expect(splitPaymentDraft('1000.00', lines(a, b)).request).toBeNull(),
  );
  it('does not discard an unknown method', () =>
    expect(
      splitPaymentDraft('1', [{ id: 'a', methodText: 'Otro', amount: '1' }])
        .request,
    ).not.toBeNull());
});
