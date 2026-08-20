import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const pool = new Pool({ connectionString: databaseUrl });

type Fixture = {
  actorId: string;
  fromWarehouseId: string;
  itemId: string;
  productId: string;
  quantity: string;
  toWarehouseId: string;
  transferId: string;
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
      "VALUES ($1, $2, 'Transfer fixture', 'ACTIVE', now(), now())",
    ].join(' '),
    [id, `transfer_${id.replaceAll('-', '')}`],
  );
  return id;
}

async function insertWarehouse(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO warehouses (id, code, name, updated_at)',
      "VALUES ($1, $2, 'Transfer fixture', now())",
    ].join(' '),
    [id, `TRANSFER_${id.replaceAll('-', '').toUpperCase()}`],
  );
  return id;
}

async function insertProduct(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO products (id, code, name, updated_at)',
      "VALUES ($1, $2, 'Transfer fixture', now())",
    ].join(' '),
    [id, `TRANSFER_${id.replaceAll('-', '').toUpperCase()}`],
  );
  return id;
}

async function insertFixtureBase(client: PoolClient): Promise<Fixture> {
  const actorId = await insertActor(client);
  const fromWarehouseId = await insertWarehouse(client);
  const toWarehouseId = await insertWarehouse(client);
  const productId = await insertProduct(client);
  const transferId = randomUUID();
  const itemId = randomUUID();
  const quantity = '2.5000';
  await client.query(
    [
      'INSERT INTO inventory_transfers',
      '(id, from_warehouse_id, to_warehouse_id, actor_user_id, reason,',
      'occurred_at, idempotency_key_hash, request_hash)',
      "VALUES ($1, $2, $3, $4, 'Synthetic transfer', now(), $5, $6)",
    ].join(' '),
    [transferId, fromWarehouseId, toWarehouseId, actorId, digest(), digest()],
  );
  await client.query(
    [
      'INSERT INTO inventory_transfer_items',
      '(id, transfer_id, product_id, quantity)',
      'VALUES ($1, $2, $3, $4)',
    ].join(' '),
    [itemId, transferId, productId, quantity],
  );
  return {
    actorId,
    fromWarehouseId,
    itemId,
    productId,
    quantity,
    toWarehouseId,
    transferId,
  };
}

async function insertMovement(
  client: PoolClient,
  fixture: Fixture,
  side: 'TRANSFER_IN' | 'TRANSFER_OUT',
  overrides: Partial<{
    actorId: string;
    productId: string;
    quantityDelta: string;
    warehouseId: string;
  }> = {},
): Promise<string> {
  const movementId = randomUUID();
  const isOut = side === 'TRANSFER_OUT';
  const quantityDelta =
    overrides.quantityDelta ??
    (isOut ? `-${fixture.quantity}` : fixture.quantity);
  const balanceBefore = isOut ? '10.0000' : '1.0000';
  const balanceAfter = isOut ? '7.5000' : '3.5000';
  await client.query(
    [
      'INSERT INTO inventory_movements',
      '(id, product_id, warehouse_id, type, quantity_delta, balance_before,',
      'balance_after, occurred_at, actor_user_id, transfer_item_id)',
      'VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9)',
    ].join(' '),
    [
      movementId,
      overrides.productId ?? fixture.productId,
      overrides.warehouseId ??
        (isOut ? fixture.fromWarehouseId : fixture.toWarehouseId),
      side,
      quantityDelta,
      balanceBefore,
      overrides.quantityDelta
        ? (Number(balanceBefore) + Number(quantityDelta)).toFixed(4)
        : balanceAfter,
      overrides.actorId ?? fixture.actorId,
      fixture.itemId,
    ],
  );
  return movementId;
}

async function insertCompleteLedger(
  client: PoolClient,
  fixture: Fixture,
): Promise<void> {
  await insertMovement(client, fixture, 'TRANSFER_OUT');
  await insertMovement(client, fixture, 'TRANSFER_IN');
}

async function expectDeferredConstraintFailure(
  setup: (client: PoolClient) => Promise<void>,
  constraint: string,
): Promise<void> {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    await setup(client);
    await expect(
      client.query('SET CONSTRAINTS ALL IMMEDIATE'),
    ).rejects.toMatchObject({ constraint });
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function withRollback(
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

describe.sequential('FASE 6A inventory transfer persistence', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('uses restrictive foreign keys for the transfer aggregate', async () => {
    const result = await pool.query<{ conname: string; confdeltype: string }>(
      [
        'SELECT conname, confdeltype::text',
        'FROM pg_constraint',
        "WHERE contype = 'f' AND conrelid IN (",
        "'inventory_transfers'::regclass,",
        "'inventory_transfer_items'::regclass,",
        "'inventory_movements'::regclass)",
        "AND conname LIKE '%transfer%'",
        'ORDER BY conname',
      ].join(' '),
    );
    expect(result.rows.map(({ conname }) => conname)).toEqual([
      'inventory_movements_transfer_item_id_fkey',
      'inventory_transfer_items_product_id_fkey',
      'inventory_transfer_items_transfer_id_fkey',
      'inventory_transfers_actor_user_id_fkey',
      'inventory_transfers_from_warehouse_id_fkey',
      'inventory_transfers_to_warehouse_id_fkey',
    ]);
    expect(new Set(result.rows.map(({ confdeltype }) => confdeltype))).toEqual(
      new Set(['r']),
    );
  });

  it('rejects equal warehouses and non-positive quantities', async () => {
    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      const warehouseId = await insertWarehouse(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_transfers',
            '(id, from_warehouse_id, to_warehouse_id, actor_user_id, reason,',
            'occurred_at, idempotency_key_hash, request_hash)',
            "VALUES ($1, $2, $2, $3, 'Invalid', now(), $4, $5)",
          ].join(' '),
          [randomUUID(), warehouseId, actorId, digest(), digest()],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_transfers_distinct_warehouses',
      });
    });

    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_transfer_items',
            '(id, transfer_id, product_id, quantity)',
            'VALUES ($1, $2, $3, 0)',
          ].join(' '),
          [randomUUID(), fixture.transferId, await insertProduct(client)],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_transfer_items_quantity_positive',
      });
    });
  });

  it('keeps one item per product in a transfer', async () => {
    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_transfer_items',
            '(id, transfer_id, product_id, quantity)',
            'VALUES ($1, $2, $3, 1)',
          ].join(' '),
          [randomUUID(), fixture.transferId, fixture.productId],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_transfer_items_transfer_product_key',
      });
    });
  });

  it('requires transfer references and correct signs without changing ADJUSTMENT semantics', async () => {
    await withRollback(async (client) => {
      const productId = await insertProduct(client);
      const warehouseId = await insertWarehouse(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_movements',
            '(id, product_id, warehouse_id, type, quantity_delta,',
            'balance_before, balance_after, occurred_at)',
            "VALUES ($1, $2, $3, 'TRANSFER_OUT', -1, 2, 1, now())",
          ].join(' '),
          [randomUUID(), productId, warehouseId],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_transfer_item_type',
      });
    });

    await withRollback(async (client) => {
      const productId = await insertProduct(client);
      const warehouseId = await insertWarehouse(client);
      await client.query(
        [
          'INSERT INTO inventory_movements',
          '(id, product_id, warehouse_id, type, quantity_delta,',
          'balance_before, balance_after, occurred_at)',
          "VALUES ($1, $2, $3, 'ADJUSTMENT', 1, 0, 1, now())",
        ].join(' '),
        [randomUUID(), productId, warehouseId],
      );
    });

    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await expect(
        insertMovement(client, fixture, 'TRANSFER_OUT', {
          quantityDelta: fixture.quantity,
        }),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_transfer_out_negative',
      });
    });

    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await expect(
        insertMovement(client, fixture, 'TRANSFER_IN', {
          quantityDelta: `-${fixture.quantity}`,
        }),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_transfer_in_positive',
      });
    });
  });

  it.each(['TRANSFER_OUT', 'TRANSFER_IN'] as const)(
    'rejects an item committed with only %s',
    async (side) => {
      await expectDeferredConstraintFailure(async (client) => {
        const fixture = await insertFixtureBase(client);
        await insertMovement(client, fixture, side);
      }, 'inventory_transfer_item_complete_ledger');
    },
  );

  it('accepts exactly one coherent OUT and IN pair', async () => {
    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await insertCompleteLedger(client, fixture);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const result = await client.query<{ count: string }>(
        [
          'SELECT count(*)::text AS count FROM inventory_movements',
          'WHERE transfer_item_id = $1',
        ].join(' '),
        [fixture.itemId],
      );
      expect(result.rows[0]?.count).toBe('2');
    });
  });

  it('allows at most one movement per transfer side', async () => {
    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await insertMovement(client, fixture, 'TRANSFER_OUT');
      await expect(
        insertMovement(client, fixture, 'TRANSFER_OUT'),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_transfer_out_key',
      });
    });
    await withRollback(async (client) => {
      const fixture = await insertFixtureBase(client);
      await insertMovement(client, fixture, 'TRANSFER_IN');
      await expect(
        insertMovement(client, fixture, 'TRANSFER_IN'),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_transfer_in_key',
      });
    });
  });

  it.each([
    ['product', async (client: PoolClient) => insertProduct(client)],
    ['warehouse', async (client: PoolClient) => insertWarehouse(client)],
    ['actor', async (client: PoolClient) => insertActor(client)],
  ] as const)(
    'rejects a transfer pair with a mismatched %s',
    async (field, createMismatch) => {
      await expectDeferredConstraintFailure(async (client) => {
        const fixture = await insertFixtureBase(client);
        const mismatch = await createMismatch(client);
        await insertMovement(client, fixture, 'TRANSFER_OUT', {
          ...(field === 'product' ? { productId: mismatch } : {}),
          ...(field === 'warehouse' ? { warehouseId: mismatch } : {}),
          ...(field === 'actor' ? { actorId: mismatch } : {}),
        });
        await insertMovement(client, fixture, 'TRANSFER_IN');
      }, 'inventory_transfer_item_coherent_ledger');
    },
  );

  it('rejects transfer movements whose magnitude differs from the item', async () => {
    await expectDeferredConstraintFailure(async (client) => {
      const fixture = await insertFixtureBase(client);
      await insertMovement(client, fixture, 'TRANSFER_OUT', {
        quantityDelta: '-1.0000',
      });
      await insertMovement(client, fixture, 'TRANSFER_IN');
    }, 'inventory_transfer_item_coherent_ledger');
  });

  it('makes transfer documents and items immutable', async () => {
    const operations = [
      async (client: PoolClient, fixture: Fixture) =>
        client.query(
          "UPDATE inventory_transfers SET reason = 'Forbidden' WHERE id = $1",
          [fixture.transferId],
        ),
      async (client: PoolClient, fixture: Fixture) =>
        client.query('DELETE FROM inventory_transfers WHERE id = $1', [
          fixture.transferId,
        ]),
      async (client: PoolClient, fixture: Fixture) =>
        client.query(
          'UPDATE inventory_transfer_items SET quantity = 3 WHERE id = $1',
          [fixture.itemId],
        ),
      async (client: PoolClient, fixture: Fixture) =>
        client.query('DELETE FROM inventory_transfer_items WHERE id = $1', [
          fixture.itemId,
        ]),
    ];
    for (const operation of operations) {
      await withRollback(async (client) => {
        const fixture = await insertFixtureBase(client);
        await insertCompleteLedger(client, fixture);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        await expect(operation(client, fixture)).rejects.toMatchObject({
          code: '55000',
        });
      });
    }
  });

  it('scopes idempotency hashes to the actor and stores request hashes', async () => {
    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      const fromWarehouseId = await insertWarehouse(client);
      const toWarehouseId = await insertWarehouse(client);
      const keyHash = digest();
      const requestHash = digest();
      const insert = async (transferId: string, targetActorId: string) =>
        client.query(
          [
            'INSERT INTO inventory_transfers',
            '(id, from_warehouse_id, to_warehouse_id, actor_user_id, reason,',
            'occurred_at, idempotency_key_hash, request_hash)',
            "VALUES ($1, $2, $3, $4, 'Idempotency', now(), $5, $6)",
          ].join(' '),
          [
            transferId,
            fromWarehouseId,
            toWarehouseId,
            targetActorId,
            keyHash,
            requestHash,
          ],
        );
      await insert(randomUUID(), actorId);
      await expect(insert(randomUUID(), actorId)).rejects.toMatchObject({
        constraint: 'inventory_transfers_actor_idempotency_key',
      });
    });
    await withRollback(async (client) => {
      const actorId = await insertActor(client);
      const secondActorId = await insertActor(client);
      const fromWarehouseId = await insertWarehouse(client);
      const toWarehouseId = await insertWarehouse(client);
      const keyHash = digest();
      const requestHash = digest();
      const insert = async (targetActorId: string) =>
        client.query(
          [
            'INSERT INTO inventory_transfers',
            '(id, from_warehouse_id, to_warehouse_id, actor_user_id, reason,',
            'occurred_at, idempotency_key_hash, request_hash)',
            "VALUES ($1, $2, $3, $4, 'Idempotency', now(), $5, $6)",
          ].join(' '),
          [
            randomUUID(),
            fromWarehouseId,
            toWarehouseId,
            targetActorId,
            keyHash,
            requestHash,
          ],
        );
      await insert(actorId);
      await insert(secondActorId);
    });
  });
});
