import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotCommandResult,
  MarketplaceBotCommandStatus,
  MarketplaceBotCommandType,
  MarketplaceBotCommandView,
  MarketplaceBotConnection,
  MarketplaceBotInstanceView,
  MarketplaceBotPendingCommand,
  MarketplaceBotStateData,
  MarketplaceBotSyncData,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { randomUUID } from 'node:crypto';

import type { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import type { Clock } from '../auth/domain/authentication.ports.js';
import { SystemClock } from '../auth/domain/authentication.ports.js';
import { IntegrationAuditService } from './integration-audit.service.js';
import { IntegrationKeyError } from './integration-key.errors.js';
import type { ValidIntegrationKey } from './integration-key.service.js';
import {
  parseMarketplaceBotCommandPayload,
  sanitizeMarketplaceBotSnapshot,
} from './marketplace-bot-snapshot.js';

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
const DELAYED_THRESHOLD_MS = 15 * 60 * 1000;
const COMMAND_EXPIRY_MS = 2 * 60 * 60 * 1000;
const MAX_PENDING_PER_SYNC = 25;
const MAX_RECENT_COMMANDS = 25;
const instanceKeyPattern = /^[A-Za-z0-9_-]{8,64}$/u;

function computeConnection(
  lastHeartbeatAt: Date,
  now: Date,
): MarketplaceBotConnection {
  const ageMs = now.getTime() - lastHeartbeatAt.getTime();
  if (ageMs <= ONLINE_THRESHOLD_MS) return 'ONLINE';
  if (ageMs <= DELAYED_THRESHOLD_MS) return 'DELAYED';
  return 'OFFLINE';
}

export class MarketplaceBotService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly permissions: EffectivePermissionsService,
    private readonly clock: Clock = new SystemClock(),
    private readonly audit = new IntegrationAuditService(),
  ) {}

  /**
   * Called by the local Marketplace bot worker over HTTPS with its integration
   * key. Updates the instance snapshot, records reported command outcomes,
   * expires stale pending commands, and returns remaining pending commands.
   */
  async syncFromBot(
    key: ValidIntegrationKey,
    input: {
      botVersion: string;
      commandResults?: readonly MarketplaceBotCommandResult[];
      instanceKey: string;
      instanceName: string;
      snapshot: unknown;
    },
  ): Promise<MarketplaceBotSyncData> {
    const instanceKey = input.instanceKey.trim();
    const instanceName = input.instanceName.trim();
    const botVersion = input.botVersion.trim();
    if (
      !instanceKeyPattern.test(instanceKey) ||
      !instanceName ||
      instanceName.length > 80 ||
      !botVersion ||
      botVersion.length > 40
    ) {
      throw new IntegrationKeyError('INVALID_REQUEST');
    }

    const sanitizedSnapshot = sanitizeMarketplaceBotSnapshot(input.snapshot);
    const now = this.clock.now();
    const expireBefore = new Date(now.getTime() - COMMAND_EXPIRY_MS);
    const results = input.commandResults ?? [];

    return this.client.$transaction(async (transaction) => {
      await transaction.integrationKey.update({
        data: { lastUsedAt: now },
        where: { id: key.keyId },
      });

      const existing = await transaction.marketplaceBotInstance.findUnique({
        include: {
          integrationKey: { select: { ownerUserId: true } },
        },
        where: { instanceKey },
      });
      if (existing && existing.integrationKey.ownerUserId !== key.ownerUserId) {
        throw new IntegrationKeyError('ACCESS_DENIED');
      }

      const instance = existing
        ? await transaction.marketplaceBotInstance.update({
            data: {
              botVersion,
              integrationKeyId: key.keyId,
              instanceName,
              lastHeartbeatAt: now,
              snapshot: sanitizedSnapshot as unknown as object,
            },
            where: { id: existing.id },
          })
        : await transaction.marketplaceBotInstance.create({
            data: {
              botVersion,
              id: randomUUID(),
              instanceKey,
              instanceName,
              integrationKeyId: key.keyId,
              lastHeartbeatAt: now,
              snapshot: sanitizedSnapshot as unknown as object,
            },
          });

      await transaction.marketplaceBotCommand.updateMany({
        data: {
          completedAt: now,
          resultDetail:
            'Expiró sin ser recibido a tiempo por el bot (más de 2 horas).',
          status: 'EXPIRED',
        },
        where: {
          createdAt: { lte: expireBefore },
          instanceId: instance.id,
          status: 'PENDING',
        },
      });

      for (const result of results.slice(0, MAX_PENDING_PER_SYNC)) {
        if (result.status !== 'COMPLETED' && result.status !== 'FAILED') {
          continue;
        }
        const detail =
          String(result.detail ?? '')
            .trim()
            .slice(0, 500) || null;
        await transaction.marketplaceBotCommand.updateMany({
          data: {
            completedAt: now,
            resultDetail: detail,
            status: result.status,
          },
          where: {
            id: result.id,
            instanceId: instance.id,
            status: 'PENDING',
          },
        });
      }

      const pendingRows = await transaction.marketplaceBotCommand.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_PENDING_PER_SYNC,
        where: {
          instanceId: instance.id,
          status: 'PENDING',
        },
      });

      const pendingCommands: MarketplaceBotPendingCommand[] = pendingRows.map(
        (row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          payload: row.payload as unknown as MarketplaceBotCommandPayload,
        }),
      );

      return { pendingCommands };
    });
  }

  /**
   * Read state for signed-in users. Sellers (`sales.read`) can view statistics
   * and unanswered leads; only `integrations.manage` receives `canControl: true`.
   */
  async getState(actorUserId: string): Promise<MarketplaceBotStateData> {
    const now = this.clock.now();
    const canControl = await this.permissions.hasPermission(
      actorUserId,
      'integrations.manage',
    );

    const rows = await this.client.marketplaceBotInstance.findMany({
      include: {
        commands: {
          include: {
            createdBy: { select: { displayName: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: MAX_RECENT_COMMANDS,
        },
      },
      orderBy: [{ lastHeartbeatAt: 'desc' }, { id: 'asc' }],
    });

    const instances: MarketplaceBotInstanceView[] = rows.map((row) => {
      const commands: MarketplaceBotCommandView[] = row.commands.map((cmd) => ({
        completedAt: cmd.completedAt?.toISOString() ?? null,
        createdAt: cmd.createdAt.toISOString(),
        createdByName: cmd.createdBy.displayName,
        id: cmd.id,
        payload: cmd.payload as unknown as MarketplaceBotCommandPayload,
        resultDetail: cmd.resultDetail,
        status: cmd.status as MarketplaceBotCommandStatus,
        type: cmd.commandType as MarketplaceBotCommandType,
      }));

      return {
        botVersion: row.botVersion,
        commands,
        connection: computeConnection(row.lastHeartbeatAt, now),
        id: row.id,
        instanceName: row.instanceName,
        lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
        snapshot: sanitizeMarketplaceBotSnapshot(row.snapshot),
      };
    });

    return { canControl, instances };
  }

  /**
   * Queues a remote command for the bot to execute on its next sync.
   * Requires `integrations.manage`.
   */
  async enqueueCommand(
    actorUserId: string,
    instanceId: string,
    rawCommand: unknown,
  ): Promise<MarketplaceBotCommandView> {
    if (
      !(await this.permissions.hasPermission(
        actorUserId,
        'integrations.manage',
      ))
    ) {
      throw new IntegrationKeyError('ACCESS_DENIED');
    }

    const payload = parseMarketplaceBotCommandPayload(rawCommand);
    const now = this.clock.now();

    return this.client.$transaction(async (transaction) => {
      const instance = await transaction.marketplaceBotInstance.findUnique({
        select: { id: true, instanceName: true },
        where: { id: instanceId },
      });
      if (!instance) {
        throw new IntegrationKeyError('NOT_FOUND');
      }

      const created = await transaction.marketplaceBotCommand.create({
        data: {
          commandType: payload.type,
          createdAt: now,
          createdByUserId: actorUserId,
          id: randomUUID(),
          instanceId: instance.id,
          payload: payload as unknown as object,
          status: 'PENDING',
        },
        include: {
          createdBy: { select: { displayName: true } },
        },
      });

      await this.audit.record(transaction, {
        action: 'INTEGRATION_BOT_COMMAND_QUEUED',
        actorUserId,
        entityId: created.id,
        metadata: {
          commandType: payload.type,
          instanceId: instance.id,
        },
        occurredAt: now,
      });

      return {
        completedAt: null,
        createdAt: created.createdAt.toISOString(),
        createdByName: created.createdBy.displayName,
        id: created.id,
        payload,
        resultDetail: null,
        status: 'PENDING',
        type: payload.type,
      };
    });
  }

  /**
   * Cancels a still-pending remote command before the bot picks it up.
   */
  async cancelCommand(
    actorUserId: string,
    commandId: string,
  ): Promise<MarketplaceBotCommandView> {
    if (
      !(await this.permissions.hasPermission(
        actorUserId,
        'integrations.manage',
      ))
    ) {
      throw new IntegrationKeyError('ACCESS_DENIED');
    }

    const now = this.clock.now();

    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.marketplaceBotCommand.updateMany({
        data: {
          completedAt: now,
          resultDetail: 'Cancelado desde el SGI antes de enviarse al bot.',
          status: 'CANCELLED',
        },
        where: { id: commandId, status: 'PENDING' },
      });

      const current = await transaction.marketplaceBotCommand.findUnique({
        include: {
          createdBy: { select: { displayName: true } },
        },
        where: { id: commandId },
      });
      if (!current) {
        throw new IntegrationKeyError('NOT_FOUND');
      }

      if (updated.count === 1) {
        await this.audit.record(transaction, {
          action: 'INTEGRATION_BOT_COMMAND_CANCELLED',
          actorUserId,
          entityId: current.id,
          metadata: {
            commandType: current.commandType,
            instanceId: current.instanceId,
          },
          occurredAt: now,
        });
      }

      return {
        completedAt: current.completedAt?.toISOString() ?? null,
        createdAt: current.createdAt.toISOString(),
        createdByName: current.createdBy.displayName,
        id: current.id,
        payload: current.payload as unknown as MarketplaceBotCommandPayload,
        resultDetail: current.resultDetail,
        status: current.status as MarketplaceBotCommandStatus,
        type: current.commandType as MarketplaceBotCommandType,
      };
    });
  }
}
