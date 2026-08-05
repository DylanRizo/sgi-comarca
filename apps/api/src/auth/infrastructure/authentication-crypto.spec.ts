import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AuthenticationInvariantError } from '../domain/authentication.errors.js';
import type { RandomBytesProvider } from '../domain/authentication.ports.js';
import {
  Argon2PasswordHasher,
  candidateArgon2idParameters,
  minimumArgon2idParameters,
} from './argon2-password-hasher.js';
import { AuthTokenService } from './auth-token.service.js';
import { OriginHasher } from './origin-hasher.js';

class ControlledRandomBytes implements RandomBytesProvider {
  bytes(length: number): Buffer {
    return Buffer.alloc(length, 0xa5);
  }
}

describe('authentication cryptography', () => {
  it('stores explicit Argon2id PHC parameters and detects rehash needs', async () => {
    const minimumHasher = new Argon2PasswordHasher(minimumArgon2idParameters);
    const candidateHasher = new Argon2PasswordHasher(
      candidateArgon2idParameters,
    );
    const hash = await minimumHasher.hash('controlled unit phrase');

    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u,
    );
    await expect(
      minimumHasher.verify(hash, 'controlled unit phrase'),
    ).resolves.toBe(true);
    await expect(
      minimumHasher.verify(hash, 'different controlled phrase'),
    ).resolves.toBe(false);
    expect(minimumHasher.needsRehash(hash)).toBe(false);
    expect(candidateHasher.needsRehash(hash)).toBe(true);
  });

  it('rejects Argon2id parameters below the approved floor', () => {
    expect(
      () =>
        new Argon2PasswordHasher({
          hashLength: 32,
          memoryCost: 19_455,
          parallelism: 1,
          timeCost: 2,
        }),
    ).toThrow(AuthenticationInvariantError);
  });

  it('creates a 32-byte opaque token, persists only its hash and reveals once', () => {
    const service = new AuthTokenService(new ControlledRandomBytes());
    const generated = service.generate();
    const serialized = JSON.stringify(generated);

    expect(serialized).toContain('[REDACTED]');
    const token = generated.secret.revealOnce();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generated.tokenHash).toBe(
      createHash('sha256').update(token, 'utf8').digest('hex'),
    );
    expect(() => generated.secret.revealOnce()).toThrow(
      'already been revealed',
    );
    expect(service.hashValidatedToken('not-a-valid-token')).toBeNull();
  });

  it('uses an HMAC for canonical origins and rejects weak secrets', () => {
    const origin = '198.51.100.42';
    const hasher = new OriginHasher(Buffer.alloc(32, 0x7c));
    const hash = hasher.hash(origin);

    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(hash).not.toContain(origin);
    expect(hasher.matches(origin, hash)).toBe(true);
    expect(hasher.matches('198.51.100.43', hash)).toBe(false);
    expect(() => new OriginHasher(Buffer.alloc(31))).toThrow(
      AuthenticationInvariantError,
    );
  });
});
