import type { MarketplaceBotSnapshot } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  canCancelCommand,
  destructiveCommandConfirmation,
  pendingCommandHint,
} from './marketplace-bot-commands';

const snapshot: MarketplaceBotSnapshot = {
  accounts: [],
  alerts: [
    {
      account: 'acc-1',
      code: 'CALENDAR_EMPTY',
      createdAt: '2026-11-13T10:00:00Z',
      id: 'alert-1',
      message: 'Sin publicaciones pendientes',
      severity: 'warning',
    },
  ],
  leads: {
    awaitingReply: 0,
    products: [],
    total14d: 0,
    unanswered: [],
    unansweredRecent: 0,
  },
  listings: {
    actionable: 1,
    items: [
      {
        account: 'acc-1',
        ageDays: 9,
        clicks14d: 4,
        executable: true,
        key: 'acc-1::1',
        leads14d: 1,
        listedOn: '2026-11-04',
        pendingAction: null,
        recommendation: 'renew',
        recommendationLabel: 'Renovar',
        recommendationReason: '',
        status: 'active',
        title: 'Camisa de prueba',
      },
    ],
    totalActive: 1,
  },
  queue: {
    summary: {},
    upcoming: [
      {
        account: 'acc-1',
        approved: false,
        detail: '',
        id: 'queue-1',
        name: 'Medias de prueba',
        scheduledAt: '2026-11-14T10:00:00',
        status: 'planned',
      },
    ],
  },
  worker: {
    currentItem: null,
    enabled: true,
    mode: 'semiautomatic',
    processRunning: true,
    safetyLevel: 'balanced',
    status: 'idle',
  },
};

describe('Marketplace bot command presentation', () => {
  it('asks before queuing a command the bot cannot undo, naming its target', () => {
    expect(
      destructiveCommandConfirmation(
        { action: 'delete', key: 'acc-1::1', type: 'LISTING_ACTION' },
        snapshot,
      ),
    ).toContain('"Camisa de prueba"');
    expect(
      destructiveCommandConfirmation(
        { action: 'delete', key: 'unknown', type: 'LISTING_ACTION' },
        snapshot,
      ),
    ).toContain('este anuncio');
    expect(
      destructiveCommandConfirmation(
        { action: 'cancel', id: 'queue-1', type: 'QUEUE_ITEM_ACTION' },
        snapshot,
      ),
    ).toContain('"Medias de prueba"');
    expect(
      destructiveCommandConfirmation(
        { replace: true, type: 'GENERATE_WEEK' },
        snapshot,
      ),
    ).toContain('Reemplazar');
    expect(
      destructiveCommandConfirmation({ type: 'RESOLVE_ALL_ALERTS' }, snapshot),
    ).toContain('1 alertas');
  });

  it('queues reversible commands without asking', () => {
    for (const command of [
      { action: 'renew', key: 'acc-1::1', type: 'LISTING_ACTION' },
      { action: 'approve', id: 'queue-1', type: 'QUEUE_ITEM_ACTION' },
      { replace: false, type: 'GENERATE_WEEK' },
      { enabled: false, type: 'SET_BOT_ENABLED' },
      { id: 'alert-1', type: 'RESOLVE_ALERT' },
    ] as const) {
      expect(destructiveCommandConfirmation(command, snapshot)).toBeNull();
    }
  });

  it('only offers to cancel a command the bot has not been given', () => {
    expect(canCancelCommand({ deliveredAt: null, status: 'PENDING' })).toBe(
      true,
    );
    expect(
      canCancelCommand({
        deliveredAt: '2026-11-14T10:00:00.000Z',
        status: 'PENDING',
      }),
    ).toBe(false);
    expect(canCancelCommand({ deliveredAt: null, status: 'CANCELLED' })).toBe(
      false,
    );
  });

  it('tells apart waiting for the bot from waiting for its result', () => {
    expect(pendingCommandHint({ deliveredAt: null, status: 'PENDING' })).toBe(
      'Se entregará en el próximo pulso del bot',
    );
    expect(
      pendingCommandHint({
        deliveredAt: '2026-11-14T10:00:00.000Z',
        status: 'PENDING',
      }),
    ).toBe('Entregado al bot; esperando su resultado');
    expect(
      pendingCommandHint({ deliveredAt: null, status: 'EXPIRED' }),
    ).toBeNull();
  });
});
