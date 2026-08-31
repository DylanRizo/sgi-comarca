import { describe, expect, it } from 'vitest';

import { calculateMargin, periodStart } from './analytics-margin.js';

describe('FASE 9B.3 margin and coverage', () => {
  it('computes gross profit and ratio over fully covered lines', () => {
    const result = calculateMargin([
      { costCents: 600n, revenueCents: 1000n },
      { costCents: 400n, revenueCents: 1000n },
    ]);
    expect(result.grossProfitCents).toBe(1000n);
    expect(result.costCents).toBe(1000n);
    expect(result.ratio).toBe('0.5000');
    expect(result.coverage).toEqual({
      coveredLines: 2,
      excludedLines: 0,
      ratio: '1.0000',
      totalLines: 2,
    });
  });

  it('excludes an untrustworthy cost from both sides rather than treating it as free stock', () => {
    // Counting the uncosted line as zero cost would report 1500 profit on 2000
    // revenue, a margin no line actually earned.
    const result = calculateMargin([
      { costCents: 500n, revenueCents: 1000n },
      { costCents: null, revenueCents: 1000n },
    ]);
    expect(result.grossProfitCents).toBe(500n);
    expect(result.coveredRevenueCents).toBe(1000n);
    expect(result.ratio).toBe('0.5000');
    expect(result.coverage.coveredLines).toBe(1);
    expect(result.coverage.excludedLines).toBe(1);
    expect(result.coverage.ratio).toBe('0.5000');
  });

  it('reports no margin, not a zero margin, when no cost is trustworthy', () => {
    const result = calculateMargin([
      { costCents: null, revenueCents: 1000n },
      { costCents: null, revenueCents: 500n },
    ]);
    expect(result.grossProfitCents).toBeNull();
    expect(result.ratio).toBeNull();
    expect(result.coverage.coveredLines).toBe(0);
    expect(result.coverage.ratio).toBe('0.0000');
  });

  it('distinguishes an empty period from zero coverage', () => {
    const result = calculateMargin([]);
    expect(result.coverage.totalLines).toBe(0);
    expect(result.coverage.ratio).toBeNull();
    expect(result.grossProfitCents).toBeNull();
  });

  it('keeps a genuine zero-cost line covered when it is not flagged', () => {
    // A zero cost that carries no review flag is a real cost, so it belongs in
    // the margin; only a flagged or absent cost is excluded upstream.
    const result = calculateMargin([{ costCents: 0n, revenueCents: 1000n }]);
    expect(result.grossProfitCents).toBe(1000n);
    expect(result.ratio).toBe('1.0000');
    expect(result.coverage.excludedLines).toBe(0);
  });

  it('reports a negative margin when cost exceeds revenue', () => {
    const result = calculateMargin([{ costCents: 1500n, revenueCents: 1000n }]);
    expect(result.grossProfitCents).toBe(-500n);
    expect(result.ratio).toBe('-0.5000');
  });

  it('rounds the ratio half up on integers', () => {
    // 1/3 = 0.33333... rounds to 0.3333.
    const result = calculateMargin([{ costCents: 2000n, revenueCents: 3000n }]);
    expect(result.ratio).toBe('0.3333');
  });
});

describe('FASE 9B.3 period bucketing', () => {
  it('buckets by day', () => {
    expect(periodStart(new Date('2026-09-03T18:30:00Z'), 'day')).toBe(
      '2026-09-03',
    );
  });

  it('buckets by month', () => {
    expect(periodStart(new Date('2026-09-17T00:00:00Z'), 'month')).toBe(
      '2026-09-01',
    );
  });

  it('starts a week on Monday', () => {
    // 2026-09-03 is a Thursday.
    expect(periodStart(new Date('2026-09-03T00:00:00Z'), 'week')).toBe(
      '2026-08-31',
    );
  });

  it('keeps Sunday in the week that already began', () => {
    // 2026-09-06 is a Sunday; it belongs to the Monday six days earlier.
    expect(periodStart(new Date('2026-09-06T00:00:00Z'), 'week')).toBe(
      '2026-08-31',
    );
  });

  it('starts a new week on the following Monday', () => {
    expect(periodStart(new Date('2026-09-07T00:00:00Z'), 'week')).toBe(
      '2026-09-07',
    );
  });
});
