import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const pool = new Pool({ connectionString: databaseUrl });

function digest(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}

/** Each test gets its own business date so the one-closing-per-date rule holds. */
let dateCounter = 0;
function nextBusinessDate(): string {
  dateCounter += 1;
  const day = String(dateCounter).padStart(2, '0');
  return `2027-01-${day}`;
}

async function insertActor(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO users',
      '(id, login_identifier, display_name, status, activated_at, updated_at)',
      "VALUES ($1, $2, 'Finance fixture', 'ACTIVE', now(), now())",
    ].join(' '),
    [id, `fin_${id.replaceAll('-', '')}`],
  );
  return id;
}

async function insertCategory(
  client: PoolClient,
  entryType: 'EXPENSE' | 'INCOME',
  active = true,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO financial_categories',
      '(id, code, name, entry_type, active, updated_at)',
      'VALUES ($1, $2, $3, $4, $5, now())',
    ].join(' '),
    [
      id,
      `CAT_${id.replaceAll('-', '').slice(0, 12)}`,
      'Categoría',
      entryType,
      active,
    ],
  );
  return id;
}

interface ClosingInput {
  balanced?: boolean;
  businessDate?: string;
  difference?: string;
  realCash?: string;
  realDigital?: string;
  status?: 'CLOSED' | 'REOPENED';
  systemSales?: string;
  tolerance?: string;
}

async function insertClosing(
  client: PoolClient,
  input: ClosingInput = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO daily_closings',
      '(id, origin, business_date, status, real_cash, real_digital,',
      'system_sales, difference, tolerance_applied, balanced, closed_at,',
      'updated_at)',
      "VALUES ($1, 'LEGACY_IMPORT', $2, $3, $4, $5, $6, $7, $8, $9, now(), now())",
    ].join(' '),
    [
      id,
      input.businessDate ?? nextBusinessDate(),
      input.status ?? 'CLOSED',
      input.realCash ?? '60.00',
      input.realDigital ?? '40.00',
      input.systemSales ?? '100.00',
      input.difference ?? '0.00',
      input.tolerance ?? '0.50',
      input.balanced ?? true,
    ],
  );
  return id;
}

async function expectRejection(
  run: () => Promise<unknown>,
  constraint: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({ constraint });
}

describe('FASE 8A finances and daily closings schema', () => {
  let client!: PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });

  describe('financial entries', () => {
    it('accepts a legacy entry without operational actors', async () => {
      const id = randomUUID();
      await client.query(
        [
          'INSERT INTO financial_entries',
          '(id, origin, entry_type, business_date, amount, updated_at)',
          "VALUES ($1, 'LEGACY_IMPORT', 'EXPENSE', $2, '10.50', now())",
        ].join(' '),
        [id, nextBusinessDate()],
      );
      const stored = await client.query(
        'SELECT amount::text AS amount FROM financial_entries WHERE id = $1',
        [id],
      );
      expect(stored.rows[0]?.amount).toBe('10.50');
    });

    it('rejects a non-positive amount', async () => {
      await expectRejection(
        () =>
          client.query(
            [
              'INSERT INTO financial_entries',
              '(id, origin, entry_type, business_date, amount, updated_at)',
              "VALUES ($1, 'LEGACY_IMPORT', 'EXPENSE', $2, '0', now())",
            ].join(' '),
            [randomUUID(), nextBusinessDate()],
          ),
        'financial_entries_amount_positive',
      );
    });

    it('requires creator, responsible, category and hashes when operational', async () => {
      await expectRejection(
        () =>
          client.query(
            [
              'INSERT INTO financial_entries',
              '(id, origin, entry_type, business_date, amount, updated_at)',
              "VALUES ($1, 'OPERATIONAL', 'EXPENSE', $2, '5.00', now())",
            ].join(' '),
            [randomUUID(), nextBusinessDate()],
          ),
        'financial_entries_operational_persisted_shape',
      );
    });

    it('rejects a category whose type does not match the entry', async () => {
      const categoryId = await insertCategory(client, 'INCOME');
      await expectRejection(
        () =>
          client.query(
            [
              'INSERT INTO financial_entries',
              '(id, origin, entry_type, business_date, amount, category_id,',
              'updated_at)',
              "VALUES ($1, 'LEGACY_IMPORT', 'EXPENSE', $2, '5.00', $3, now())",
            ].join(' '),
            [randomUUID(), nextBusinessDate(), categoryId],
          ),
        'financial_entries_category_type_match',
      );
    });

    it('rejects an inactive category for an operational entry', async () => {
      const [actorId, categoryId] = await Promise.all([
        insertActor(client),
        insertCategory(client, 'EXPENSE', false),
      ]);
      await expectRejection(
        () =>
          client.query(
            [
              'INSERT INTO financial_entries',
              '(id, origin, entry_type, business_date, amount, category_id,',
              'responsible_user_id, created_by_user_id, idempotency_key_hash,',
              'request_hash, updated_at)',
              "VALUES ($1, 'OPERATIONAL', 'EXPENSE', $2, '5.00', $3, $4, $4,",
              '$5, $6, now())',
            ].join(' '),
            [
              randomUUID(),
              nextBusinessDate(),
              categoryId,
              actorId,
              digest(),
              digest(),
            ],
          ),
        'financial_entries_category_active',
      );
    });

    it('never allows editing or deleting a persisted entry', async () => {
      const id = randomUUID();
      await client.query(
        [
          'INSERT INTO financial_entries',
          '(id, origin, entry_type, business_date, amount, updated_at)',
          "VALUES ($1, 'LEGACY_IMPORT', 'INCOME', $2, '7.00', now())",
        ].join(' '),
        [id, nextBusinessDate()],
      );
      await expect(
        client.query('UPDATE financial_entries SET amount = 8 WHERE id = $1', [
          id,
        ]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        client.query('DELETE FROM financial_entries WHERE id = $1', [id]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('scopes the idempotency key to its creator', async () => {
      const [firstActor, secondActor, categoryId] = await Promise.all([
        insertActor(client),
        insertActor(client),
        insertCategory(client, 'INCOME'),
      ]);
      const keyHash = digest();
      const insert = (actorId: string) =>
        client.query(
          [
            'INSERT INTO financial_entries',
            '(id, origin, entry_type, business_date, amount, category_id,',
            'responsible_user_id, created_by_user_id, idempotency_key_hash,',
            'request_hash, updated_at)',
            "VALUES ($1, 'OPERATIONAL', 'INCOME', $2, '5.00', $3, $4, $4,",
            '$5, $6, now())',
          ].join(' '),
          [
            randomUUID(),
            nextBusinessDate(),
            categoryId,
            actorId,
            keyHash,
            digest(),
          ],
        );
      await insert(firstActor);
      // The same key belongs to another actor, so it is a different scope.
      await expect(insert(secondActor)).resolves.toBeDefined();
      await expect(insert(firstActor)).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('daily closings', () => {
    it('accepts a balanced closing that satisfies the approved formula', async () => {
      const id = await insertClosing(client);
      const stored = await client.query(
        'SELECT difference::text AS difference, balanced FROM daily_closings WHERE id = $1',
        [id],
      );
      expect(stored.rows[0]?.difference).toBe('0.00');
      expect(stored.rows[0]?.balanced).toBe(true);
    });

    it('accepts an unbalanced closing outside the recorded tolerance', async () => {
      const id = await insertClosing(client, {
        balanced: false,
        difference: '-0.60',
        systemSales: '100.60',
      });
      expect(id).toBeTruthy();
    });

    it('rejects a difference that is not the approved formula', async () => {
      await expectRejection(
        () => insertClosing(client, { balanced: false, difference: '99.00' }),
        'daily_closings_difference_formula',
      );
    });

    it('rejects a balanced flag that contradicts the tolerance', async () => {
      await expectRejection(
        () => insertClosing(client, { balanced: false }),
        'daily_closings_balanced_matches_tolerance',
      );
    });

    it('rejects negative money and tolerance', async () => {
      await expectRejection(
        () =>
          insertClosing(client, {
            balanced: false,
            difference: '-100.00',
            realCash: '-60.00',
            realDigital: '40.00',
            systemSales: '80.00',
          }),
        'daily_closings_money_nonnegative',
      );
    });

    it('creates a closing already closed, never reopened', async () => {
      await expectRejection(
        () => insertClosing(client, { status: 'REOPENED' }),
        'daily_closings_initial_status',
      );
    });

    it('allows a single closing per business date', async () => {
      const businessDate = nextBusinessDate();
      await insertClosing(client, { businessDate });
      await expect(
        insertClosing(client, { businessDate }),
      ).rejects.toMatchObject({
        constraint: 'daily_closings_business_date_key',
      });
    });

    it('keeps the recorded figures immutable', async () => {
      const id = await insertClosing(client);
      await expectRejection(
        () =>
          client.query(
            'UPDATE daily_closings SET real_cash = 999 WHERE id = $1',
            [id],
          ),
        'daily_closings_immutable_figures',
      );
      await expect(
        client.query('DELETE FROM daily_closings WHERE id = $1', [id]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('refuses to reopen without its reopening document', async () => {
      const id = await insertClosing(client);
      await expectRejection(
        () =>
          client.query(
            "UPDATE daily_closings SET status = 'REOPENED' WHERE id = $1",
            [id],
          ),
        'daily_closings_reopening_required',
      );
    });

    it('reopens once the document exists and preserves its history', async () => {
      const [id, actorId] = await Promise.all([
        insertClosing(client),
        insertActor(client),
      ]);
      await client.query(
        [
          'INSERT INTO daily_closing_reopenings',
          '(id, closing_id, reason, reopened_by_user_id, reopened_at)',
          'VALUES ($1, $2, $3, $4, now())',
        ].join(' '),
        [randomUUID(), id, 'Conteo corregido', actorId],
      );
      await client.query(
        "UPDATE daily_closings SET status = 'REOPENED' WHERE id = $1",
        [id],
      );
      const stored = await client.query(
        'SELECT status FROM daily_closings WHERE id = $1',
        [id],
      );
      expect(stored.rows[0]?.status).toBe('REOPENED');

      // Re-closing is deliberately out of FASE 8A while DEC-025 stays open.
      await expectRejection(
        () =>
          client.query(
            "UPDATE daily_closings SET status = 'CLOSED' WHERE id = $1",
            [id],
          ),
        'daily_closings_status_transition',
      );
    });

    it('requires a non-blank reopening reason and keeps the history immutable', async () => {
      const [id, actorId] = await Promise.all([
        insertClosing(client),
        insertActor(client),
      ]);
      await expectRejection(
        () =>
          client.query(
            [
              'INSERT INTO daily_closing_reopenings',
              '(id, closing_id, reason, reopened_by_user_id, reopened_at)',
              'VALUES ($1, $2, $3, $4, now())',
            ].join(' '),
            [randomUUID(), id, '   ', actorId],
          ),
        'daily_closing_reopenings_reason_not_blank',
      );

      const reopeningId = randomUUID();
      await client.query(
        [
          'INSERT INTO daily_closing_reopenings',
          '(id, closing_id, reason, reopened_by_user_id, reopened_at)',
          'VALUES ($1, $2, $3, $4, now())',
        ].join(' '),
        [reopeningId, id, 'Motivo válido', actorId],
      );
      await expect(
        client.query('DELETE FROM daily_closing_reopenings WHERE id = $1', [
          reopeningId,
        ]),
      ).rejects.toMatchObject({ code: '55000' });
    });
  });
});
