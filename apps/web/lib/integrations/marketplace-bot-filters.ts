import type {
  MarketplaceBotCommandView,
  MarketplaceBotListing,
  MarketplaceBotQueueItem,
} from '@sgi/contracts';

export type QueueFilterState = {
  account: string;
  status: string;
};

export type ListingViewFilter =
  'all' | 'actionable' | 'in_stock' | 'out_of_stock';

export type ListingsFilterState = {
  account: string;
  query: string;
  view: ListingViewFilter;
};

export type InFlightBotTargets = {
  hasPendingSchedule: boolean;
  queueItemIds: ReadonlySet<string>;
  listingKeys: ReadonlySet<string>;
  cancelListingActionIds: ReadonlySet<number>;
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/** Collects deduplicated, alphabetically sorted account names present in items. */
export function collectAccountOptions(
  ...groups: readonly (readonly { readonly account: string }[])[]
): string[] {
  const names = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const account = item.account.trim();
      if (account) names.add(account);
    }
  }
  return [...names].sort((left, right) =>
    left.localeCompare(right, 'es-NI', { sensitivity: 'base' }),
  );
}

export function filterQueueItems(
  items: readonly MarketplaceBotQueueItem[],
  filter: QueueFilterState,
): MarketplaceBotQueueItem[] {
  return items.filter((item) => {
    if (filter.account && item.account !== filter.account) return false;
    if (filter.status && filter.status !== 'all') {
      if (item.status !== filter.status) return false;
    }
    return true;
  });
}

export function filterListings(
  items: readonly MarketplaceBotListing[],
  filter: ListingsFilterState,
): MarketplaceBotListing[] {
  const needle = normalizeSearch(filter.query);
  return items.filter((item) => {
    if (filter.account && item.account !== filter.account) return false;
    const status = item.status.trim().toLowerCase();
    if (filter.view === 'actionable') {
      if (!item.executable && !item.pendingAction) return false;
    } else if (filter.view === 'in_stock') {
      if (status !== 'in_stock' && status !== 'active') return false;
    } else if (filter.view === 'out_of_stock') {
      if (status !== 'out_of_stock') return false;
    }
    if (needle) {
      const haystack = normalizeSearch(
        `${item.title} ${item.account} ${item.recommendationLabel}`,
      );
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Finds active (`PENDING` or `DISPATCHED`) remote commands so the panel can
 * show inline queued feedback between bot heartbeats and prevent duplicate
 * submissions on the same row.
 */
export function collectInFlightBotTargets(
  commands: readonly MarketplaceBotCommandView[],
): InFlightBotTargets {
  let hasPendingSchedule = false;
  const queueItemIds = new Set<string>();
  const listingKeys = new Set<string>();
  const cancelListingActionIds = new Set<number>();

  for (const cmd of commands) {
    if (cmd.status !== 'PENDING' && cmd.status !== 'DISPATCHED') continue;
    const { payload } = cmd;
    if (payload.type === 'SET_SCHEDULE') {
      hasPendingSchedule = true;
    } else if (payload.type === 'QUEUE_ITEM_ACTION') {
      queueItemIds.add(payload.id);
    } else if (payload.type === 'APPROVE_QUEUE_ITEMS') {
      for (const id of payload.ids) queueItemIds.add(id);
    } else if (payload.type === 'LISTING_ACTION') {
      listingKeys.add(payload.key);
    } else if (payload.type === 'CANCEL_LISTING_ACTION') {
      cancelListingActionIds.add(payload.id);
    }
  }

  return {
    cancelListingActionIds,
    hasPendingSchedule,
    listingKeys,
    queueItemIds,
  };
}
