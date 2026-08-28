import { centsToMoney, moneyToCents } from './sale-money.js';
import { SaleError } from './sale.errors.js';

/**
 * Values read from the locked `InventoryBalance` row for a product+warehouse.
 * Prices/costs are canonical `Decimal(18,2)` strings or `null` (ADR-009).
 */
export interface LockedBalancePricing {
  currentUnitPrice: string | null;
  currentUnitCost: string | null;
  priceReviewRequired: boolean;
  costReviewRequired: boolean;
}

export interface ResolvedLinePricing {
  /** Persisted `unit_price_snapshot`, canonical `Decimal(18,2)`. */
  unitPriceSnapshot: string;
  /** Persisted `unit_cost_snapshot`, canonical `Decimal(18,2)`. */
  unitCostSnapshot: string;
  /** True when the client override differs from the reference price. */
  priceOverridden: boolean;
  /** Canonical reference price when known, else `null` (for override audit). */
  referenceUnitPrice: string | null;
  priceReviewRequired: boolean;
  costReviewRequired: boolean;
}

function normalizeCanonicalMoney(value: string): bigint {
  const cents = moneyToCents(value);
  if (cents === null) throw new SaleError('SALES_REQUEST_INVALID');
  return cents;
}

/**
 * Resolve the price and cost snapshots for one sale line from the locked
 * balance and an optional client override (ADR-009).
 *
 * - cost always comes from `currentUnitCost`; `null` → SALE_COST_MISSING, zero
 *   is valid and preserved; the client never sends cost;
 * - price uses the override when supplied, otherwise the reference; a `null`
 *   reference with no override → SALE_PRICE_MISSING;
 * - a negative/out-of-range reference or override is rejected before insert;
 * - review flags never block; they are surfaced for sanitized audit.
 *
 * `override` is the already-shape-validated client `unitPrice` string, or
 * `null` when omitted.
 */
export function resolveLinePricing(
  balance: LockedBalancePricing,
  override: string | null,
): ResolvedLinePricing {
  if (balance.currentUnitCost === null) {
    throw new SaleError('SALE_COST_MISSING');
  }
  const costCents = moneyToCents(balance.currentUnitCost);
  if (costCents === null) {
    // A stored value outside Decimal(18,2)/non-negative is corrupt reference
    // data, not a client error.
    throw new SaleError('SALE_REFERENCE_VALUE_INVALID');
  }

  let referenceCents: bigint | null = null;
  if (balance.currentUnitPrice !== null) {
    referenceCents = moneyToCents(balance.currentUnitPrice);
    if (referenceCents === null) {
      throw new SaleError('SALE_REFERENCE_VALUE_INVALID');
    }
  }

  let appliedCents: bigint;
  let priceOverridden = false;
  if (override !== null) {
    appliedCents = normalizeCanonicalMoney(override);
    priceOverridden =
      referenceCents === null || appliedCents !== referenceCents;
  } else if (referenceCents !== null) {
    appliedCents = referenceCents;
  } else {
    throw new SaleError('SALE_PRICE_MISSING');
  }

  return {
    unitPriceSnapshot: centsToMoney(appliedCents),
    unitCostSnapshot: centsToMoney(costCents),
    priceOverridden,
    referenceUnitPrice:
      referenceCents === null ? null : centsToMoney(referenceCents),
    priceReviewRequired: balance.priceReviewRequired,
    costReviewRequired: balance.costReviewRequired,
  };
}
