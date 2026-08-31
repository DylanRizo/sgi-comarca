import { describe, expect, it } from 'vitest';

import { canonicalCreateSessionRequest } from './inventory-count-session.service.js';

describe('canonicalCreateSessionRequest', () => {
  const base = {
    businessDate: '2026-09-01',
    reason: 'conteo mensual',
    warehouseIds: ['b', 'a'],
  };

  it('is stable regardless of the warehouse order supplied', () => {
    expect(canonicalCreateSessionRequest(base)).toBe(
      canonicalCreateSessionRequest({ ...base, warehouseIds: ['a', 'b'] }),
    );
  });

  it('does not mutate the caller list while sorting it', () => {
    const warehouseIds = ['b', 'a'];
    canonicalCreateSessionRequest({ ...base, warehouseIds });
    expect(warehouseIds).toEqual(['b', 'a']);
  });

  it('separates requests that differ in any meaningful field', () => {
    const canonical = canonicalCreateSessionRequest(base);
    expect(canonicalCreateSessionRequest({ ...base, reason: 'otro' })).not.toBe(
      canonical,
    );
    expect(
      canonicalCreateSessionRequest({ ...base, businessDate: '2026-09-02' }),
    ).not.toBe(canonical);
    expect(
      canonicalCreateSessionRequest({ ...base, warehouseIds: ['a'] }),
    ).not.toBe(canonical);
  });
});
