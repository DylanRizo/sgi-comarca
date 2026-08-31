import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionService } from '../src/auth/application/session.service.js';
import { createApplication } from '../src/bootstrap.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);
const host = 'localhost:3001';
const origin = 'http://localhost:3000';

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

describe('FASE 9B.3 analytics', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app!: Awaited<ReturnType<typeof createApplication>>;
  let databaseName: string;
  let analystId: string;
  let financeAnalystId: string;
  let warehouseId: string;
  let costedProductId: string;
  let uncostedProductId: string;
  let sellerId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function grant(userId: string, code: string): Promise<void> {
    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code },
    });
    await client.userPermission.create({
      data: { effect: 'GRANT', permissionId: permission.id, userId },
    });
  }

  async function newUser(loginIdentifier: string): Promise<string> {
    const user = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: `Synthetic ${loginIdentifier}`,
        loginIdentifier,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return user.id;
  }

  async function cookie(userId: string): Promise<string> {
    const secret = await app.get(SessionService).create(userId);
    return `sgi_session=${secret.revealOnce()}`;
  }

  function get(path: string, session: string): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', session);
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase9b3_' +
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
    await runBootstrap(client);

    app = await createApplication();
    await app.init();

    const warehouse = await client.warehouse.findFirstOrThrow({
      select: { id: true },
      where: { active: true },
    });
    warehouseId = warehouse.id;

    const costed = await client.product.create({
      data: { active: true, code: 'ANL-001', name: 'Producto con costo' },
      select: { id: true },
    });
    costedProductId = costed.id;

    const uncosted = await client.product.create({
      data: { active: true, code: 'ANL-002', name: 'Producto sin costo' },
      select: { id: true },
    });
    uncostedProductId = uncosted.id;

    // One trustworthy balance and one flagged for cost review, so valuation
    // coverage has something real to exclude.
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        productId: costedProductId,
        quantity: '10.0000',
        warehouseId,
      },
    });
    await client.inventoryBalance.create({
      data: {
        costReviewRequired: true,
        currentUnitCost: '0.00',
        productId: uncostedProductId,
        quantity: '0.0000',
        warehouseId,
      },
    });

    sellerId = await newUser('phase9b3-seller');

    // One completed sale with two lines: one costed, one with a zero cost that
    // DEC-015 treats as a review flag rather than as free stock. FASE 7A
    // requires an operational sale to start with PENDING payment and to carry
    // exactly one coherent SALE movement per line, so both are created here in
    // one transaction rather than poked in afterwards.
    await client.$transaction(async (transaction) => {
      const sale = await transaction.sale.create({
        data: {
          businessDate: new Date('2026-09-03T00:00:00.000Z'),
          completedAt: new Date('2026-09-03T12:00:00.000Z'),
          createdByUserId: sellerId,
          currencyCode: 'NIO',
          idempotencyKeyHash: 'a'.repeat(64),
          items: {
            create: [
              {
                lineSubtotal: '100.00',
                productId: costedProductId,
                quantity: '10.0000',
                unitCostSnapshot: '4.00',
                unitPriceSnapshot: '10.00',
                warehouseId,
              },
              {
                lineSubtotal: '50.00',
                productId: uncostedProductId,
                quantity: '5.0000',
                unitCostSnapshot: '0.00',
                unitPriceSnapshot: '10.00',
                warehouseId,
              },
            ],
          },
          origin: 'OPERATIONAL',
          paymentStatus: 'PENDING',
          requestHash: 'b'.repeat(64),
          sellerUserId: sellerId,
          shippingAmount: '0.00',
          status: 'COMPLETED',
          subtotal: '150.00',
          total: '150.00',
        },
        select: {
          id: true,
          items: { select: { id: true, productId: true, quantity: true } },
        },
      });

      for (const item of sale.items) {
        await transaction.inventoryMovement.create({
          data: {
            actorUserId: sellerId,
            balanceAfter: '0.0000',
            balanceBefore: item.quantity,
            occurredAt: new Date('2026-09-03T12:00:00.000Z'),
            productId: item.productId,
            quantityDelta: `-${item.quantity.toFixed(4)}`,
            saleItemId: item.id,
            sourceType: 'SALE',
            type: 'SALE',
            warehouseId,
          },
        });
      }
    });

    analystId = await newUser('phase9b3-analyst');
    await grant(analystId, 'analytics.read');
    await grant(analystId, 'inventory.read');
    await grant(analystId, 'sales.read');

    financeAnalystId = await newUser('phase9b3-finance-analyst');
    await grant(financeAnalystId, 'analytics.read');
    await grant(financeAnalystId, 'inventory.read');
    await grant(financeAnalystId, 'sales.read');
    await grant(financeAnalystId, 'finances.read');
  }, 240_000);

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('refuses an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/inventory')
      .set('Host', host)
      .set('Origin', origin)
      .expect(401);
  });

  it('never lets analytics.read alone widen access to a domain', async () => {
    const bare = await newUser('phase9b3-bare');
    await grant(bare, 'analytics.read');
    const session = await cookie(bare);
    await get('/api/v1/analytics/inventory', session).expect(403);
    await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30',
      session,
    ).expect(403);
  });

  it('reports inventory KPIs without money for an actor lacking finances.read', async () => {
    const response = await get(
      '/api/v1/analytics/inventory',
      await cookie(analystId),
    ).expect(200);
    const data = response.body.data;
    expect(data.distinctProducts).toBe(2);
    expect(data.outOfStockCount).toBe(1);
    expect(data.costReviewCount).toBe(1);
    expect(data.totalValue).toBeNull();
    expect(data.valuationCoverage).toBeNull();
  });

  it('values only the stock whose cost is trustworthy and says so', async () => {
    const response = await get(
      '/api/v1/analytics/inventory',
      await cookie(financeAnalystId),
    ).expect(200);
    const data = response.body.data;
    // 10 * 4.00; the review-flagged balance is excluded, never priced at zero.
    expect(data.totalValue).toBe('40.00');
    expect(data.valuationCoverage).toEqual({
      coveredLines: 1,
      excludedLines: 1,
      ratio: '0.5000',
      totalLines: 2,
    });
  });

  it('reports sales volume without revenue for an actor lacking finances.read', async () => {
    const response = await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30',
      await cookie(analystId),
    ).expect(200);
    const data = response.body.data;
    expect(data.saleCount).toBe(1);
    expect(data.totalRevenue).toBeNull();
    expect(data.grossProfit).toBeNull();
    expect(data.marginRatio).toBeNull();
    expect(data.periods[0].revenue).toBeNull();
    // Volume is not money, so it stays visible. Analytics uses the shared
    // quantity helper, which trims trailing zeros: a dashboard reads better
    // with 15 than 15.0000. Reports pin the scale instead, because a
    // spreadsheet column should not vary its width row by row.
    expect(data.periods[0].unitsSold).toBe('15');
    // Coverage is not money either: it explains the data's quality.
    expect(data.marginCoverage.totalLines).toBe(2);
  });

  it('computes margin only over trustworthy costs and declares its coverage', async () => {
    const response = await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30',
      await cookie(financeAnalystId),
    ).expect(200);
    const data = response.body.data;
    expect(data.totalRevenue).toBe('150.00');
    // Only the costed line enters: 100.00 revenue - 40.00 cost.
    expect(data.cost).toBe('40.00');
    expect(data.grossProfit).toBe('60.00');
    expect(data.marginRatio).toBe('0.6000');
    // The zero-cost line is excluded rather than counted as pure profit, which
    // would have reported 110.00 on 150.00.
    expect(data.marginCoverage).toEqual({
      coveredLines: 1,
      excludedLines: 1,
      ratio: '0.5000',
      totalLines: 2,
    });
  });

  it('buckets by the requested granularity', async () => {
    const session = await cookie(financeAnalystId);
    const weekly = await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30&granularity=week',
      session,
    ).expect(200);
    expect(weekly.body.data.granularity).toBe('week');
    // 2026-09-03 is a Thursday, so its week began on Monday the 31st.
    expect(weekly.body.data.periods[0].period).toBe('2026-08-31');

    const monthly = await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30&granularity=month',
      session,
    ).expect(200);
    expect(monthly.body.data.periods[0].period).toBe('2026-09-01');
  });

  it('ranks top products by units sold', async () => {
    const response = await get(
      '/api/v1/analytics/sales?from=2026-09-01&to=2026-09-30',
      await cookie(financeAnalystId),
    ).expect(200);
    expect(response.body.data.topProducts[0].productCode).toBe('ANL-001');
    expect(response.body.data.topProducts[0].unitsSold).toBe('10');
  });

  it('rejects a range wider than a year instead of scanning it', async () => {
    await get(
      '/api/v1/analytics/sales?from=2020-01-01&to=2026-12-31',
      await cookie(financeAnalystId),
    ).expect(400);
  });

  it('rejects an inverted or malformed range', async () => {
    const session = await cookie(financeAnalystId);
    await get(
      '/api/v1/analytics/sales?from=2026-09-30&to=2026-09-01',
      session,
    ).expect(400);
    await get(
      '/api/v1/analytics/sales?from=30-09-2026&to=2026-09-30',
      session,
    ).expect(400);
  });

  it('never emits a cost snapshot or hash', async () => {
    const session = await cookie(financeAnalystId);
    for (const path of ['inventory', 'sales?from=2026-09-01&to=2026-09-30']) {
      const response = await get(`/api/v1/analytics/${path}`, session).expect(
        200,
      );
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('unitCostSnapshot');
      expect(serialized).not.toContain('idempotencyKeyHash');
      expect(serialized).not.toContain('requestHash');
    }
  });
});
