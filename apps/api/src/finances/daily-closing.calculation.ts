import { centsToMoney, moneyToCents } from '../common/money.js';
import { FinanceError } from './finance.errors.js';

export interface ClosingAmounts {
  realCash: string;
  realDigital: string;
  systemSales: string;
  tolerance: string;
}

export interface ClosingCalculation {
  realCash: string;
  realDigital: string;
  systemSales: string;
  /** Signed canonical `Decimal(18,2)`; negative means counted money fell short. */
  difference: string;
  toleranceApplied: string;
  balanced: boolean;
}

function nonNegativeCents(value: string): bigint {
  const cents = moneyToCents(value);
  if (cents === null) throw new FinanceError('CLOSING_REQUEST_INVALID');
  return cents;
}

/**
 * Compute a daily closing exactly as the database CHECK constraints require
 * (ADR-010).
 *
 * `difference = real cash + real digital − system sales`. Expenses take no
 * part (DEC-023): they are shown separately and never move the balance.
 *
 * A closing is balanced when `abs(difference) < tolerance` (DEC-024). The
 * comparison is strict, so a difference exactly equal to the tolerance is not
 * balanced, and the tolerance actually applied is returned so it can be stored
 * on the closing and keep the result interpretable later.
 *
 * Every amount is handled as scaled integers, never `number`, so no cent is
 * lost to floating point.
 */
export function calculateClosing(input: ClosingAmounts): ClosingCalculation {
  const realCash = nonNegativeCents(input.realCash);
  const realDigital = nonNegativeCents(input.realDigital);
  const systemSales = nonNegativeCents(input.systemSales);
  const tolerance = nonNegativeCents(input.tolerance);

  const difference = realCash + realDigital - systemSales;
  const magnitude = difference < 0n ? -difference : difference;

  return {
    balanced: magnitude < tolerance,
    difference: centsToMoney(difference),
    realCash: centsToMoney(realCash),
    realDigital: centsToMoney(realDigital),
    systemSales: centsToMoney(systemSales),
    toleranceApplied: centsToMoney(tolerance),
  };
}

/** The approved legacy default, used when no tolerance is configured. */
export const defaultClosingTolerance = '0.50';
