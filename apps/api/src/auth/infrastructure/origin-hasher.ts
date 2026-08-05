import { createHmac, timingSafeEqual } from 'node:crypto';

import { AuthenticationInvariantError } from '../domain/authentication.errors.js';

const MINIMUM_SECRET_BYTES = 32;

export class OriginHasher {
  private readonly secret: Buffer;

  constructor(secret: Buffer) {
    if (secret.length < MINIMUM_SECRET_BYTES) {
      throw new AuthenticationInvariantError(
        'Origin HMAC secret must contain at least 32 bytes.',
      );
    }
    this.secret = Buffer.from(secret);
  }

  hash(canonicalOrigin: string): string {
    if (!canonicalOrigin) {
      throw new AuthenticationInvariantError(
        'A canonical login origin is required.',
      );
    }
    return createHmac('sha256', this.secret)
      .update(canonicalOrigin, 'utf8')
      .digest('hex');
  }

  matches(canonicalOrigin: string, originHash: string): boolean {
    if (!/^[a-f0-9]{64}$/u.test(originHash)) return false;
    return timingSafeEqual(
      Buffer.from(this.hash(canonicalOrigin), 'hex'),
      Buffer.from(originHash, 'hex'),
    );
  }
}
