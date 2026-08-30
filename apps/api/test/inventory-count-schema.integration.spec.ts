import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);

function quoteDatabaseName(databaseName: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)) {
    throw new Error('Unsafe temporary database name.');
  }
  return `"${databaseName}"`;
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(
    new URL('../../../packages/database/', import.meta.url),
  );
  const prismaCli = fileURLToPath(
    new URL(
      '../../../packages/database/node_modules/prisma/build/index.js',
      import.meta.url,
    ),
  );
  const prismaConfig = fileURLToPath(
    new URL('../../../packages/database/prisma.config.ts', import.meta.url),
  );
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', prismaConfig],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

/**
 * The database is the last line of defence for FASE 9A: no service exists yet,
 * so every rule below is asserted directly against PostgreSQL. Prisma wraps raw
 * failures, so the assertion matches the message rather than a driver code.
 */
async function expectRejection(
  operation: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  await expect(operation()).rejects.toThrow(new RegExp(fragment, 'u'));
}

describe('FASE 9A inventory count schema integrity', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let databaseName: string;
  let actorId: string;
  let productId: string;
  let secondProductId: string;
  let scopedWarehouseId: string;
  let unscopedWarehouseId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function createOpenSession(reason = 'conteo mensual'): Promise<string> {
    const sessionId = randomUUID();
    await client.$executeRaw`
      INSERT INTO inventory_count_sessions
        (id, status, business_date, reason, created_by_user_id, created_at, updated_at)
      VALUES
        (${sessionId}::uuid, 'OPEN'::inventory_count_session_status, DATE '2026-09-01',
         ${reason}, ${actorId}::uuid, now(), now())`;
    await client.$executeRaw`
      INSERT INTO inventory_count_session_warehouses (id, session_id, warehouse_id)
      VALUES (${randomUUID()}::uuid, ${sessionId}::uuid, ${scopedWarehouseId}::uuid)`;
    return sessionId;
  }

  async function addLine(
    sessionId: string,
    expected: string,
    counted: string,
    difference: string,
    warehouseId = scopedWarehouseId,
    lineProductId = productId,
  ): Promise<string> {
    const lineId = randomUUID();
    await client.$executeRaw`
      INSERT INTO inventory_count_lines
        (id, session_id, product_id, warehouse_id, expected_quantity,
         counted_quantity, difference, counted_at, created_at, updated_at)
      VALUES
        (${lineId}::uuid, ${sessionId}::uuid, ${lineProductId}::uuid, ${warehouseId}::uuid,
         ${expected}::decimal, ${counted}::decimal, ${difference}::decimal,
         now(), now(), now())`;
    return lineId;
  }

  async function sessionStatus(sessionId: string): Promise<string> {
    const rows = await client.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM inventory_count_sessions
      WHERE id = ${sessionId}::uuid`;
    const row = rows[0];
    if (!row) {
      throw new Error('Expected the inventory count session to exist.');
    }
    return row.status;
  }

  async function linkedAdjustmentCount(sessionId: string): Promise<number> {
    const rows = await client.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM inventory_count_lines
      WHERE session_id = ${sessionId}::uuid AND adjustment_movement_id IS NOT NULL`;
    const row = rows[0];
    if (!row) {
      throw new Error('Expected a count aggregate row.');
    }
    return Number(row.count);
  }

  async function submit(sessionId: string): Promise<void> {
    await client.$executeRaw`
      UPDATE inventory_count_sessions
      SET status = 'PENDING_APPROVAL'::inventory_count_session_status,
          submitted_at = now()
      WHERE id = ${sessionId}::uuid`;
  }

  async function approve(sessionId: string): Promise<void> {
    await client.$executeRaw`
      UPDATE inventory_count_sessions
      SET status = 'APPROVED'::inventory_count_session_status,
          approved_by_user_id = ${actorId}::uuid,
          approved_at = now()
      WHERE id = ${sessionId}::uuid`;
  }

  async function createAdjustment(
    delta: string,
    warehouseId = scopedWarehouseId,
    type = 'ADJUSTMENT',
  ): Promise<string> {
    const movementId = randomUUID();
    await client.$executeRawUnsafe(
      `INSERT INTO inventory_movements
         (id, product_id, warehouse_id, type, quantity_delta, balance_before,
          balance_after, occurred_at, actor_user_id, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::inventory_movement_type,
               $5::decimal, 100, 100 + $5::decimal, now(), $6::uuid, now())`,
      movementId,
      productId,
      warehouseId,
      type,
      delta,
      actorId,
    );
    return movementId;
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase9a_' +
      process.pid.toString() +
      '_' +
      randomUUID().replaceAll('-', '').slice(0, 12);
    const administratorUrl = new URL(source);
    administratorUrl.pathname = '/postgres';
    administratorUrl.searchParams.delete('schema');
    const isolatedUrl = new URL(source);
    isolatedUrl.pathname = `/${databaseName}`;
    isolatedUrl.searchParams.set('schema', 'public');

    administrator = createDatabaseClient(administratorUrl.toString());
    await administrator.$executeRawUnsafe(
      `CREATE DATABASE ${quoteDatabaseName(databaseName)}`,
    );
    await migrateDatabase(isolatedUrl.toString());
    process.env.DATABASE_URL = isolatedUrl.toString();
    client = createDatabaseClient(isolatedUrl.toString());

    const actor = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic count operator',
        loginIdentifier: 'phase9a-operator',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    actorId = actor.id;

    const [scoped, unscoped, product, secondProduct] = await Promise.all([
      client.warehouse.create({
        data: { active: true, code: 'P9A-IN', name: 'Phase 9A scoped' },
        select: { id: true },
      }),
      client.warehouse.create({
        data: { active: true, code: 'P9A-OUT', name: 'Phase 9A unscoped' },
        select: { id: true },
      }),
      client.product.create({
        data: { active: true, code: 'P9A-P', name: 'Phase 9A product' },
        select: { id: true },
      }),
      client.product.create({
        data: { active: true, code: 'P9A-P2', name: 'Phase 9A second product' },
        select: { id: true },
      }),
    ]);
    scopedWarehouseId = scoped.id;
    unscopedWarehouseId = unscoped.id;
    productId = product.id;
    secondProductId = secondProduct.id;
  }, 180_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (administrator) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('creates a session open and refuses one born approved', async () => {
    await expectRejection(
      () =>
        client.$executeRaw`
          INSERT INTO inventory_count_sessions
            (id, status, business_date, reason, created_by_user_id,
             submitted_at, approved_by_user_id, approved_at, created_at, updated_at)
          VALUES
            (${randomUUID()}::uuid, 'APPROVED'::inventory_count_session_status,
             DATE '2026-09-01', 'motivo', ${actorId}::uuid, now(),
             ${actorId}::uuid, now(), now(), now())`,
      'created open',
    );
  });

  it('refuses a blank reason', async () => {
    await expectRejection(
      () => createOpenSession('   '),
      'inventory_count_sessions_reason_not_blank',
    );
  });

  it('refuses a line whose warehouse is outside the declared scope', async () => {
    const sessionId = await createOpenSession();

    await expectRejection(
      () => addLine(sessionId, '10', '8', '-2', unscopedWarehouseId),
      'outside the session scope',
    );
  });

  it('enforces difference as counted minus expected', async () => {
    const sessionId = await createOpenSession();

    await expectRejection(
      () => addLine(sessionId, '10', '8', '-5'),
      'inventory_count_lines_difference_formula',
    );
  });

  it('refuses a negative counted quantity', async () => {
    const sessionId = await createOpenSession();

    await expectRejection(
      () => addLine(sessionId, '10', '-1', '-11'),
      'inventory_count_lines_quantities_nonnegative',
    );
  });

  it('refuses jumping from open straight to approved', async () => {
    const sessionId = await createOpenSession();
    await addLine(sessionId, '10', '10', '0');

    await expectRejection(
      () => approve(sessionId),
      'invalid inventory count session status transition',
    );
  });

  it('refuses capturing a line once the session left open', async () => {
    const sessionId = await createOpenSession();
    await addLine(sessionId, '10', '10', '0');
    await submit(sessionId);

    await expectRejection(
      () => addLine(sessionId, '5', '5', '0'),
      'while the session is open',
    );
  });

  it('refuses approving a session that has no line', async () => {
    const sessionId = await createOpenSession();
    await submit(sessionId);

    await expectRejection(
      () => client.$transaction(async () => approve(sessionId)),
      'requires at least one line',
    );
  });

  it('refuses approving while a non-zero line lacks its adjustment', async () => {
    const sessionId = await createOpenSession();
    await addLine(sessionId, '10', '8', '-2');
    await submit(sessionId);

    await expectRejection(
      () => client.$transaction(async () => approve(sessionId)),
      'requires its linked adjustment',
    );

    expect(await sessionStatus(sessionId)).toBe('PENDING_APPROVAL');
  });

  it('refuses linking a movement that is not an adjustment', async () => {
    const sessionId = await createOpenSession();
    const lineId = await addLine(sessionId, '10', '8', '-2');
    const movementId = await createAdjustment('-2', scopedWarehouseId, 'SALE');

    await expectRejection(
      () =>
        client.$transaction(
          async () =>
            client.$executeRaw`
              UPDATE inventory_count_lines
              SET adjustment_movement_id = ${movementId}::uuid
              WHERE id = ${lineId}::uuid`,
        ),
      'links an ADJUSTMENT movement',
    );
  });

  it('refuses linking an adjustment from another warehouse', async () => {
    const sessionId = await createOpenSession();
    const lineId = await addLine(sessionId, '10', '8', '-2');
    const movementId = await createAdjustment('-2', unscopedWarehouseId);

    await expectRejection(
      () =>
        client.$transaction(
          async () =>
            client.$executeRaw`
              UPDATE inventory_count_lines
              SET adjustment_movement_id = ${movementId}::uuid
              WHERE id = ${lineId}::uuid`,
        ),
      'match the line product and warehouse',
    );
  });

  it('refuses linking an adjustment whose delta differs from the count', async () => {
    const sessionId = await createOpenSession();
    const lineId = await addLine(sessionId, '10', '8', '-2');
    const movementId = await createAdjustment('-7');

    await expectRejection(
      () =>
        client.$transaction(
          async () =>
            client.$executeRaw`
              UPDATE inventory_count_lines
              SET adjustment_movement_id = ${movementId}::uuid
              WHERE id = ${lineId}::uuid`,
        ),
      'must equal the counted difference',
    );
  });

  it('refuses an adjustment on a line that found no difference', async () => {
    const sessionId = await createOpenSession();
    const lineId = await addLine(sessionId, '10', '10', '0');
    const movementId = await createAdjustment('0');
    await client.$executeRaw`
      UPDATE inventory_count_lines
      SET adjustment_movement_id = ${movementId}::uuid
      WHERE id = ${lineId}::uuid`;
    await submit(sessionId);

    await expectRejection(
      () => client.$transaction(async () => approve(sessionId)),
      'cannot carry an adjustment',
    );
  });

  it('approves a coherent session and links its adjustment exactly once', async () => {
    const sessionId = await createOpenSession();
    const shortLineId = await addLine(sessionId, '10', '8', '-2');
    await addLine(sessionId, '4', '4', '0', scopedWarehouseId, secondProductId);
    const movementId = await createAdjustment('-2');
    await client.$executeRaw`
      UPDATE inventory_count_lines
      SET adjustment_movement_id = ${movementId}::uuid
      WHERE id = ${shortLineId}::uuid`;
    await submit(sessionId);

    await client.$transaction(async () => approve(sessionId));

    expect(await sessionStatus(sessionId)).toBe('APPROVED');
    expect(await linkedAdjustmentCount(sessionId)).toBe(1);
  });

  it('keeps an approved session terminal and undeletable', async () => {
    const sessionId = await createOpenSession();
    await addLine(sessionId, '6', '6', '0');
    await submit(sessionId);
    await client.$transaction(async () => approve(sessionId));

    await expectRejection(
      () =>
        client.$executeRaw`
          UPDATE inventory_count_sessions
          SET status = 'OPEN'::inventory_count_session_status
          WHERE id = ${sessionId}::uuid`,
      'terminal inventory count session cannot change',
    );
    await expectRejection(
      () =>
        client.$executeRaw`
          DELETE FROM inventory_count_sessions WHERE id = ${sessionId}::uuid`,
      'immutable',
    );
  });

  it('requires actor, time and reason to cancel', async () => {
    const sessionId = await createOpenSession();

    await expectRejection(
      () =>
        client.$executeRaw`
          UPDATE inventory_count_sessions
          SET status = 'CANCELLED'::inventory_count_session_status
          WHERE id = ${sessionId}::uuid`,
      'inventory_count_sessions_cancelled_shape',
    );

    await client.$executeRaw`
      UPDATE inventory_count_sessions
      SET status = 'CANCELLED'::inventory_count_session_status,
          cancelled_by_user_id = ${actorId}::uuid,
          cancelled_at = now(),
          cancellation_reason = 'recuento invalido'
      WHERE id = ${sessionId}::uuid`;

    expect(await sessionStatus(sessionId)).toBe('CANCELLED');
  });

  it('never deletes a captured line or rewrites the declared scope', async () => {
    const sessionId = await createOpenSession();
    const lineId = await addLine(sessionId, '3', '3', '0');

    await expectRejection(
      () =>
        client.$executeRaw`
          DELETE FROM inventory_count_lines WHERE id = ${lineId}::uuid`,
      'immutable',
    );
    await expectRejection(
      () =>
        client.$executeRaw`
          UPDATE inventory_count_session_warehouses
          SET warehouse_id = ${unscopedWarehouseId}::uuid
          WHERE session_id = ${sessionId}::uuid`,
      'immutable',
    );
  });

  it('keeps one adjustment movement bound to a single line', async () => {
    const sessionId = await createOpenSession();
    const firstLineId = await addLine(sessionId, '10', '8', '-2');
    const movementId = await createAdjustment('-2');
    await client.$executeRaw`
      UPDATE inventory_count_lines
      SET adjustment_movement_id = ${movementId}::uuid
      WHERE id = ${firstLineId}::uuid`;

    const otherSessionId = await createOpenSession();
    const otherLineId = await addLine(otherSessionId, '10', '8', '-2');

    await expectRejection(
      () =>
        client.$executeRaw`
          UPDATE inventory_count_lines
          SET adjustment_movement_id = ${movementId}::uuid
          WHERE id = ${otherLineId}::uuid`,
      'inventory_count_lines_adjustment_movement_key',
    );
  });
});
