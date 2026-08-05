import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '@sgi/database';

import type { Clock } from '../domain/authentication.ports.js';
import { SystemClock } from '../domain/authentication.ports.js';
import type { TransactionClient } from './last-admin-policy.js';

const BLOCK_MS = 15 * 60 * 1000;
const FAILURE_DELAYS_MS = [0, 0, 500, 1_000, 2_000] as const;

type ThrottleRow = {
  blockedUntil: Date | null;
  failedAttemptCount: number;
};

export type LoginThrottleState = {
  blockedUntil: Date | null;
  delayMilliseconds: number;
  failedAttemptCount: number;
};

export class LoginThrottleService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async blockedUntil(
    normalizedIdentifier: string,
    originHash: string,
  ): Promise<Date | null> {
    const row = await this.client.loginThrottle.findUnique({
      where: {
        normalizedIdentifier_originHash: {
          normalizedIdentifier,
          originHash,
        },
      },
      select: { blockedUntil: true },
    });
    const now = this.clock.now();
    return row?.blockedUntil && row.blockedUntil > now
      ? row.blockedUntil
      : null;
  }

  async recordFailure(
    normalizedIdentifier: string,
    originHash: string,
  ): Promise<LoginThrottleState> {
    return this.client.$transaction((transaction) =>
      this.recordFailureInTransaction(
        transaction,
        normalizedIdentifier,
        originHash,
        this.clock.now(),
      ),
    );
  }

  async recordFailureInTransaction(
    transaction: TransactionClient,
    normalizedIdentifier: string,
    originHash: string,
    now: Date,
  ): Promise<LoginThrottleState> {
    const id = randomUUID();
    const blockEndsAt = new Date(now.getTime() + BLOCK_MS);
    const rows = await transaction.$queryRaw<ThrottleRow[]>`
      INSERT INTO login_throttles (
        id,
        normalized_identifier,
        origin_hash,
        failed_attempt_count,
        window_started_at,
        last_failed_at,
        blocked_until,
        created_at,
        updated_at
      ) VALUES (
        ${id}::uuid,
        ${normalizedIdentifier},
        ${originHash},
        1,
        ${now},
        ${now},
        NULL,
        ${now},
        ${now}
      )
      ON CONFLICT (normalized_identifier, origin_hash) DO UPDATE SET
        failed_attempt_count = CASE
          WHEN login_throttles.blocked_until > ${now}
            THEN login_throttles.failed_attempt_count
          WHEN login_throttles.window_started_at + INTERVAL '15 minutes' <= ${now}
            THEN 1
          ELSE LEAST(login_throttles.failed_attempt_count + 1, 4)
        END,
        window_started_at = CASE
          WHEN login_throttles.blocked_until > ${now}
            THEN login_throttles.window_started_at
          WHEN login_throttles.window_started_at + INTERVAL '15 minutes' <= ${now}
            THEN ${now}
          ELSE login_throttles.window_started_at
        END,
        last_failed_at = CASE
          WHEN login_throttles.blocked_until > ${now}
            THEN login_throttles.last_failed_at
          ELSE ${now}
        END,
        blocked_until = CASE
          WHEN login_throttles.blocked_until > ${now}
            THEN login_throttles.blocked_until
          WHEN login_throttles.window_started_at + INTERVAL '15 minutes' <= ${now}
            THEN NULL
          WHEN login_throttles.failed_attempt_count + 1 >= 4
            THEN ${blockEndsAt}
          ELSE NULL
        END,
        updated_at = ${now}
      RETURNING
        failed_attempt_count AS "failedAttemptCount",
        blocked_until AS "blockedUntil"
    `;

    const row = rows[0];
    if (!row) throw new Error('Login throttle update returned no row.');
    const attempt = Math.min(Math.max(row.failedAttemptCount, 1), 4);
    return {
      blockedUntil: row.blockedUntil,
      delayMilliseconds: FAILURE_DELAYS_MS[attempt] ?? 2_000,
      failedAttemptCount: row.failedAttemptCount,
    };
  }

  async resetInTransaction(
    transaction: TransactionClient,
    normalizedIdentifier: string,
    originHash: string,
    now: Date,
  ): Promise<void> {
    await transaction.loginThrottle.updateMany({
      where: { normalizedIdentifier, originHash },
      data: {
        blockedUntil: null,
        failedAttemptCount: 0,
        lastFailedAt: null,
        updatedAt: now,
        windowStartedAt: now,
      },
    });
  }
}
