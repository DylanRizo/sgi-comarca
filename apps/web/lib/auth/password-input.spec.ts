import { describe, expect, it } from 'vitest';

import {
  codePointLength,
  normalizeNewPassword,
  validateNewPassword,
} from './password-input.js';

describe('web password input policy', () => {
  it('counts Unicode code points after NFC normalization', () => {
    expect(codePointLength('🟢'.repeat(12))).toBe(12);
    expect(normalizeNewPassword(`phrase-${'e\u0301'}-secure`)).toBe(
      `phrase-${'e\u0301'}-secure`.normalize('NFC'),
    );
  });

  it('preserves spaces and enforces 12 through 128 code points', () => {
    expect(validateNewPassword(' a safe phrase ', ' a safe phrase ')).toEqual(
      {},
    );
    expect(validateNewPassword('short', 'short')).toHaveProperty('password');
    expect(
      validateNewPassword('x'.repeat(129), 'x'.repeat(129)),
    ).toHaveProperty('password');
  });

  it('compares confirmations using the normalized value', () => {
    expect(
      validateNewPassword(`secure-${'e\u0301'}-phrase`, 'secure-é-phrase'),
    ).toEqual({});
    expect(
      validateNewPassword('secure phrase one', 'secure phrase two'),
    ).toHaveProperty('confirmation');
  });
});
