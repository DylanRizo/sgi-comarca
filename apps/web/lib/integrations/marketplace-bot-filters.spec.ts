import type {
  MarketplaceBotCommandView,
  MarketplaceBotListing,
  MarketplaceBotQueueItem,
} from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  collectAccountOptions,
  collectInFlightBotTargets,
  filterListings,
  filterQueueItems,
} from './marketplace-bot-filters.js';

function makeQueueItem(
  overrides: Partial<MarketplaceBotQueueItem> = {},
): MarketplaceBotQueueItem {
  return {
    account: 'Dylan Steven',
    approved: false,
    detail: '',
    id: 'q-1',
    name: 'Calcetas deportivas',
    scheduledAt: '2026-11-20T15:30:00',
    status: 'planned',
    ...overrides,
  };
}

function makeListing(
  overrides: Partial<MarketplaceBotListing> = {},
): MarketplaceBotListing {
  return {
    account: 'Dylan Steven',
    ageDays: 10,
    clicks14d: 30,
    executable: false,
    isExactTwin: false,
    key: 'l-1',
    leads14d: 3,
    listedOn: '2026-11-08',
    pendingAction: null,
    pendingActionId: null,
    recommendation: 'keep',
    recommendationLabel: 'Va bien',
    recommendationReason: '',
    status: 'in_stock',
    title: 'Camisa de compresión manga corta',
    ...overrides,
  };
}

describe('marketplace bot filters and in-flight command targets', () => {
  it('collects sorted unique accounts across groups', () => {
    expect(
      collectAccountOptions(
        [makeQueueItem({ account: 'Sebastián' }), makeQueueItem()],
        [
          makeListing({ account: 'Dylan Steven' }),
          makeListing({ account: '' }),
        ],
      ),
    ).toEqual(['Dylan Steven', 'Sebastián']);
  });

  it('filters queue items by account and status', () => {
    const items = [
      makeQueueItem({ account: 'Dylan Steven', id: 'q-1', status: 'planned' }),
      makeQueueItem({ account: 'Dylan Steven', id: 'q-2', status: 'queued' }),
      makeQueueItem({ account: 'Sebastián', id: 'q-3', status: 'planned' }),
    ];

    expect(
      filterQueueItems(items, { account: '', status: 'all' }).map((i) => i.id),
    ).toEqual(['q-1', 'q-2', 'q-3']);
    expect(
      filterQueueItems(items, {
        account: 'Dylan Steven',
        status: 'planned',
      }).map((i) => i.id),
    ).toEqual(['q-1']);
  });

  it('filters listings by account, view and accent-insensitive query', () => {
    const items = [
      makeListing({
        account: 'Dylan Steven',
        executable: true,
        key: 'l-1',
        recommendation: 'renew',
        recommendationLabel: 'Renovar',
        status: 'in_stock',
        title: 'Camisa de compresión negra',
      }),
      makeListing({
        account: 'Sebastián',
        executable: false,
        key: 'l-2',
        pendingAction: 'relist',
        pendingActionId: 7,
        status: 'out_of_stock',
        title: 'Medias deportivas',
      }),
      makeListing({
        account: 'Dylan Steven',
        executable: false,
        key: 'l-3',
        status: 'in_stock',
        title: 'Durag negro',
      }),
    ];

    expect(
      filterListings(items, {
        account: '',
        query: 'compresion',
        view: 'all',
      }).map((i) => i.key),
    ).toEqual(['l-1']);

    expect(
      filterListings(items, {
        account: '',
        query: '',
        view: 'actionable',
      }).map((i) => i.key),
    ).toEqual(['l-1', 'l-2']);

    expect(
      filterListings(items, {
        account: '',
        query: '',
        view: 'out_of_stock',
      }).map((i) => i.key),
    ).toEqual(['l-2']);

    expect(
      filterListings(items, {
        account: 'Dylan Steven',
        query: '',
        view: 'in_stock',
      }).map((i) => i.key),
    ).toEqual(['l-1', 'l-3']);
  });

  it('tracks only PENDING and DISPATCHED commands as in-flight targets', () => {
    const base = {
      completedAt: null,
      createdAt: '2026-11-19T09:00:00Z',
      createdByName: 'Dylan',
      dispatchedAt: null,
      resultDetail: null,
    };
    const commands: MarketplaceBotCommandView[] = [
      {
        ...base,
        id: 'c-1',
        payload: {
          activeDays: [0, 1],
          endTime: '18:00',
          intervalMinutes: 180,
          maxPerDay: 3,
          regenerate: false,
          startTime: '09:00',
          type: 'SET_SCHEDULE',
        },
        status: 'PENDING',
        type: 'SET_SCHEDULE',
      },
      {
        ...base,
        id: 'c-2',
        payload: {
          action: 'move',
          id: 'q-1',
          scheduledAt: '2026-11-20T15:30',
          type: 'QUEUE_ITEM_ACTION',
        },
        status: 'DISPATCHED',
        type: 'QUEUE_ITEM_ACTION',
      },
      {
        ...base,
        id: 'c-3',
        payload: { action: 'renew', key: 'l-1', type: 'LISTING_ACTION' },
        status: 'PENDING',
        type: 'LISTING_ACTION',
      },
      {
        ...base,
        id: 'c-4',
        payload: { id: 42, type: 'CANCEL_LISTING_ACTION' },
        status: 'DISPATCHED',
        type: 'CANCEL_LISTING_ACTION',
      },
      {
        ...base,
        completedAt: '2026-11-19T09:01:00Z',
        id: 'c-5',
        payload: { action: 'delete', key: 'l-done', type: 'LISTING_ACTION' },
        status: 'COMPLETED',
        type: 'LISTING_ACTION',
      },
    ];

    const targets = collectInFlightBotTargets(commands);
    expect(targets.hasPendingSchedule).toBe(true);
    expect([...targets.queueItemIds]).toEqual(['q-1']);
    expect([...targets.listingKeys]).toEqual(['l-1']);
    expect([...targets.cancelListingActionIds]).toEqual([42]);
  });
});
