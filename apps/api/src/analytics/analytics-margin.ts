import type { MarginCoverage } from '@sgi/contracts';

import { maximumMoneyCents } from '../common/money.js';

/**
 * One sale line as the margin calculation sees it. Cost is already resolved to
 * cents, or null when the line has no cost to trust.
 */
export interface MarginLine {
  /** Line revenue in cents. */
  revenueCents: bigint;
  /** Line cost in cents, or null when absent or untrustworthy. */
  costCents: bigint | null;
}

export interface MarginResult {
  coverage: MarginCoverage;
  /** Revenue of covered lines only, in cents. */
  coveredRevenueCents: bigint;
  costCents: bigint;
  grossProfitCents: bigint | null;
  /** `grossProfit / coveredRevenue` as a four-decimal string, or null. */
  ratio: string | null;
}

export function ratioString(
  numerator: bigint,
  denominator: bigint,
): string | null {
  if (denominator === 0n) return null;
  // Four decimals, computed on integers and rounded half-up away from zero so
  // a ratio never inherits binary floating-point drift.
  const scaled = (numerator * 20_000n) / denominator;
  const rounded = scaled < 0n ? (scaled - 1n) / 2n : (scaled + 1n) / 2n;
  const negative = rounded < 0n;
  const magnitude = negative ? -rounded : rounded;
  const padded = magnitude.toString().padStart(5, '0');
  const whole = padded.slice(0, -4);
  const fraction = padded.slice(-4);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Coverage of a count against a total, using the same exact ratio maths. */
export function coverageOf(covered: number, total: number): MarginCoverage {
  return {
    coveredLines: covered,
    excludedLines: total - covered,
    ratio: total === 0 ? null : ratioString(BigInt(covered), BigInt(total)),
    totalLines: total,
  };
}

/**
 * Gross profit over the lines whose cost is trustworthy, plus the coverage
 * that says how much of the period it explains.
 *
 * DEC-015 keeps margin valid only where cost is reliable, and the data holds
 * zero costs flagged for review. A line without a trustworthy cost is
 * therefore excluded from both sides of the subtraction rather than counted as
 * free stock, which would silently inflate profit. Excluding it from revenue
 * too is what keeps the ratio honest: dividing full revenue by partial cost
 * would report a margin that no line actually earned.
 *
 * When no line is covered, `grossProfitCents` and `ratio` are null. A period
 * whose costs are entirely unknown has no margin, which is different from a
 * margin of zero.
 */
export function calculateMargin(lines: readonly MarginLine[]): MarginResult {
  let coveredRevenue = 0n;
  let cost = 0n;
  let coveredLines = 0;

  for (const line of lines) {
    if (line.costCents === null) continue;
    coveredRevenue += line.revenueCents;
    cost += line.costCents;
    coveredLines += 1;
  }

  const totalLines = lines.length;
  const coverage: MarginCoverage = {
    coveredLines,
    excludedLines: totalLines - coveredLines,
    ratio:
      totalLines === 0
        ? null
        : ratioString(BigInt(coveredLines), BigInt(totalLines)),
    totalLines,
  };

  if (coveredLines === 0) {
    return {
      costCents: 0n,
      coverage,
      coveredRevenueCents: 0n,
      grossProfitCents: null,
      ratio: null,
    };
  }

  const grossProfit = coveredRevenue - cost;
  const bounded =
    grossProfit > maximumMoneyCents || grossProfit < -maximumMoneyCents;

  return {
    costCents: cost,
    coverage,
    coveredRevenueCents: coveredRevenue,
    grossProfitCents: bounded ? null : grossProfit,
    ratio: bounded ? null : ratioString(grossProfit, coveredRevenue),
  };
}

/**
 * Civil-period bucket for a date, used to group sales by day, week, or month.
 * Weeks start on Monday, matching how the business reads a week.
 */
export function periodStart(
  date: Date,
  granularity: 'day' | 'month' | 'week',
): string {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  if (granularity === 'month') {
    value.setUTCDate(1);
  } else if (granularity === 'week') {
    // getUTCDay is 0 on Sunday, which belongs to the week that began six days
    // earlier rather than starting a new one.
    const weekday = (value.getUTCDay() + 6) % 7;
    value.setUTCDate(value.getUTCDate() - weekday);
  }
  return value.toISOString().slice(0, 10);
}
