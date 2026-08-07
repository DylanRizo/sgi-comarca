import type { DatabaseClient } from '@sgi/database';

import { SessionError } from '../domain/authentication.errors.js';
import type { Clock } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import {
  AuthTokenService,
  type GeneratedToken,
  type SecretToken,
} from '../infrastructure/auth-token.service.js';
import { AuthAuditService } from './auth-audit.service.js';
import type { TransactionClient } from './last-admin-policy.js';

const IDLE_LIFETIME_MS = 30 * 60 * 1000;
const ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;

type SessionRow = {
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  sessionId: string;
  userId: string;
};

export type ActiveSession = SessionRow;

export class SessionService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly tokens = new AuthTokenService(),
    private readonly clock: Clock = new SystemClock(),
    private readonly audit = new AuthAuditService(),
  ) {}

  prepare(): GeneratedToken {
    return this.tokens.generate();
  }

  async createInTransaction(
    transaction: TransactionClient,
    userId: string,
    generated: GeneratedToken,
    now: Date,
  ): Promise<ActiveSession> {
    const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_LIFETIME_MS);
    const idleExpiresAt = new Date(
      Math.min(now.getTime() + IDLE_LIFETIME_MS, absoluteExpiresAt.getTime()),
    );
    const session = await transaction.session.create({
      data: {
        absoluteExpiresAt,
        createdAt: now,
        idleExpiresAt,
        lastSeenAt: now,
        tokenHash: generated.tokenHash,
        userId,
      },
      select: {
        absoluteExpiresAt: true,
        id: true,
        idleExpiresAt: true,
        lastSeenAt: true,
        userId: true,
      },
    });
    return {
      absoluteExpiresAt: session.absoluteExpiresAt,
      idleExpiresAt: session.idleExpiresAt,
      lastSeenAt: session.lastSeenAt,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  async create(userId: string): Promise<SecretToken> {
    const generated = this.prepare();
    const now = this.clock.now();
    await this.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id
          FROM users
          WHERE id = ${userId}::uuid
          FOR UPDATE
        `;
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (user?.status !== 'ACTIVE') throw new SessionError();
        await this.createInTransaction(transaction, userId, generated, now);
      },
      { isolationLevel: 'Serializable' },
    );
    return generated.secret;
  }

  async validateAndRenew(token: string): Promise<ActiveSession> {
    const tokenHash = this.tokens.hashValidatedToken(token);
    if (!tokenHash) throw new SessionError();
    const now = this.clock.now();
    const proposedIdleExpiry = new Date(now.getTime() + IDLE_LIFETIME_MS);
    const rows = await this.client.$queryRaw<SessionRow[]>`
      UPDATE sessions AS session
      SET
        last_seen_at = ${now},
        idle_expires_at = LEAST(${proposedIdleExpiry}, session.absolute_expires_at)
      FROM users AS account
      WHERE
        session.token_hash = ${tokenHash}
        AND account.id = session.user_id
        AND account.status = 'ACTIVE'::user_status
        AND session.revoked_at IS NULL
        AND session.idle_expires_at > ${now}
        AND session.absolute_expires_at > ${now}
      RETURNING
        session.id AS "sessionId",
        session.user_id AS "userId",
        session.last_seen_at AS "lastSeenAt",
        session.idle_expires_at AS "idleExpiresAt",
        session.absolute_expires_at AS "absoluteExpiresAt"
    `;
    const session = rows[0];
    if (!session) throw new SessionError();
    return session;
  }

  async logout(token: string): Promise<void> {
    const tokenHash = this.tokens.hashValidatedToken(token);
    if (!tokenHash) return;
    const now = this.clock.now();
    await this.client.$transaction(async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { tokenHash },
        select: { id: true, revokedAt: true, userId: true },
      });
      if (!session || session.revokedAt) return;
      const result = await transaction.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'LOGOUT' },
      });
      if (result.count === 1) {
        await this.audit.record(transaction, {
          action: 'AUTH_LOGOUT',
          actorUserId: session.userId,
          entityId: session.id,
          occurredAt: now,
        });
      }
    });
  }

  async revokeOne(sessionId: string, reason: string): Promise<number> {
    const now = this.clock.now();
    return this.client.$transaction(async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (!session) return 0;
      const result = await transaction.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: reason },
      });
      if (result.count === 1) {
        await this.audit.record(transaction, {
          action: 'AUTH_SESSION_REVOKED',
          entityId: sessionId,
          metadata: { reason },
          occurredAt: now,
        });
      }
      return result.count;
    });
  }

  async revokeAll(userId: string, reason: string): Promise<number> {
    const now = this.clock.now();
    return this.client.$transaction((transaction) =>
      this.revokeAllInTransaction(transaction, userId, reason, now, true),
    );
  }

  async revokeAllInTransaction(
    transaction: TransactionClient,
    userId: string,
    reason: string,
    now: Date,
    writeAudit = false,
  ): Promise<number> {
    const result = await transaction.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    if (writeAudit && result.count > 0) {
      await this.audit.record(transaction, {
        action: 'AUTH_SESSIONS_REVOKED',
        entityId: userId,
        metadata: { count: result.count, reason },
        occurredAt: now,
      });
    }
    return result.count;
  }
}

export const sessionLifetimePolicy = {
  absoluteMilliseconds: ABSOLUTE_LIFETIME_MS,
  idleMilliseconds: IDLE_LIFETIME_MS,
} as const;
