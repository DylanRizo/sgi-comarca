import { createHash, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

import type { RandomBytesProvider } from '../domain/authentication.ports.js';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class CryptoRandomBytesProvider implements RandomBytesProvider {
  bytes(length: number): Buffer {
    return randomBytes(length);
  }
}

export class SecretToken {
  private revealed = false;

  constructor(private readonly value: string) {}

  revealOnce(): string {
    if (this.revealed) {
      throw new Error('Secret token has already been revealed.');
    }
    this.revealed = true;
    return this.value;
  }

  toJSON(): string {
    return '[REDACTED]';
  }

  toString(): string {
    return '[REDACTED]';
  }

  [inspect.custom](): string {
    return 'SecretToken([REDACTED])';
  }
}

export type GeneratedToken = {
  secret: SecretToken;
  tokenHash: string;
};

export class AuthTokenService {
  constructor(
    private readonly randomBytesProvider: RandomBytesProvider = new CryptoRandomBytesProvider(),
  ) {}

  generate(): GeneratedToken {
    const token = this.randomBytesProvider
      .bytes(TOKEN_BYTES)
      .toString('base64url');
    const tokenHash = this.hashValidatedToken(token);
    if (!tokenHash) {
      throw new Error('Random token generation produced an invalid value.');
    }
    return {
      secret: new SecretToken(token),
      tokenHash,
    };
  }

  hashValidatedToken(token: string): string | null {
    if (!TOKEN_PATTERN.test(token)) return null;
    const decoded = Buffer.from(token, 'base64url');
    if (
      decoded.length !== TOKEN_BYTES ||
      decoded.toString('base64url') !== token
    ) {
      return null;
    }
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
