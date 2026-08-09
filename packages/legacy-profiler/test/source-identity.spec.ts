import { describe, expect, it } from 'vitest';

import {
  createSourceIdentity,
  sha256Bytes,
} from '../src/domain/source-identity.js';

describe('source identity', () => {
  it('is stable and excludes execution metadata', () => {
    const digest = sha256Bytes(new TextEncoder().encode('synthetic'));
    const first = createSourceIdentity('synthetic-source', digest);
    const second = createSourceIdentity('synthetic-source', digest);
    expect(first).toEqual(second);
    expect(first.sourceId).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects unsafe source codes and invalid hashes', () => {
    expect(() => createSourceIdentity('../source', 'a'.repeat(64))).toThrow();
    expect(() => createSourceIdentity('source', 'not-a-hash')).toThrow();
  });
});
