import { HttpStatus, ValidationPipe, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EXTERNAL_BEARER_ROUTE_METADATA } from '../auth/decorators/external-bearer-route.decorator.js';
import { REQUIRED_PERMISSION_METADATA } from '../auth/decorators/require-permission.decorator.js';
import { SERVER_TO_SERVER_ROUTE_METADATA } from '../auth/decorators/server-to-server-route.decorator.js';
import { GlobalExceptionFilter } from '../common/global-exception.filter.js';
import { MarketplaceBotSyncDto } from './dto/marketplace-bot.dto.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import { MarketplaceBotController } from './marketplace-bot.controller.js';
import {
  parseMarketplaceBotCommandPayload,
  sanitizeMarketplaceBotSnapshot,
} from './marketplace-bot-snapshot.js';
import { MarketplaceBotSyncController } from './marketplace-bot-sync.controller.js';

describe('MarketplaceBot snapshot sanitization and command validation', () => {
  it('bounds and cleans untrusted snapshot fields from the bot', () => {
    const snapshot = sanitizeMarketplaceBotSnapshot({
      accounts: [
        {
          dailyLimit: 3,
          displayName: '  Dylan Steven  ',
          key: 'cuenta1',
          lastScanAt: '2026-11-13T12:00:00Z',
          pausedUntil: '',
          pauseReason: null,
          publishedToday: 2,
          publishedWeek: 8,
          status: 'healthy',
          weeklyLimit: 12,
        },
        { key: '' },
      ],
      alerts: [
        {
          account: 'cuenta1',
          code: 'CALENDAR_EMPTY',
          createdAt: '2026-11-13T10:00:00Z',
          id: 'alert-1',
          message: 'Sin publicaciones pendientes',
          severity: 'warning',
        },
      ],
      leads: {
        awaitingReply: 4,
        products: [
          {
            activeListings: 2,
            clicks14d: 120,
            familyKey: 'compression_short',
            focus: true,
            label: 'Camisa de compresión manga corta',
            leads14d: 9,
            leadsPer100Clicks: 7.54,
          },
        ],
        total14d: 18,
        unanswered: [
          {
            account: 'cuenta1',
            label: 'Medias de compresión',
            lastActivity: '2026-11-13',
            neverAnswered: true,
            startedOn: '2026-11-12',
            title: 'Medias de compresión deportivas',
          },
        ],
        unansweredRecent: 2,
      },
      listings: {
        actionable: 1,
        items: [
          {
            account: 'cuenta1',
            ageDays: 9,
            clicks14d: 42,
            executable: true,
            key: 'listing-abc',
            leads14d: 5,
            listedOn: '2026-11-04',
            pendingAction: null,
            recommendation: 'renew',
            recommendationLabel: 'Renovar',
            recommendationReason: 'Ya cumple 7 días y convierte bien.',
            status: 'in_stock',
            title: 'Camisa de compresión manga corta',
          },
        ],
        totalActive: 12,
      },
      queue: {
        summary: { blocked: 1, planned: 3, published: 5, queued: 2 },
        upcoming: [
          {
            account: 'cuenta1',
            approved: false,
            detail: 'Propuesta automática',
            id: 'queue-1',
            name: 'Medias de compresión',
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
    });

    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.accounts[0]?.displayName).toBe('Dylan Steven');
    expect(snapshot.leads.products[0]?.leadsPer100Clicks).toBe(7.5);
    expect(snapshot.leads.unansweredRecent).toBe(2);
    expect(snapshot.listings.items[0]?.recommendation).toBe('renew');
    expect(snapshot.queue.summary.planned).toBe(3);
    expect(snapshot.alerts[0]?.code).toBe('CALENDAR_EMPTY');
  });

  it('validates every supported remote command payload and rejects invalid ones', () => {
    expect(
      parseMarketplaceBotCommandPayload({
        enabled: true,
        type: 'SET_BOT_ENABLED',
      }),
    ).toEqual({ enabled: true, type: 'SET_BOT_ENABLED' });

    expect(
      parseMarketplaceBotCommandPayload({
        action: 'renew',
        key: 'listing_123',
        type: 'LISTING_ACTION',
      }),
    ).toEqual({
      action: 'renew',
      key: 'listing_123',
      type: 'LISTING_ACTION',
    });

    expect(
      parseMarketplaceBotCommandPayload({
        account: 'cuenta1',
        hours: 24,
        type: 'PAUSE_ACCOUNT',
      }),
    ).toEqual({
      account: 'cuenta1',
      hours: 24,
      type: 'PAUSE_ACCOUNT',
    });

    expect(() =>
      parseMarketplaceBotCommandPayload({
        account: 'cuenta1',
        hours: 0,
        type: 'PAUSE_ACCOUNT',
      }),
    ).toThrow(IntegrationKeyError);

    expect(() =>
      parseMarketplaceBotCommandPayload({
        action: 'drop_database',
        key: 'listing_123',
        type: 'LISTING_ACTION',
      }),
    ).toThrow(IntegrationKeyError);
  });

  it('accepts configured account names with spaces and accents', () => {
    expect(
      parseMarketplaceBotCommandPayload({
        account: 'Dylan Steven',
        hours: 2,
        type: 'PAUSE_ACCOUNT',
      }),
    ).toEqual({ account: 'Dylan Steven', hours: 2, type: 'PAUSE_ACCOUNT' });
    expect(
      parseMarketplaceBotCommandPayload({
        account: 'Sebastián',
        type: 'REQUEST_SCAN',
      }),
    ).toEqual({ account: 'Sebastián', type: 'REQUEST_SCAN' });
    for (const account of [' ', 'a\nb', '<script>', 'x'.repeat(65)]) {
      expect(() =>
        parseMarketplaceBotCommandPayload({ account, type: 'RESUME_ACCOUNT' }),
      ).toThrow(IntegrationKeyError);
    }
  });

  it('validates the remote schedule and the move and publish-now actions', () => {
    const schedule = {
      activeDays: [4, 0, 2, 2],
      endTime: '16:30',
      intervalMinutes: 120,
      maxPerDay: 2,
      regenerate: true,
      startTime: '10:00',
      type: 'SET_SCHEDULE',
    };
    expect(parseMarketplaceBotCommandPayload(schedule)).toEqual({
      ...schedule,
      activeDays: [0, 2, 4],
    });
    for (const invalid of [
      { endTime: '09:00', startTime: '18:00' },
      { activeDays: [] },
      { activeDays: [7] },
      { maxPerDay: 0 },
      { maxPerDay: 2.5 },
      { intervalMinutes: 10 },
      { startTime: '9:00' },
      { regenerate: 'yes' },
    ]) {
      expect(() =>
        parseMarketplaceBotCommandPayload({ ...schedule, ...invalid }),
      ).toThrow(IntegrationKeyError);
    }

    expect(
      parseMarketplaceBotCommandPayload({
        action: 'move',
        id: 'queue-1',
        scheduledAt: '2026-11-20T15:30',
        type: 'QUEUE_ITEM_ACTION',
      }),
    ).toEqual({
      action: 'move',
      id: 'queue-1',
      scheduledAt: '2026-11-20T15:30',
      type: 'QUEUE_ITEM_ACTION',
    });
    expect(
      parseMarketplaceBotCommandPayload({
        action: 'move',
        id: 'queue-1',
        scheduledAt: '2028-02-29T15:30',
        type: 'QUEUE_ITEM_ACTION',
      }),
    ).toEqual({
      action: 'move',
      id: 'queue-1',
      scheduledAt: '2028-02-29T15:30',
      type: 'QUEUE_ITEM_ACTION',
    });
    for (const scheduledAt of [
      undefined,
      '2026-11-20',
      '2026-13-01T10:00',
      '2026-02-29T10:00',
      '2026-02-31T10:00',
      '2026-04-31T10:00',
      '2026-11-20T15:30Z',
    ]) {
      expect(() =>
        parseMarketplaceBotCommandPayload({
          action: 'move',
          id: 'queue-1',
          scheduledAt,
          type: 'QUEUE_ITEM_ACTION',
        }),
      ).toThrow(IntegrationKeyError);
    }
    expect(
      parseMarketplaceBotCommandPayload({
        action: 'publish_now',
        id: 'queue-1',
        scheduledAt: 'ignored',
        type: 'QUEUE_ITEM_ACTION',
      }),
    ).toEqual({
      action: 'publish_now',
      id: 'queue-1',
      type: 'QUEUE_ITEM_ACTION',
    });
  });

  it('keeps a valid schedule from the bot and drops a malformed one', () => {
    const valid = sanitizeMarketplaceBotSnapshot({
      schedule: {
        activeDays: [0, 1, 2],
        botTime: '2026-11-18T09:15',
        endTime: '18:00',
        intervalMinutes: 180,
        maxPerDay: 3,
        startTime: '09:00',
      },
    });
    expect(valid.schedule).toEqual({
      activeDays: [0, 1, 2],
      botTime: '2026-11-18T09:15',
      endTime: '18:00',
      intervalMinutes: 180,
      maxPerDay: 3,
      startTime: '09:00',
    });
    expect(sanitizeMarketplaceBotSnapshot({}).schedule).toBeNull();
    expect(
      sanitizeMarketplaceBotSnapshot({
        schedule: { activeDays: [0], endTime: '25:00', startTime: '09:00' },
      }).schedule,
    ).toBeNull();
    expect(
      sanitizeMarketplaceBotSnapshot({
        schedule: {
          activeDays: [0],
          botTime: '2026-02-31T09:15',
          endTime: '18:00',
          intervalMinutes: 180,
          maxPerDay: 3,
          startTime: '09:00',
        },
      }).schedule?.botTime,
    ).toBeNull();

    const listingsSnap = sanitizeMarketplaceBotSnapshot({
      listings: {
        items: [
          {
            key: 'with-id',
            pendingAction: 'renew',
            pendingActionId: 42,
            status: 'in_stock',
            title: 'Anuncio con accion',
          },
          {
            key: 'no-action',
            pendingAction: null,
            pendingActionId: 99,
            status: 'in_stock',
            title: 'Sin accion pendiente',
          },
          {
            key: 'invalid-id',
            pendingAction: 'delete',
            pendingActionId: -5,
            status: 'in_stock',
            title: 'Id invalido',
          },
        ],
      },
    });
    expect(listingsSnap.listings.items).toMatchObject([
      { key: 'with-id', pendingAction: 'renew', pendingActionId: 42 },
      { key: 'no-action', pendingAction: null, pendingActionId: null },
      { key: 'invalid-id', pendingAction: 'delete', pendingActionId: null },
    ]);
  });

  it('protects read routes with integrations.manage or sales.read, and command routes with integrations.manage only', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        MarketplaceBotController,
      ),
    ).toEqual(['integrations.manage', 'sales.read']);

    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        MarketplaceBotController.prototype.enqueueCommand,
      ),
    ).toBe('integrations.manage');

    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        MarketplaceBotController.prototype.cancelCommand,
      ),
    ).toBe('integrations.manage');

    expect(
      Reflect.getMetadata(
        EXTERNAL_BEARER_ROUTE_METADATA,
        MarketplaceBotSyncController,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        SERVER_TO_SERVER_ROUTE_METADATA,
        MarketplaceBotSyncController,
      ),
    ).toBe(true);
  });

  it('accepts omitted and long command result details in sync DTO validation', async () => {
    const pipe = new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });

    const parsed = (await pipe.transform(
      {
        botVersion: '2026.11',
        commandProtocolVersion: 1,
        commandResults: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            status: 'COMPLETED',
          },
          {
            detail: 'e'.repeat(1200),
            id: '10000000-0000-4000-8000-000000000002',
            status: 'FAILED',
          },
        ],
        instanceKey: 'pc-principal',
        instanceName: 'PC Principal',
        snapshot: {},
      },
      { metatype: MarketplaceBotSyncDto, type: 'body' },
    )) as MarketplaceBotSyncDto;

    expect(parsed.commandResults).toHaveLength(2);
    expect(parsed.commandResults?.[0]?.detail).toBeUndefined();
    expect(parsed.commandResults?.[1]?.detail).toHaveLength(1200);
  });

  it('maps oversized body-parser errors to HTTP 413 instead of 500', () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn();
    const response = { json, setHeader, status };
    setHeader.mockReturnValue(response);
    status.mockReturnValue(response);

    const request = {
      header: () => undefined,
      method: 'POST',
      path: '/api/v1/integrations/marketplace-bot/sync',
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch({ type: 'entity.too.large' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'REQUEST_FAILED',
        }),
      }),
    );
  });
});
