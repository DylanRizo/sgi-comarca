import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function inRollback(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    await callback(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertUser(client: PoolClient): Promise<string> {
  const id = randomUUID();
  const identifier = 'auth_' + id.replaceAll('-', '').slice(0, 20);
  await client.query(
    [
      'INSERT INTO users (id, login_identifier, display_name, updated_at)',
      'VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
    ].join(' '),
    [id, identifier, 'Authentication fixture'],
  );
  return id;
}

describe('FASE 3B authentication persistence constraints', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('stores only invitation token hashes and no original token column', async () => {
    const result = await pool.query<{ column_name: string }>(
      [
        'SELECT column_name',
        'FROM information_schema.columns',
        "WHERE table_schema = 'public' AND table_name = 'user_invitations'",
        'ORDER BY ordinal_position',
      ].join(' '),
    );
    const columns = result.rows.map(({ column_name }) => column_name);

    expect(columns).toContain('token_hash');
    expect(columns).not.toContain('token');
    expect(columns).not.toContain('raw_token');
    expect(columns).not.toContain('origin_ip');
  });

  it('allows only one pending invitation per user', async () => {
    await inRollback(async (client) => {
      const userId = await insertUser(client);
      await client.query(
        [
          'INSERT INTO user_invitations',
          '(id, user_id, token_hash, created_at, expires_at)',
          "VALUES ($1, $2, repeat('a', 64), CURRENT_TIMESTAMP,",
          "CURRENT_TIMESTAMP + INTERVAL '24 hours')",
        ].join(' '),
        [randomUUID(), userId],
      );

      await expect(
        client.query(
          [
            'INSERT INTO user_invitations',
            '(id, user_id, token_hash, created_at, expires_at)',
            "VALUES ($1, $2, repeat('b', 64), CURRENT_TIMESTAMP,",
            "CURRENT_TIMESTAMP + INTERVAL '24 hours')",
          ].join(' '),
          [randomUUID(), userId],
        ),
      ).rejects.toMatchObject({
        constraint: 'user_invitations_one_pending_per_user',
      });
    });
  });

  it('makes invitation consumption and invalidation mutually exclusive', async () => {
    await inRollback(async (client) => {
      const userId = await insertUser(client);
      await expect(
        client.query(
          [
            'INSERT INTO user_invitations',
            '(id, user_id, token_hash, created_at, expires_at, consumed_at,',
            'invalidated_at, invalidation_reason)',
            "VALUES ($1, $2, repeat('c', 64), CURRENT_TIMESTAMP,",
            "CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP,",
            "CURRENT_TIMESTAMP, 'replacement')",
          ].join(' '),
          [randomUUID(), userId],
        ),
      ).rejects.toMatchObject({
        constraint: 'user_invitations_terminal_state_exclusive',
      });
    });
  });

  it('enforces the exact 24-hour invitation lifetime', async () => {
    await inRollback(async (client) => {
      const userId = await insertUser(client);
      await expect(
        client.query(
          [
            'INSERT INTO user_invitations',
            '(id, user_id, token_hash, created_at, expires_at)',
            "VALUES ($1, $2, repeat('d', 64), CURRENT_TIMESTAMP,",
            "CURRENT_TIMESTAMP + INTERVAL '23 hours')",
          ].join(' '),
          [randomUUID(), userId],
        ),
      ).rejects.toMatchObject({
        constraint: 'user_invitations_exact_lifetime',
      });
    });
  });

  it('uses RESTRICT for invitation users', async () => {
    await inRollback(async (client) => {
      const userId = await insertUser(client);
      await client.query(
        [
          'INSERT INTO user_invitations',
          '(id, user_id, token_hash, created_at, expires_at)',
          "VALUES ($1, $2, repeat('e', 64), CURRENT_TIMESTAMP,",
          "CURRENT_TIMESTAMP + INTERVAL '24 hours')",
        ].join(' '),
        [randomUUID(), userId],
      );

      await expect(
        client.query('DELETE FROM users WHERE id = $1', [userId]),
      ).rejects.toMatchObject({
        constraint: 'user_invitations_user_id_fkey',
      });
    });
  });

  it('keeps throttle identity unique by normalized identifier and origin hash', async () => {
    await inRollback(async (client) => {
      const firstId = randomUUID();
      await client.query(
        [
          'INSERT INTO login_throttles',
          '(id, normalized_identifier, origin_hash, updated_at)',
          "VALUES ($1, 'dylan', repeat('f', 64), CURRENT_TIMESTAMP)",
        ].join(' '),
        [firstId],
      );

      await expect(
        client.query(
          [
            'INSERT INTO login_throttles',
            '(id, normalized_identifier, origin_hash, updated_at)',
            "VALUES ($1, 'dylan', repeat('f', 64), CURRENT_TIMESTAMP)",
          ].join(' '),
          [randomUUID()],
        ),
      ).rejects.toMatchObject({
        constraint: 'login_throttles_identifier_origin_key',
      });
    });
  });

  it('increments four concurrent failures without losing updates', async () => {
    const throttleId = randomUUID();
    const originHash = randomUUID().replaceAll('-', '').padEnd(64, '0');
    await pool.query(
      [
        'INSERT INTO login_throttles',
        '(id, normalized_identifier, origin_hash, window_started_at,',
        'created_at, updated_at)',
        "VALUES ($1, 'concurrent-user', $2, CURRENT_TIMESTAMP,",
        'CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      ].join(' '),
      [throttleId, originHash],
    );

    try {
      const updates = await Promise.all(
        Array.from({ length: 4 }, () =>
          pool.query(
            [
              'UPDATE login_throttles',
              'SET failed_attempt_count = failed_attempt_count + 1,',
              'last_failed_at = CURRENT_TIMESTAMP,',
              'blocked_until = CASE',
              'WHEN failed_attempt_count + 1 = 4',
              "THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'",
              'ELSE NULL END,',
              'updated_at = CURRENT_TIMESTAMP',
              'WHERE id = $1 AND failed_attempt_count < 4',
            ].join(' '),
            [throttleId],
          ),
        ),
      );
      expect(updates.map(({ rowCount }) => rowCount)).toEqual([1, 1, 1, 1]);

      const result = await pool.query<{
        blocked_for_seconds: string;
        failed_attempt_count: number;
      }>(
        [
          'SELECT failed_attempt_count,',
          'extract(epoch FROM (blocked_until - last_failed_at))::text',
          'AS blocked_for_seconds',
          'FROM login_throttles WHERE id = $1',
        ].join(' '),
        [throttleId],
      );
      expect(result.rows[0]).toEqual({
        blocked_for_seconds: '900.000000',
        failed_attempt_count: 4,
      });
    } finally {
      await pool.query('DELETE FROM login_throttles WHERE id = $1', [
        throttleId,
      ]);
    }
  });

  it('does not allow an expired session to be renewed', async () => {
    await inRollback(async (client) => {
      const userId = await insertUser(client);
      const sessionId = randomUUID();
      await client.query(
        [
          'INSERT INTO sessions',
          '(id, user_id, token_hash, created_at, last_seen_at,',
          'idle_expires_at, absolute_expires_at)',
          "VALUES ($1, $2, repeat('1', 64),",
          "CURRENT_TIMESTAMP - INTERVAL '2 hours',",
          "CURRENT_TIMESTAMP - INTERVAL '1 hour',",
          "CURRENT_TIMESTAMP - INTERVAL '30 minutes',",
          "CURRENT_TIMESTAMP + INTERVAL '6 hours')",
        ].join(' '),
        [sessionId, userId],
      );

      await expect(
        client.query(
          [
            'UPDATE sessions',
            'SET last_seen_at = CURRENT_TIMESTAMP,',
            "idle_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes'",
            'WHERE id = $1',
          ].join(' '),
          [sessionId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
