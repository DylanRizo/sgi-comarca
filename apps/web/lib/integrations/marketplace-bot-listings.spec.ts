import type { MarketplaceBotListing } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  getAvailableListingActions,
  getListingActionsEmptyLabel,
} from './marketplace-bot-listings.js';

function makeListing(
  overrides: Partial<MarketplaceBotListing> = {},
): MarketplaceBotListing {
  return {
    account: 'Dylan',
    ageDays: 10,
    clicks14d: 25,
    executable: false,
    isExactTwin: false,
    key: 'listing-1',
    leads14d: 2,
    listedOn: '2026-11-07',
    pendingAction: null,
    recommendation: 'keep',
    recommendationLabel: 'Va bien',
    recommendationReason: 'Buen ritmo',
    status: 'in_stock',
    title: 'Top deportivo - Negro y Blanco',
    ...overrides,
  };
}

describe('marketplace bot available listing actions', () => {
  it('omits relist and renew (<7 days) on recently published active listings', () => {
    const actions = getAvailableListingActions(
      makeListing({
        ageDays: 0,
        recommendation: 'wait',
        recommendationLabel: 'Esperar',
        status: 'in_stock',
      }),
    );

    expect(actions).toEqual(['mark_out_of_stock', 'delete']);
  });

  it('allows renew once an active listing reaches 7 days without offering relist', () => {
    expect(
      getAvailableListingActions(
        makeListing({ ageDays: 6, recommendation: 'keep' }),
      ),
    ).toEqual(['mark_out_of_stock', 'delete']);

    expect(
      getAvailableListingActions(
        makeListing({ ageDays: 7, recommendation: 'keep' }),
      ),
    ).toEqual(['renew', 'mark_out_of_stock', 'delete']);
  });

  it('puts the recommended executable action first on active and out-of-stock listings', () => {
    expect(
      getAvailableListingActions(
        makeListing({
          ageDays: 12,
          executable: true,
          recommendation: 'delete',
          status: 'active',
        }),
      ),
    ).toEqual(['delete', 'renew', 'mark_out_of_stock']);

    expect(
      getAvailableListingActions(
        makeListing({
          ageDays: 15,
          executable: true,
          recommendation: 'relist',
          status: 'out_of_stock',
        }),
      ),
    ).toEqual(['relist', 'mark_available', 'delete']);

    expect(
      getAvailableListingActions(
        makeListing({
          ageDays: 15,
          executable: false,
          recommendation: 'none',
          status: 'out_of_stock',
        }),
      ),
    ).toEqual(['mark_available', 'relist', 'delete']);
  });

  it('returns no actions when a listing has a pending action, is under review, is an exact twin, or is sold/pending/unknown', () => {
    const queued = makeListing({ pendingAction: 'renew' });
    expect(getAvailableListingActions(queued)).toEqual([]);
    expect(getListingActionsEmptyLabel(queued)).toBe('En cola');

    const underReview = makeListing({
      ageDays: 0,
      title: 'This listing is being reviewed.',
    });
    expect(getAvailableListingActions(underReview)).toEqual([]);
    expect(getListingActionsEmptyLabel(underReview)).toBe('En revisión');

    const twin = makeListing({
      isExactTwin: true,
      recommendationReason: '',
    });
    expect(getAvailableListingActions(twin)).toEqual([]);
    expect(getListingActionsEmptyLabel(twin)).toBe('Solo en Facebook');

    const legacyTwin = makeListing({
      isExactTwin: null,
      recommendation: 'review',
      recommendationReason:
        'Duplicado exacto: hay otro anuncio con el mismo titulo y la misma fecha.',
    });
    expect(getAvailableListingActions(legacyTwin)).toEqual([]);
    expect(getListingActionsEmptyLabel(legacyTwin)).toBe('Solo en Facebook');

    const unverified = makeListing({ isExactTwin: null });
    expect(getAvailableListingActions(unverified)).toEqual([]);
    expect(getListingActionsEmptyLabel(unverified)).toBe(
      'Pendiente de verificar',
    );

    for (const status of ['sold', 'pending', 'unknown']) {
      const terminal = makeListing({ status });
      expect(getAvailableListingActions(terminal)).toEqual([]);
      expect(getListingActionsEmptyLabel(terminal)).toBe('—');
    }
  });
});
