import type { ConfigType } from '@nestjs/config';
import type {
  CreatedIntegrationKeyData,
  IntegrationKeyScope,
  IntegrationKeySummary,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { randomUUID } from 'node:crypto';

import type { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import type { Clock } from '../auth/domain/authentication.ports.js';
import { SystemClock } from '../auth/domain/authentication.ports.js';
import { AuthTokenService } from '../auth/infrastructure/auth-token.service.js';
import type { appConfig } from '../config/app.config.js';
import { IntegrationAuditService } from './integration-audit.service.js';
import { IntegrationKeyError } from './integration-key.errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX_LENGTH = 8;

export type ValidIntegrationKey = {
  keyId: string;
  ownerUserId: string;
  scopes: readonly IntegrationKeyScope[];
};

const summarySelect = {
  createdAt: true,
  expiresAt: true,
  id: true,
  keyPrefix: true,
  lastUsedAt: true,
  name: true,
  revokedAt: true,
  scopes: true,
} as const;

type KeySummaryRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  scopes: string[];
};

function toSummary(key: KeySummaryRecord, now: Date): IntegrationKeySummary {
  return {
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt.toISOString(),
    id: key.id,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    name: key.name,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    scopes: key.scopes as IntegrationKeyScope[],
    status: key.revokedAt
      ? 'REVOKED'
      : key.expiresAt <= now
        ? 'EXPIRED'
        : 'ACTIVE',
  };
}

export class IntegrationKeyService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly configuration: ConfigType<typeof appConfig>,
    private readonly permissions: EffectivePermissionsService,
    private readonly tokens = new AuthTokenService(),
    private readonly clock: Clock = new SystemClock(),
    private readonly audit = new IntegrationAuditService(),
  ) {}

  async create(
    ownerUserId: string,
    input: { expiresInDays: number; name: string },
  ): Promise<CreatedIntegrationKeyData> {
    this.requireEnabled();
    const settings = this.configuration.integrationKeys;
    const name = input.name.trim();
    if (
      !name ||
      name.length > 80 ||
      !Number.isInteger(input.expiresInDays) ||
      input.expiresInDays < 1 ||
      input.expiresInDays > settings.maxLifetimeDays
    ) {
      throw new IntegrationKeyError('INVALID_REQUEST');
    }

    // A key acts on behalf of its owner, so it can never carry a capability the
    // owner does not already hold.
    for (const scope of settings.scopes) {
      if (!(await this.permissions.hasPermission(ownerUserId, scope))) {
        throw new IntegrationKeyError('ACCESS_DENIED');
      }
    }

    const generated = this.tokens.generate();
    const secret = generated.secret.revealOnce();
    const now = this.clock.now();
    const key = await this.client.$transaction(async (transaction) => {
      const created = await transaction.integrationKey.create({
        data: {
          createdAt: now,
          expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
          id: randomUUID(),
          keyHash: generated.tokenHash,
          keyPrefix: secret.slice(0, KEY_PREFIX_LENGTH),
          name,
          ownerUserId,
          scopes: [...settings.scopes],
        },
        select: summarySelect,
      });
      await this.audit.record(transaction, {
        action: 'INTEGRATION_KEY_CREATED',
        actorUserId: ownerUserId,
        entityId: created.id,
        metadata: {
          expiresInDays: input.expiresInDays,
          scopeCount: settings.scopes.length,
        },
        occurredAt: now,
      });
      return created;
    });

    return { key: toSummary(key, now), secret };
  }

  /** Readable while the integration is disabled, so a key can still be found. */
  async list(ownerUserId: string): Promise<readonly IntegrationKeySummary[]> {
    const now = this.clock.now();
    const keys = await this.client.integrationKey.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: summarySelect,
      where: { ownerUserId },
    });
    return keys.map((key) => toSummary(key, now));
  }

  /**
   * Idempotent and allowed while the integration is disabled: revoking must
   * always work, because it is the response to a leaked key.
   */
  async revoke(
    ownerUserId: string,
    keyId: string,
  ): Promise<IntegrationKeySummary> {
    const now = this.clock.now();
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.integrationKey.updateMany({
        data: { revocationReason: 'OWNER_REVOKED', revokedAt: now },
        where: { id: keyId, ownerUserId, revokedAt: null },
      });
      const current = await transaction.integrationKey.findFirst({
        select: summarySelect,
        where: { id: keyId, ownerUserId },
      });
      if (!current) throw new IntegrationKeyError('NOT_FOUND');
      if (updated.count === 1) {
        await this.audit.record(transaction, {
          action: 'INTEGRATION_KEY_REVOKED',
          actorUserId: ownerUserId,
          entityId: keyId,
          metadata: { reason: 'OWNER_REVOKED' },
          occurredAt: now,
        });
      }
      return toSummary(current, now);
    });
  }

  async authenticate(rawKey: string): Promise<ValidIntegrationKey> {
    this.requireEnabled();
    const keyHash = this.tokens.hashValidatedToken(rawKey);
    if (!keyHash) throw new IntegrationKeyError('INVALID_KEY');

    const now = this.clock.now();
    const key = await this.client.integrationKey.findUnique({
      include: {
        owner: {
          select: {
            passwordCredential: {
              select: { passwordChangedAt: true, revokedAt: true },
            },
            status: true,
          },
        },
      },
      where: { keyHash },
    });
    const credential = key?.owner.passwordCredential;
    // Same invalidation boundaries as ADR-016: a disabled owner, a revoked
    // credential or a password changed after the key was issued all end it.
    if (
      !key ||
      key.revokedAt ||
      key.expiresAt <= now ||
      key.owner.status !== 'ACTIVE' ||
      !credential ||
      credential.revokedAt ||
      credential.passwordChangedAt > key.createdAt
    ) {
      throw new IntegrationKeyError('INVALID_KEY');
    }

    return {
      keyId: key.id,
      ownerUserId: key.ownerUserId,
      scopes: key.scopes as IntegrationKeyScope[],
    };
  }

  async consumeQueryAllowance(keyId: string): Promise<void> {
    const now = this.clock.now();
    const resetBefore = new Date(now.getTime() - 60 * 1000);
    const rows = await this.client.$queryRaw<Array<{ requestCount: number }>>`
      INSERT INTO integration_rate_limit_windows (
        key_id, window_started_at, request_count, updated_at
      ) VALUES (${keyId}::uuid, ${now}, 1, ${now})
      ON CONFLICT (key_id) DO UPDATE SET
        window_started_at = CASE
          WHEN integration_rate_limit_windows.window_started_at <= ${resetBefore}
            THEN ${now}
          ELSE integration_rate_limit_windows.window_started_at
        END,
        request_count = CASE
          WHEN integration_rate_limit_windows.window_started_at <= ${resetBefore}
            THEN 1
          ELSE integration_rate_limit_windows.request_count + 1
        END,
        updated_at = ${now}
      RETURNING request_count AS "requestCount"
    `;
    const limit = this.configuration.integrationKeys.queryLimitPerMinute;
    if ((rows[0]?.requestCount ?? limit + 1) > limit) {
      throw new IntegrationKeyError('RATE_LIMITED');
    }
  }

  /**
   * One audit row per catalog sync rather than per page: a sync always starts
   * on page 1, and paging through it is the same act.
   */
  async recordCatalogRead(
    key: ValidIntegrationKey,
    page: number,
    itemCount: number,
  ): Promise<void> {
    const now = this.clock.now();
    await this.client.$transaction(async (transaction) => {
      await transaction.integrationKey.update({
        data: { lastUsedAt: now },
        where: { id: key.keyId },
      });
      if (page === 1) {
        await this.audit.record(transaction, {
          action: 'INTEGRATION_CATALOG_READ',
          actorUserId: key.ownerUserId,
          entityId: key.keyId,
          metadata: { itemCount },
          occurredAt: now,
        });
      }
    });
  }

  private requireEnabled(): void {
    if (!this.configuration.integrationKeys.enabled) {
      throw new IntegrationKeyError('INTEGRATION_DISABLED');
    }
  }
}
