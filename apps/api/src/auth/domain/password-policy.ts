import { PasswordPolicyError } from './authentication.errors.js';
import { IdentifierNormalizer } from './identifier-normalizer.js';
import { commonPasswords } from '../password/common-passwords.generated.js';

const MINIMUM_PASSWORD_LENGTH = 12;
const MAXIMUM_PASSWORD_LENGTH = 128;

const obviousSubstitutions: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '!': 'i',
  $: 's',
  '@': 'a',
};

function reverse(value: string): string {
  return [...value].reverse().join('');
}

function replaceObviousSubstitutions(value: string): string {
  return [...value]
    .map((character) => obviousSubstitutions[character] ?? character)
    .join('');
}

function withoutEdgeNumbers(value: string): string {
  return value.replace(/^\p{Number}+|\p{Number}+$/gu, '');
}

export class PasswordPolicy {
  constructor(
    private readonly identifiers = new IdentifierNormalizer(),
    private readonly blockedPasswords = commonPasswords,
  ) {}

  validate(password: string, loginIdentifier: string): string {
    const normalizedPassword = password.normalize('NFC');
    const length = [...normalizedPassword].length;
    if (length < MINIMUM_PASSWORD_LENGTH || length > MAXIMUM_PASSWORD_LENGTH) {
      throw new PasswordPolicyError('INVALID_LENGTH');
    }

    if (
      this.blockedPasswords.has(normalizedPassword.toLocaleLowerCase('und'))
    ) {
      throw new PasswordPolicyError('COMMON_PASSWORD');
    }

    if (this.isClearlySimilar(normalizedPassword, loginIdentifier)) {
      throw new PasswordPolicyError('SIMILAR_TO_IDENTIFIER');
    }

    return normalizedPassword;
  }

  private isClearlySimilar(password: string, loginIdentifier: string): boolean {
    const identifier = this.identifiers.comparable(loginIdentifier);
    const candidate = this.identifiers.comparable(password);
    if (!identifier || !candidate) return false;

    if (candidate === identifier) return true;
    if (identifier.length >= 4 && candidate.includes(identifier)) return true;

    const reversedIdentifier = reverse(identifier);
    const edgeNumbersRemoved = withoutEdgeNumbers(candidate);
    if (
      edgeNumbersRemoved === identifier ||
      edgeNumbersRemoved === reversedIdentifier
    ) {
      return true;
    }

    const substitutedCandidate = this.identifiers.comparable(
      replaceObviousSubstitutions(
        password.normalize('NFC').toLocaleLowerCase('und'),
      ),
    );
    const substitutedWithoutEdgeNumbers = replaceObviousSubstitutions(
      withoutEdgeNumbers(candidate),
    );
    return (
      substitutedCandidate === identifier ||
      substitutedWithoutEdgeNumbers === identifier ||
      substitutedWithoutEdgeNumbers === reversedIdentifier ||
      (identifier.length >= 4 && substitutedCandidate.includes(identifier))
    );
  }
}

export const passwordLengthPolicy = {
  maximumCodePoints: MAXIMUM_PASSWORD_LENGTH,
  minimumCodePoints: MINIMUM_PASSWORD_LENGTH,
} as const;
