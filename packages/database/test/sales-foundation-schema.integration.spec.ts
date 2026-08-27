import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const pool = new Pool({ connectionString: databaseUrl });

type SaleFixture = {
  actorId: string;
  itemId: string;
  productId: string;
  quantity: string;
  saleId: string;
  warehouseId: string;
};

function digest(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}

async function insertActor(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO users',
      '(id, login_identifier, display_name, status, activated_at, updated_at)',
      "VALUES ($1, $2, 'Sale fixture', 'ACTIVE', now(), now())",
    ].join(' '),
    [id, `sale_${id.replaceAll('-', '')}`],
  );
  return id;
}

async function insertWarehouse(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO warehouses (id, code, name, updated_at)',
      "VALUES ($1, $2, 'Sale fixture', now())",
    ].join(' '),
    [id, `SALE_${id.replaceAll('-', '').toUpperCase()}`],
  );
  return id;
}

async function insertProduct(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO products (id, code, name, updated_at)',
      "VALUES ($1, $2, 'Sale fixture', now())",
    ].join(' '),
    [id, `SALE_${id.replaceAll('-', '').toUpperCase()}`],
  );
  return id;
}

async function insertOperationalSale(
  client: PoolClient,
  options: {
    completedAt?: Date | null;
    includeItem?: boolean;
    includeSaleMovement?: boolean;
    paymentStatus?: 'PAID' | 'PENDING';
    saleMovementActorId?: string;
    status?: 'COMPLETED' | 'IN_TRANSIT';
  } = {},
): Promise<SaleFixture> {
  const actorId = await insertActor(client);
  const warehouseId = await insertWarehouse(client);
  const productId = await insertProduct(client);
  const saleId = randomUUID();
  const itemId = randomUUID();
  const quantity = '2.5000';
  const status = options.status ?? 'COMPLETED';
  const completedAt =
    options.completedAt === undefined
      ? status === 'COMPLETED'
        ? new Date('2026-08-26T12:00:00.000Z')
        : null
      : options.completedAt;

  await client.query(
    [
      'INSERT INTO sales',
      '(id, origin, business_date, status, payment_status, completed_at,',
      'created_by_user_id, idempotency_key_hash, request_hash, subtotal,',
      'total, updated_at)',
      "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, $2, $3, $4, $5, $6, $7, 25, 25, now())",
    ].join(' '),
    [
      saleId,
      status,
      options.paymentStatus ?? 'PENDING',
      completedAt,
      actorId,
      digest(),
      digest(),
    ],
  );

  if (options.includeItem !== false) {
    await client.query(
      [
        'INSERT INTO sale_items',
        '(id, sale_id, product_id, warehouse_id, quantity,',
        'unit_price_snapshot, unit_cost_snapshot, line_subtotal)',
        'VALUES ($1, $2, $3, $4, $5, 10, 6, 25)',
      ].join(' '),
      [itemId, saleId, productId, warehouseId, quantity],
    );
    if (options.includeSaleMovement !== false) {
      await insertMovement(client, {
        actorId: options.saleMovementActorId ?? actorId,
        itemId,
        productId,
        quantityDelta: `-${quantity}`,
        type: 'SALE',
        warehouseId,
      });
    }
  }

  return { actorId, itemId, productId, quantity, saleId, warehouseId };
}

async function insertMovement(
  client: PoolClient,
  movement: {
    actorId: string;
    itemId: string;
    productId: string;
    quantityDelta: string;
    type: 'SALE' | 'SALE_CANCELLATION';
    warehouseId: string;
  },
): Promise<string> {
  const id = randomUUID();
  const balanceBefore = movement.type === 'SALE' ? '10.0000' : '7.5000';
  const balanceAfter = (
    Number(balanceBefore) + Number(movement.quantityDelta)
  ).toFixed(4);
  await client.query(
    [
      'INSERT INTO inventory_movements',
      '(id, product_id, warehouse_id, type, quantity_delta, balance_before,',
      'balance_after, occurred_at, actor_user_id, sale_item_id)',
      'VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9)',
    ].join(' '),
    [
      id,
      movement.productId,
      movement.warehouseId,
      movement.type,
      movement.quantityDelta,
      balanceBefore,
      balanceAfter,
      movement.actorId,
      movement.itemId,
    ],
  );
  return id;
}

async function insertConfirmation(
  client: PoolClient,
  fixture: SaleFixture,
  confirmedAt: Date,
  keyHash = digest(),
): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO in_transit_confirmations',
      '(id, sale_id, confirmed_by_user_id, confirmed_at,',
      'idempotency_key_hash, request_hash)',
      'VALUES ($1, $2, $3, $4, $5, $6)',
    ].join(' '),
    [id, fixture.saleId, fixture.actorId, confirmedAt, keyHash, digest()],
  );
  return id;
}

async function insertCancellation(
  client: PoolClient,
  fixture: SaleFixture,
  keyHash = digest(),
): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO sale_cancellations',
      '(id, sale_id, reason, cancelled_by_user_id, cancelled_at,',
      'idempotency_key_hash, request_hash)',
      "VALUES ($1, $2, 'Controlled cancellation', $3, now(), $4, $5)",
    ].join(' '),
    [id, fixture.saleId, fixture.actorId, keyHash, digest()],
  );
  return id;
}

async function withRollback(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    await callback(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function expectDeferredConstraintFailure(
  setup: (client: PoolClient) => Promise<void>,
  constraint: string,
): Promise<void> {
  await withRollback(async (client) => {
    await setup(client);
    await expect(
      client.query('SET CONSTRAINTS ALL IMMEDIATE'),
    ).rejects.toMatchObject({ constraint });
  });
}

describe.sequential('PHASE 7A sales persistence foundation', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('defines the origin enum and bounded non-cycling operational number sequence', async () => {
    const enumValues = await pool.query<{ enumlabel: string }>(
      [
        'SELECT enumlabel FROM pg_enum',
        "WHERE enumtypid = 'sale_origin'::regtype",
        'ORDER BY enumsortorder',
      ].join(' '),
    );
    const sequence = await pool.query<{
      cycle: boolean;
      max_value: string;
      min_value: string;
    }>(
      [
        'SELECT min_value::text, max_value::text, cycle',
        'FROM pg_sequences',
        "WHERE schemaname = 'public' AND sequencename = 'operational_sale_number_seq'",
      ].join(' '),
    );
    expect(enumValues.rows.map(({ enumlabel }) => enumlabel)).toEqual([
      'OPERATIONAL',
      'LEGACY_IMPORT',
    ]);
    expect(sequence.rows).toEqual([
      { cycle: false, max_value: '999999999', min_value: '1' },
    ]);

    await withRollback(async (client) => {
      const first = await insertOperationalSale(client);
      const second = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const numbers = await client.query<{ sale_number: string }>(
        'SELECT sale_number FROM sales WHERE id = ANY($1::uuid[]) ORDER BY sale_number',
        [[first.saleId, second.saleId]],
      );
      expect(numbers.rows).toHaveLength(2);
      expect(
        new Set(numbers.rows.map(({ sale_number }) => sale_number)).size,
      ).toBe(2);
      for (const { sale_number: saleNumber } of numbers.rows) {
        expect(saleNumber).toMatch(/^VTA-[0-9]{9}$/);
      }
    });
  });

  it('allocates unique operational numbers across concurrent transactions', async () => {
    const allocate = async (): Promise<string> => {
      const client = await pool.connect();
      await client.query('BEGIN');
      try {
        const fixture = await insertOperationalSale(client);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        const result = await client.query<{ sale_number: string }>(
          'SELECT sale_number FROM sales WHERE id = $1',
          [fixture.saleId],
        );
        return result.rows[0]?.sale_number ?? '';
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    };

    const numbers = await Promise.all(Array.from({ length: 8 }, allocate));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((number) => /^VTA-[0-9]{9}$/.test(number))).toBe(true);
  });

  it('accepts a complete initial COMPLETED aggregate with one coherent SALE movement', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const result = await client.query<{ movement_count: string }>(
        [
          'SELECT count(*)::text AS movement_count FROM inventory_movements',
          "WHERE sale_item_id = $1 AND type = 'SALE'",
        ].join(' '),
        [fixture.itemId],
      );
      expect(result.rows[0]?.movement_count).toBe('1');
    });
  });

  it('rejects operational headers without creator, with legacy status or with initial PAID', async () => {
    await withRollback(async (client) => {
      await expect(
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, completed_at,',
            'idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'COMPLETED', 'PENDING', now(), $2, $3, 0, 0, now())",
          ].join(' '),
          [randomUUID(), digest(), digest()],
        ),
      ).rejects.toMatchObject({
        constraint: 'sales_operational_persisted_shape',
      });
    });

    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      await expect(
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, created_by_user_id,',
            'idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'LEGACY_UNKNOWN', 'PENDING', $2, $3, $4, 0, 0, now())",
          ].join(' '),
          [randomUUID(), actorId, digest(), digest()],
        ),
      ).rejects.toMatchObject({
        constraint: 'sales_operational_initial_state',
      });
    });

    await withRollback(async (client) => {
      await expect(
        insertOperationalSale(client, { paymentStatus: 'PAID' }),
      ).rejects.toMatchObject({
        constraint: 'sales_operational_initial_state',
      });
    });

    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      await expect(
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, created_by_user_id,',
            'idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'CANCELLED', 'PENDING', $2, $3, $4, 0, 0, now())",
          ].join(' '),
          [randomUUID(), actorId, digest(), digest()],
        ),
      ).rejects.toMatchObject({
        constraint: 'sales_operational_initial_state',
      });
    });
  });

  it('confirms pending IN_TRANSIT without another stock decrement or payment change', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      const confirmedAt = new Date('2026-08-26T13:00:00.000Z');
      await insertConfirmation(client, fixture, confirmedAt);
      await client.query(
        "UPDATE sales SET status = 'COMPLETED', completed_at = $2, updated_at = now() WHERE id = $1",
        [fixture.saleId, confirmedAt],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const result = await client.query<{
        payment_status: string;
        sale_movements: string;
      }>(
        [
          'SELECT sale.payment_status,',
          "count(movement.id) FILTER (WHERE movement.type = 'SALE')::text AS sale_movements",
          'FROM sales sale JOIN sale_items item ON item.sale_id = sale.id',
          'LEFT JOIN inventory_movements movement ON movement.sale_item_id = item.id',
          'WHERE sale.id = $1 GROUP BY sale.id',
        ].join(' '),
        [fixture.saleId],
      );
      expect(result.rows[0]).toEqual({
        payment_status: 'PENDING',
        sale_movements: '1',
      });
    });
  });

  it('cancels a pending IN_TRANSIT sale with exactly one coherent restoration', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await insertCancellation(client, fixture);
      await insertMovement(client, {
        actorId: fixture.actorId,
        itemId: fixture.itemId,
        productId: fixture.productId,
        quantityDelta: fixture.quantity,
        type: 'SALE_CANCELLATION',
        warehouseId: fixture.warehouseId,
      });
      await client.query(
        "UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [fixture.saleId],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const result = await client.query<{ cancellation_movements: string }>(
        [
          'SELECT count(*)::text AS cancellation_movements',
          'FROM inventory_movements',
          "WHERE sale_item_id = $1 AND type = 'SALE_CANCELLATION'",
        ].join(' '),
        [fixture.itemId],
      );
      expect(result.rows[0]?.cancellation_movements).toBe('1');
    });
  });

  it('rejects empty, incomplete and incoherent operational aggregates', async () => {
    await expectDeferredConstraintFailure(
      (client) =>
        insertOperationalSale(client, { includeItem: false }).then(
          () => undefined,
        ),
      'sales_operational_requires_item',
    );
    await expectDeferredConstraintFailure(
      (client) =>
        insertOperationalSale(client, { includeSaleMovement: false }).then(
          () => undefined,
        ),
      'sale_item_operational_sale_ledger',
    );
    await expectDeferredConstraintFailure(async (client) => {
      const otherActorId = await insertActor(client);
      await insertOperationalSale(client, {
        saleMovementActorId: otherActorId,
      });
    }, 'sale_item_operational_sale_ledger');
  });

  it('rejects cancellation without its exact document and restoration movement', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await expect(
        client.query(
          "UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
          [fixture.saleId],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_cancellation_required' });
    });

    await expectDeferredConstraintFailure(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await insertCancellation(client, fixture);
      await client.query(
        "UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [fixture.saleId],
      );
    }, 'sale_item_operational_cancellation_ledger');

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await insertCancellation(client, fixture);
      const movement = {
        actorId: fixture.actorId,
        itemId: fixture.itemId,
        productId: fixture.productId,
        quantityDelta: fixture.quantity,
        type: 'SALE_CANCELLATION' as const,
        warehouseId: fixture.warehouseId,
      };
      await insertMovement(client, movement);
      await expect(insertMovement(client, movement)).rejects.toMatchObject({
        constraint: 'inventory_movements_sale_item_cancellation_key',
      });
    });
  });

  it('rejects terminal and undocumented lifecycle transitions', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query(
          "UPDATE sales SET status = 'IN_TRANSIT', completed_at = NULL, updated_at = now() WHERE id = $1",
          [fixture.saleId],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_fulfillment_transition' });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await expect(
        client.query(
          "UPDATE sales SET payment_status = 'PAID', updated_at = now() WHERE id = $1",
          [fixture.saleId],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_payment_transition' });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await expect(
        client.query(
          "UPDATE sales SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE id = $1",
          [fixture.saleId],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_confirmation_required' });
    });
  });

  it('enforces uniqueness of SALE sides and actor-scoped idempotency hashes', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await expect(
        insertMovement(client, {
          actorId: fixture.actorId,
          itemId: fixture.itemId,
          productId: fixture.productId,
          quantityDelta: `-${fixture.quantity}`,
          type: 'SALE',
          warehouseId: fixture.warehouseId,
        }),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_sale_item_sale_key',
      });
    });

    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      const keyHash = digest();
      const insertSaleHeader = (id: string) =>
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, completed_at,',
            'created_by_user_id, idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'COMPLETED', 'PENDING', now(), $2, $3, $4, 0, 0, now())",
          ].join(' '),
          [id, actorId, keyHash, digest()],
        );
      await insertSaleHeader(randomUUID());
      await expect(insertSaleHeader(randomUUID())).rejects.toMatchObject({
        constraint: 'sales_creator_idempotency_key',
      });
    });

    const indexes = await pool.query<{ indexname: string }>(
      [
        'SELECT indexname FROM pg_indexes',
        "WHERE schemaname = 'public' AND indexname = ANY($1::text[])",
        'ORDER BY indexname',
      ].join(' '),
      [
        [
          'in_transit_confirmations_actor_idempotency_key',
          'sale_cancellations_actor_idempotency_key',
          'sales_creator_idempotency_key',
        ],
      ],
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      'in_transit_confirmations_actor_idempotency_key',
      'sale_cancellations_actor_idempotency_key',
      'sales_creator_idempotency_key',
    ]);

    await withRollback(async (client) => {
      const first = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      const second = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      const keyHash = digest();
      const confirmedAt = new Date('2026-08-26T15:00:00.000Z');
      await insertConfirmation(client, first, confirmedAt, keyHash);
      await expect(
        client.query(
          [
            'INSERT INTO in_transit_confirmations',
            '(id, sale_id, confirmed_by_user_id, confirmed_at,',
            'idempotency_key_hash, request_hash)',
            'VALUES ($1, $2, $3, $4, $5, $6)',
          ].join(' '),
          [
            randomUUID(),
            second.saleId,
            first.actorId,
            confirmedAt,
            keyHash,
            digest(),
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'in_transit_confirmations_actor_idempotency_key',
      });
    });
  });

  it('rejects operational null snapshots, negative money and malformed hashes', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await expect(
        client.query(
          [
            'INSERT INTO sale_items',
            '(id, sale_id, product_id, warehouse_id, quantity, line_subtotal)',
            'VALUES ($1, $2, $3, $4, 1, 1)',
          ].join(' '),
          [
            randomUUID(),
            fixture.saleId,
            fixture.productId,
            fixture.warehouseId,
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'sale_items_operational_snapshots_required',
      });
    });

    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      await expect(
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, completed_at,',
            'created_by_user_id, idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'COMPLETED', 'PENDING', now(), $2, $3, $4, -1, 0, now())",
          ].join(' '),
          [randomUUID(), actorId, digest(), digest()],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_money_nonnegative' });
    });

    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      await expect(
        client.query(
          [
            'INSERT INTO sales',
            '(id, origin, business_date, status, payment_status, completed_at,',
            'created_by_user_id, idempotency_key_hash, request_hash, subtotal, total, updated_at)',
            "VALUES ($1, 'OPERATIONAL', CURRENT_DATE, 'COMPLETED', 'PENDING', now(), $2, $3, $4, 0, 0, now())",
          ].join(' '),
          [randomUUID(), actorId, 'A'.repeat(64), digest()],
        ),
      ).rejects.toMatchObject({
        constraint: 'sales_idempotency_hash_format',
      });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      await expect(
        client.query(
          [
            'INSERT INTO in_transit_confirmations',
            '(id, sale_id, confirmed_by_user_id, confirmed_at)',
            'VALUES ($1, $2, $3, now())',
          ].join(' '),
          [randomUUID(), fixture.saleId, fixture.actorId],
        ),
      ).rejects.toMatchObject({
        constraint: 'sale_actions_operational_hashes_required',
      });
    });
  });

  it('keeps legacy imports explicit while allowing nullable snapshots and hashes', async () => {
    await withRollback(async (client) => {
      const saleId = randomUUID();
      const productId = await insertProduct(client);
      const warehouseId = await insertWarehouse(client);
      await client.query(
        [
          'INSERT INTO sales',
          '(id, origin, sale_number, business_date, status, subtotal, total, updated_at)',
          "VALUES ($1, 'LEGACY_IMPORT', $2, CURRENT_DATE, 'LEGACY_UNKNOWN', 0, 0, now())",
        ].join(' '),
        [saleId, `LEGACY-${randomUUID()}`.toUpperCase()],
      );
      await client.query(
        [
          'INSERT INTO sale_items',
          '(id, sale_id, product_id, warehouse_id, quantity, line_subtotal)',
          'VALUES ($1, $2, $3, $4, 1, 0)',
        ].join(' '),
        [randomUUID(), saleId, productId, warehouseId],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
  });

  it('makes sale documents, items and actions immutable while allowing only approved lifecycle updates', async () => {
    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query(
          'UPDATE sales SET total = 30, updated_at = now() WHERE id = $1',
          [fixture.saleId],
        ),
      ).rejects.toMatchObject({ constraint: 'sales_stable_fields_immutable' });
    });

    for (const update of [
      "origin = 'LEGACY_IMPORT'",
      "sale_number = 'VTA-999999999'",
    ]) {
      await withRollback(async (client) => {
        const fixture = await insertOperationalSale(client);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        await expect(
          client.query(
            `UPDATE sales SET ${update}, updated_at = now() WHERE id = $1`,
            [fixture.saleId],
          ),
        ).rejects.toMatchObject({
          constraint: 'sales_stable_fields_immutable',
        });
      });
    }

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query('DELETE FROM sale_items WHERE id = $1', [fixture.itemId]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query('DELETE FROM sales WHERE id = $1', [fixture.saleId]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      const confirmedAt = new Date('2026-08-26T14:00:00.000Z');
      const confirmationId = await insertConfirmation(
        client,
        fixture,
        confirmedAt,
      );
      await client.query(
        "UPDATE sales SET status = 'COMPLETED', completed_at = $2, updated_at = now() WHERE id = $1",
        [fixture.saleId, confirmedAt],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query(
          'UPDATE in_transit_confirmations SET confirmed_at = now() WHERE id = $1',
          [confirmationId],
        ),
      ).rejects.toMatchObject({ code: '55000' });
    });

    await withRollback(async (client) => {
      const fixture = await insertOperationalSale(client, {
        status: 'IN_TRANSIT',
      });
      const cancellationId = await insertCancellation(client, fixture);
      await insertMovement(client, {
        actorId: fixture.actorId,
        itemId: fixture.itemId,
        productId: fixture.productId,
        quantityDelta: fixture.quantity,
        type: 'SALE_CANCELLATION',
        warehouseId: fixture.warehouseId,
      });
      await client.query(
        "UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [fixture.saleId],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(
        client.query(
          "UPDATE sale_cancellations SET reason = 'Forbidden' WHERE id = $1",
          [cancellationId],
        ),
      ).rejects.toMatchObject({ code: '55000' });
    });
  });
});
