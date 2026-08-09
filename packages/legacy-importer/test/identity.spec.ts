import { describe, expect, it } from 'vitest';

import {
  advisoryLockKey,
  deterministicUuid,
  rowFingerprint,
} from '../src/domain/identity.js';
import { databasePlan } from './fixtures/synthetic-import.js';

describe('legacy importer identities', () => {
  it('creates deterministic UUIDs without operational metadata', () => {
    const identity = { sourceCode: 'synthetic', row: 2 };
    expect(deterministicUuid('row', identity)).toBe(
      deterministicUuid('row', identity),
    );
    expect(deterministicUuid('row', identity)).not.toBe(
      deterministicUuid('row', { ...identity, row: 3 }),
    );
  });

  it('fingerprints only canonical row evidence', () => {
    const { plan } = databasePlan(1);
    const row = plan.records[0]?.rawData;
    expect(row).toBeDefined();
    expect(rowFingerprint(row!)).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(row)).not.toMatch(/hostname|username|timestamp/iu);
  });

  it('derives a signed PostgreSQL advisory lock key', () => {
    const { plan } = databasePlan(1);
    const key = advisoryLockKey(plan.batchKey);
    expect(key).toBeGreaterThanOrEqual(-0x8000000000000000n);
    expect(key).toBeLessThanOrEqual(0x7fffffffffffffffn);
  });
});
