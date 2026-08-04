import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const applicationTables = [
  'audit_logs',
  'import_batches',
  'in_transit_confirmations',
  'inventory_balances',
  'inventory_movements',
  'legacy_records',
  'legacy_sources',
  'login_throttles',
  'password_credentials',
  'permissions',
  'product_warehouse_valuations',
  'products',
  'reconciliation_issues',
  'role_permissions',
  'roles',
  'sale_cancellations',
  'sale_items',
  'sales',
  'sessions',
  'units',
  'user_invitations',
  'user_permissions',
  'user_roles',
  'users',
  'warehouses',
].sort();

const pool = new Pool({
  connectionString: databaseUrl,
});

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

async function insertProduct(
  client: PoolClient,
  codePrefix: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO products (id, code, name, updated_at) VALUES ($1, $2, $3, now())',
    [
      id,
      (codePrefix + '_' + id.replaceAll('-', '').slice(0, 12)).toUpperCase(),
      'Test product',
    ],
  );
  return id;
}

async function insertWarehouse(client: PoolClient): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      'INSERT INTO warehouses (id, code, name, updated_at)',
      'VALUES ($1, $2, $3, now())',
    ].join(' '),
    [
      id,
      ('TEST_' + id.replaceAll('-', '').slice(0, 12)).toUpperCase(),
      'Test warehouse',
    ],
  );
  return id;
}

async function insertSaleFixture(
  client: PoolClient,
  productId: string,
  targetWarehouseId: string,
): Promise<{ saleId: string; saleItemId: string }> {
  const saleId = randomUUID();
  const saleItemId = randomUUID();
  const saleNumber = (
    'TEST_' + saleId.replaceAll('-', '').slice(0, 12)
  ).toUpperCase();
  await client.query(
    [
      'INSERT INTO sales',
      '(id, sale_number, business_date, status, subtotal, total, updated_at)',
      "VALUES ($1, $2, CURRENT_DATE, 'IN_TRANSIT', 10, 10, now())",
    ].join(' '),
    [saleId, saleNumber],
  );
  await client.query(
    [
      'INSERT INTO sale_items',
      '(id, sale_id, product_id, warehouse_id, quantity, line_subtotal)',
      'VALUES ($1, $2, $3, $4, 1, 10)',
    ].join(' '),
    [saleItemId, saleId, productId, targetWarehouseId],
  );
  return { saleId, saleItemId };
}

describe('PostgreSQL structure through FASE 3B', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('has exactly 25 application tables and only the Prisma technical table', async () => {
    const result = await pool.query<{ tablename: string }>(
      [
        'SELECT tablename',
        'FROM pg_catalog.pg_tables',
        "WHERE schemaname = 'public'",
        'ORDER BY tablename',
      ].join(' '),
    );
    const allTables = result.rows.map(({ tablename }) => tablename);
    const technicalTables = allTables.filter((name) => name.startsWith('_'));
    const actualApplicationTables = allTables.filter(
      (name) => !name.startsWith('_'),
    );

    expect(actualApplicationTables).toEqual(applicationTables);
    expect(actualApplicationTables).toHaveLength(25);
    expect(technicalTables).toEqual(['_prisma_migrations']);
  });

  it('has the approved functions and exactly three non-internal triggers', async () => {
    const functions = await pool.query<{ proname: string }>(
      [
        'SELECT p.proname',
        'FROM pg_catalog.pg_proc p',
        'JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace',
        "WHERE n.nspname = 'public'",
        "AND p.proname IN ('enforce_session_lifecycle', 'prevent_immutable_row_change')",
        'ORDER BY p.proname',
      ].join(' '),
    );
    const triggers = await pool.query<{
      table_name: string;
      trigger_name: string;
    }>(
      [
        'SELECT c.relname AS table_name, t.tgname AS trigger_name',
        'FROM pg_catalog.pg_trigger t',
        'JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid',
        'JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace',
        "WHERE n.nspname = 'public' AND NOT t.tgisinternal",
        'ORDER BY trigger_name',
      ].join(' '),
    );

    expect(functions.rows).toEqual([
      { proname: 'enforce_session_lifecycle' },
      { proname: 'prevent_immutable_row_change' },
    ]);
    expect(triggers.rows).toEqual([
      { table_name: 'audit_logs', trigger_name: 'audit_logs_immutable' },
      {
        table_name: 'inventory_movements',
        trigger_name: 'inventory_movements_immutable',
      },
      {
        table_name: 'sessions',
        trigger_name: 'sessions_lifecycle_guard',
      },
    ]);
  });

  it('uses RESTRICT for every foreign key', async () => {
    const result = await pool.query<{ delete_action: string }>(
      [
        'SELECT confdeltype::text AS delete_action',
        'FROM pg_catalog.pg_constraint',
        "WHERE contype = 'f'",
        "AND connamespace = 'public'::regnamespace",
      ].join(' '),
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(
      new Set(result.rows.map(({ delete_action }) => delete_action)),
    ).toEqual(new Set(['r']));
  });

  it('has the approved structural checks', async () => {
    const result = await pool.query<{ conname: string }>(
      [
        'SELECT conname',
        'FROM pg_catalog.pg_constraint',
        "WHERE connamespace = 'public'::regnamespace",
        'AND conname = ANY($1::text[])',
        'ORDER BY conname',
      ].join(' '),
      [
        [
          'inventory_balances_quantity_nonnegative',
          'inventory_movements_balance_equation',
          'sale_items_quantity_positive',
        ],
      ],
    );

    expect(result.rows.map(({ conname }) => conname)).toEqual([
      'inventory_balances_quantity_nonnegative',
      'inventory_movements_balance_equation',
      'sale_items_quantity_positive',
    ]);
  });

  it('has the three active-grant partial unique indexes', async () => {
    const result = await pool.query<{
      indexdef: string;
      indexname: string;
    }>(
      [
        'SELECT indexname, indexdef',
        'FROM pg_catalog.pg_indexes',
        "WHERE schemaname = 'public'",
        'AND indexname = ANY($1::text[])',
        'ORDER BY indexname',
      ].join(' '),
      [
        [
          'role_permissions_active_key',
          'user_permissions_active_key',
          'user_roles_active_key',
        ],
      ],
    );

    expect(result.rows.map(({ indexname }) => indexname)).toEqual([
      'role_permissions_active_key',
      'user_permissions_active_key',
      'user_roles_active_key',
    ]);
    for (const { indexdef } of result.rows) {
      expect(indexdef).toContain('UNIQUE INDEX');
      expect(indexdef).toContain('WHERE (revoked_at IS NULL)');
    }
  });

  it('has the required valuation history indexes without pair uniqueness', async () => {
    const result = await pool.query<{
      indexdef: string;
      indexname: string;
    }>(
      [
        'SELECT indexname, indexdef',
        'FROM pg_catalog.pg_indexes',
        "WHERE schemaname = 'public'",
        "AND tablename = 'product_warehouse_valuations'",
        'ORDER BY indexname',
      ].join(' '),
    );
    const definitions = new Map(
      result.rows.map(({ indexdef, indexname }) => [indexname, indexdef]),
    );

    expect(
      definitions.get('product_warehouse_valuations_history_idx'),
    ).toContain('(product_id, warehouse_id, observed_at DESC)');
    expect(
      definitions.get('product_warehouse_valuations_legacy_record_idx'),
    ).toContain('(legacy_record_id)');
    expect(
      definitions.get('product_warehouse_valuations_review_idx'),
    ).toContain('(requires_human_review)');
    expect(
      [...definitions.values()].some(
        (definition) =>
          definition.includes('UNIQUE') &&
          definition.includes('(product_id, warehouse_id)'),
      ),
    ).toBe(false);
  });

  it('rejects negative inventory balances', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'NEG_BAL');
      const targetWarehouseId = await insertWarehouse(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_balances',
            '(id, product_id, warehouse_id, quantity, updated_at)',
            'VALUES ($1, $2, $3, -0.0001, now())',
          ].join(' '),
          [randomUUID(), productId, targetWarehouseId],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_balances_quantity_nonnegative',
      });
    });
  });

  it('rejects non-positive sale item quantities', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'ZERO_ITEM');
      const targetWarehouseId = await insertWarehouse(client);
      const saleId = randomUUID();
      await client.query(
        [
          'INSERT INTO sales',
          '(id, sale_number, business_date, status, subtotal, total, updated_at)',
          "VALUES ($1, $2, CURRENT_DATE, 'IN_TRANSIT', 0, 0, now())",
        ].join(' '),
        [
          saleId,
          ('TEST_' + saleId.replaceAll('-', '').slice(0, 12)).toUpperCase(),
        ],
      );
      await expect(
        client.query(
          [
            'INSERT INTO sale_items',
            '(id, sale_id, product_id, warehouse_id, quantity, line_subtotal)',
            'VALUES ($1, $2, $3, $4, 0, 0)',
          ].join(' '),
          [randomUUID(), saleId, productId, targetWarehouseId],
        ),
      ).rejects.toMatchObject({
        constraint: 'sale_items_quantity_positive',
      });
    });
  });

  it('rejects inconsistent inventory movement balances', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'BAD_MOV');
      const targetWarehouseId = await insertWarehouse(client);
      await expect(
        client.query(
          [
            'INSERT INTO inventory_movements',
            '(id, product_id, warehouse_id, type, quantity_delta,',
            'balance_before, balance_after, occurred_at)',
            "VALUES ($1, $2, $3, 'ADJUSTMENT', 1, 0, 2, now())",
          ].join(' '),
          [randomUUID(), productId, targetWarehouseId],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_movements_balance_equation',
      });
    });
  });

  it('allows multiple historical valuations for one product and warehouse', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'VALUE_HIST');
      const targetWarehouseId = await insertWarehouse(client);
      await client.query(
        [
          'INSERT INTO product_warehouse_valuations',
          '(id, product_id, warehouse_id, unit_price, unit_cost, observed_at)',
          'VALUES ($1, $2, $3, 100, 50, now()),',
          "($4, $2, $3, 110, 55, now() + interval '1 second')",
        ].join(' '),
        [randomUUID(), productId, targetWarehouseId, randomUUID()],
      );
      const count = await client.query<{ count: string }>(
        [
          'SELECT count(*)::text AS count',
          'FROM product_warehouse_valuations',
          'WHERE product_id = $1 AND warehouse_id = $2',
        ].join(' '),
        [productId, targetWarehouseId],
      );
      expect(count.rows[0]?.count).toBe('2');
    });
  });

  it('rejects UPDATE and DELETE for inventory movements', async () => {
    for (const operation of ['UPDATE', 'DELETE'] as const) {
      await inRollback(async (client) => {
        const productId = await insertProduct(client, 'IMM_MOV');
        const targetWarehouseId = await insertWarehouse(client);
        const movementId = randomUUID();
        await client.query(
          [
            'INSERT INTO inventory_movements',
            '(id, product_id, warehouse_id, type, quantity_delta,',
            'balance_before, balance_after, occurred_at)',
            "VALUES ($1, $2, $3, 'ADJUSTMENT', 1, 0, 1, now())",
          ].join(' '),
          [movementId, productId, targetWarehouseId],
        );
        const sql =
          operation === 'UPDATE'
            ? 'UPDATE inventory_movements SET observation = $2 WHERE id = $1'
            : 'DELETE FROM inventory_movements WHERE id = $1';
        const parameters =
          operation === 'UPDATE' ? [movementId, 'forbidden'] : [movementId];
        await expect(client.query(sql, parameters)).rejects.toMatchObject({
          code: '55000',
        });
      });
    }
  });

  it('rejects UPDATE and DELETE for audit logs', async () => {
    for (const operation of ['UPDATE', 'DELETE'] as const) {
      await inRollback(async (client) => {
        const auditLogId = randomUUID();
        await client.query(
          [
            'INSERT INTO audit_logs (id, action, entity_type)',
            "VALUES ($1, 'TEST', 'TEST')",
          ].join(' '),
          [auditLogId],
        );
        const sql =
          operation === 'UPDATE'
            ? 'UPDATE audit_logs SET action = $2 WHERE id = $1'
            : 'DELETE FROM audit_logs WHERE id = $1';
        const parameters =
          operation === 'UPDATE' ? [auditLogId, 'forbidden'] : [auditLogId];
        await expect(client.query(sql, parameters)).rejects.toMatchObject({
          code: '55000',
        });
      });
    }
  });

  it('keeps one inventory balance per product and warehouse', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'UNIQUE_BAL');
      const targetWarehouseId = await insertWarehouse(client);
      await client.query(
        [
          'INSERT INTO inventory_balances',
          '(id, product_id, warehouse_id, quantity, updated_at)',
          'VALUES ($1, $2, $3, 0, now())',
        ].join(' '),
        [randomUUID(), productId, targetWarehouseId],
      );
      await expect(
        client.query(
          [
            'INSERT INTO inventory_balances',
            '(id, product_id, warehouse_id, quantity, updated_at)',
            'VALUES ($1, $2, $3, 0, now())',
          ].join(' '),
          [randomUUID(), productId, targetWarehouseId],
        ),
      ).rejects.toMatchObject({
        constraint: 'inventory_balances_product_warehouse_key',
      });
    });
  });

  it('keeps the sale fixture helper structurally valid', async () => {
    await inRollback(async (client) => {
      const productId = await insertProduct(client, 'SALE_FIX');
      const targetWarehouseId = await insertWarehouse(client);
      const fixture = await insertSaleFixture(
        client,
        productId,
        targetWarehouseId,
      );
      expect(fixture.saleId).toBeTruthy();
      expect(fixture.saleItemId).toBeTruthy();
    });
  });
});
