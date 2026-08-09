import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  canonicalFingerprint,
} from '../src/domain/canonical-json.js';

describe('canonicalJson', () => {
  it('sorts object keys and uses a stable final newline', () => {
    expect(canonicalJson({ zebra: 1, alpha: { two: 2, one: 1 } })).toBe(
      '{\n  "alpha": {\n    "one": 1,\n    "two": 2\n  },\n  "zebra": 1\n}\n',
    );
  });

  it('rejects undefined and non-finite numbers', () => {
    expect(() => canonicalJson({ unsafe: undefined })).toThrow(/Undefined/u);
    expect(() => canonicalJson({ unsafe: Number.NaN })).toThrow(/Non-finite/u);
  });

  it('produces identical fingerprints for equivalent object ordering', () => {
    expect(canonicalFingerprint({ b: 2, a: 1 })).toBe(
      canonicalFingerprint({ a: 1, b: 2 }),
    );
  });
});
