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
  botIdempotencyKeyPattern,
  canonicalBotCommandRequest,
  sha256,
} from './marketplace-bot-request.canonical.js';
import {
  parseMarketplaceBotCommandPayload,
  sanitizeMarketplaceBotSnapshot,
} from './marketplace-bot-snapshot.js';

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
const DELAYED_THRESHOLD_MS = 15 * 60 * 1000;
const COMMAND_EXPIRY_MS = 2 * 60 * 60 * 1000;
const MAX_PENDING_PER_SYNC = 25;
const MAX_RECENT_COMMANDS = 25;
const MAX_RESULT_DETAIL_LENGTH = 500;
const instanceKeyPattern = /^[A-Za-z0-9_-]{8,64}$/u;

const NEVER_RECEIVED_DETAIL =
  'Expiró sin ser recibido a tiempo por el bot (más de 2 horas).';
const NO_OUTCOME_DETAIL =
  'El bot recibió el comando pero no reportó su resultado en 2 horas. Revisa el bot antes de repetirlo.';
const CANCELLED_DETAIL = 'Cancelado desde el SGI antes de enviarse al bot.';

type CommandRow = {
  commandType: string;
  completedAt: Date | null;
  createdAt: Date;
  createdBy: { displayName: string };
  deliveredAt: Date | null;
  id: string;
  payload: unknown;
  resultDetail: string | null;
  status: string;
};

function toCommandView(row: CommandRow): MarketplaceBotCommandView {
  return {
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy.displayName,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    id: row.id,
    payload: row.payload as MarketplaceBotCommandPayload,
    resultDetail: row.resultDetail,
    status: row.status as MarketplaceBotCommandStatus,
    type: row.commandType as MarketplaceBotCommandType,
  };
}

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
   * key. Updates the instance snapshot, records the outcomes the bot reports,
   * expires stale commands and hands over the ones still waiting.
   *
   * Each command is handed over exactly once. Sending it again on every
   * heartbeat would leave it to the bot alone not to delete or relist the same
   * listing twice, so a command whose response was lost is not retried: it ends
   * as `EXPIRED` and a person decides again.
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

      // Outcomes first. A result that arrives in the same heartbeat in which
      // the command would expire is still the truth about what the bot did,
      // and so is one that arrives after the SGI gave up waiting for it.
      for (const result of results) {
        if (result.status !== 'COMPLETED' && result.status !== 'FAILED') {
          continue;
        }
        const detail =
          String(result.detail ?? '')
            .trim()
            .slice(0, MAX_RESULT_DETAIL_LENGTH) || null;
        await transaction.marketplaceBotCommand.updateMany({
          data: {
            completedAt: now,
            resultDetail: detail,
            status: result.status,
          },
          where: {
            // Only a command the bot was actually given can have an outcome.
            deliveredAt: { not: null },
            id: result.id,
            instanceId: instance.id,
            status: { in: ['PENDING', 'EXPIRED'] },
          },
        });
      }

      await transaction.marketplaceBotCommand.updateMany({
        data: {
          completedAt: now,
          resultDetail: NEVER_RECEIVED_DETAIL,
          status: 'EXPIRED',
        },
        where: {
          createdAt: { lte: expireBefore },
          deliveredAt: null,
          instanceId: instance.id,
          status: 'PENDING',
        },
      });
      await transaction.marketplaceBotCommand.updateMany({
        data: {
          completedAt: now,
          resultDetail: NO_OUTCOME_DETAIL,
          status: 'EXPIRED',
        },
        where: {
          deliveredAt: { lte: expireBefore },
          instanceId: instance.id,
          status: 'PENDING',
        },
      });

      // The instance row was written above, so two heartbeats of the same
      // instance run one after the other and cannot both take a command. The
      // conditional update also loses cleanly to a concurrent cancellation.
      const waiting = await transaction.marketplaceBotCommand.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
        take: MAX_PENDING_PER_SYNC,
        where: {
          deliveredAt: null,
          instanceId: instance.id,
          status: 'PENDING',
        },
      });
      const handedOver =
        waiting.length === 0
          ? []
          : await transaction.marketplaceBotCommand.updateManyAndReturn({
              data: { deliveredAt: now },
              select: { createdAt: true, id: true, payload: true },
              where: {
                deliveredAt: null,
                id: { in: waiting.map((row) => row.id) },
                status: 'PENDING',
              },
            });

      const pendingCommands: MarketplaceBotPendingCommand[] = handedOver
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          payload: row.payload as unknown as MarketplaceBotCommandPayload,
        }));

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
      const commands = row.commands.map(toCommandView);

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
   * Queues a remote command for the bot to run on its next heartbeat.
   * Requires `integrations.manage` and an `Idempotency-Key`: repeating the key
   * with the same command returns the command already queued, so a double
   * click or a retried request never deletes or relists a listing twice.
   */
  async enqueueCommand(
    actorUserId: string,
    instanceId: string,
    idempotencyKey: string | undefined,
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
    if (
      idempotencyKey === undefined ||
      !botIdempotencyKeyPattern.test(idempotencyKey)
    ) {
      throw new IntegrationKeyError('INVALID_REQUEST');
    }

    const payload = parseMarketplaceBotCommandPayload(rawCommand);
    const idempotencyKeyHash = sha256(idempotencyKey);
    const requestHash = sha256(canonicalBotCommandRequest(instanceId, payload));
    const now = this.clock.now();

    return this.client.$transaction(async (transaction) => {
      // The key is never stored in clear; its hash is scoped to the actor.
      const scope = `marketplace-bot.command:${actorUserId}:${idempotencyKeyHash}`;
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
      `;
      const replay = await transaction.marketplaceBotCommand.findUnique({
        include: { createdBy: { select: { displayName: true } } },
        where: {
          createdByUserId_idempotencyKeyHash: {
            createdByUserId: actorUserId,
            idempotencyKeyHash,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new IntegrationKeyError('CONFLICT');
        }
        return toCommandView(replay);
      }

      const instance = await transaction.marketplaceBotInstance.findUnique({
        select: { id: true },
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
          idempotencyKeyHash,
          instanceId: instance.id,
          payload: payload as unknown as object,
          requestHash,
          status: 'PENDING',
        },
        include: { createdBy: { select: { displayName: true } } },
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

      return toCommandView(created);
    });
  }

  /**
   * Cancels a command the bot has not been given yet. Idempotent for a command
   * that already finished. Once the bot has the command the SGI cannot take it
   * back, so saying "cancelled" would be false: that is a conflict.
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
          resultDetail: CANCELLED_DETAIL,
          status: 'CANCELLED',
        },
        where: { deliveredAt: null, id: commandId, status: 'PENDING' },
      });

      const current = await transaction.marketplaceBotCommand.findUnique({
        include: { createdBy: { select: { displayName: true } } },
        where: { id: commandId },
      });
      if (!current) {
        throw new IntegrationKeyError('NOT_FOUND');
      }
      if (updated.count === 0 && current.status === 'PENDING') {
        throw new IntegrationKeyError('CONFLICT');
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

      return toCommandView(current);
    });
  }
}
