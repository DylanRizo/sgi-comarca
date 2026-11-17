import type {
  MarketplaceBotListing,
  MarketplaceBotListingAction,
} from '@sgi/contracts';

const RENEW_MIN_AGE_DAYS = 7;

const underReviewPattern =
  /^(this listing is being reviewed\.?|esta publicaci[oó]n se est[aá] revisando\.?)$/iu;

const exactTwinPattern = /^duplicado exacto\s*:/iu;

function isListingUnderReview(listing: MarketplaceBotListing): boolean {
  return underReviewPattern.test(listing.title.trim());
}

function isExactTwinListing(listing: MarketplaceBotListing): boolean {
  return exactTwinPattern.test(listing.recommendationReason.trim());
}

function isExecutableAction(
  value: string,
): value is MarketplaceBotListingAction {
  return (
    value === 'renew' ||
    value === 'delete' ||
    value === 'relist' ||
    value === 'mark_out_of_stock' ||
    value === 'mark_available'
  );
}

/**
 * Computes the remote actions that can actually be executed on Facebook
 * Marketplace for a listing row. Excludes actions forbidden by listing state
 * (such as `relist` while active or `renew` before day 7) and suppresses all
 * buttons when a queued action, Facebook review, exact twin, or terminal
 * state blocks bot execution.
 */
export function getAvailableListingActions(
  listing: MarketplaceBotListing,
): readonly MarketplaceBotListingAction[] {
  if (
    listing.pendingAction ||
    isListingUnderReview(listing) ||
    isExactTwinListing(listing)
  ) {
    return [];
  }

  const status = listing.status.trim().toLowerCase();
  const recommended = listing.recommendation.trim().toLowerCase();
  let actions: MarketplaceBotListingAction[] = [];

  if (status === 'in_stock' || status === 'active') {
    const canRenew =
      (listing.ageDays !== null && listing.ageDays >= RENEW_MIN_AGE_DAYS) ||
      (listing.executable && recommended === 'renew');
    actions = canRenew
      ? ['renew', 'mark_out_of_stock', 'delete']
      : ['mark_out_of_stock', 'delete'];
  } else if (status === 'out_of_stock') {
    actions = ['mark_available', 'relist', 'delete'];
  } else {
    return [];
  }

  if (
    listing.executable &&
    isExecutableAction(recommended) &&
    actions.includes(recommended)
  ) {
    return [recommended, ...actions.filter((action) => action !== recommended)];
  }

  return actions;
}

/**
 * Descriptive fallback shown in the Actions column when no remote button
 * applies to the listing row.
 */
export function getListingActionsEmptyLabel(
  listing: MarketplaceBotListing,
): string {
  if (listing.pendingAction) return 'En cola';
  if (isListingUnderReview(listing)) return 'En revisión';
  if (isExactTwinListing(listing)) return 'Solo en Facebook';
  return '—';
}
