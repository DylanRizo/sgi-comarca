import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMON_PASSWORD_CONTENT_SHA256,
  COMMON_PASSWORD_ENTRY_COUNT,
  commonPasswords,
} from '../password/common-passwords.generated.js';
import { PasswordPolicyError } from './authentication.errors.js';
import { PasswordPolicy } from './password-policy.js';

describe('PasswordPolicy', () => {
  const policy = new PasswordPolicy();

  it('enforces 12 through 128 Unicode code points without trimming spaces', () => {
    expect(() => policy.validate('a'.repeat(11), 'seller')).toThrow(
      PasswordPolicyError,
    );
    expect(policy.validate(' a safe phrase ', 'seller')).toBe(
      ' a safe phrase ',
    );
    expect(policy.validate('🟢'.repeat(128), 'seller')).toBe('🟢'.repeat(128));
    expect(() => policy.validate('🟢'.repeat(129), 'seller')).toThrow(
      PasswordPolicyError,
    );
  });

  it('normalizes to NFC before returning the password', () => {
    const decomposed = `phrase-${'e\u0301'}-secure`;
    expect(policy.validate(decomposed, 'seller')).toBe(
      decomposed.normalize('NFC'),
    );
  });

  it('rejects a password from the pinned local blocklist', () => {
    const blocked = commonPasswords.values().next().value;
    expect(blocked).toBeTypeOf('string');
    expect(() => policy.validate(blocked ?? '', 'seller')).toThrowError(
      expect.objectContaining({ code: 'COMMON_PASSWORD' }),
    );
  });

  it('verifies the generated blocklist entry count and content checksum', () => {
    expect(commonPasswords.size).toBe(COMMON_PASSWORD_ENTRY_COUNT);
    expect(
      createHash('sha256')
        .update([...commonPasswords].join('\n'), 'utf8')
        .digest('hex'),
    ).toBe(COMMON_PASSWORD_CONTENT_SHA256);
  });

  it.each([
    'dylan1234567',
    '1234567dylan',
    '1234567nalyd',
    '!!dylansecure!!',
    'dyl4n-password',
    'dyl@n-password',
  ])('rejects an approved trivial identifier variation: %s', (password) => {
    expect(() => policy.validate(password, 'Dylan')).toThrowError(
      expect.objectContaining({ code: 'SIMILAR_TO_IDENTIFIER' }),
    );
  });

  it('does not apply edit-distance or arbitrary composition rules', () => {
    expect(policy.validate('calm river orchard', 'dylan')).toBe(
      'calm river orchard',
    );
    expect(policy.validate('onlylowercasewords', 'dylan')).toBe(
      'onlylowercasewords',
    );
  });
});
