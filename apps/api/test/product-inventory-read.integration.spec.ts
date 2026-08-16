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

describe('FASE 5A product and inventory read API', () => {
  let administrator!: DatabaseClient;
  let app!: Awaited<ReturnType<typeof createApplication>>;
  let client!: DatabaseClient;
  let databaseName: string;
  let dylanId: string;
  let productAId: string;
  let productBId: string;
  let productCId: string;
  let unitId: string;
  let warehouseAId: string;
  let warehouseBId: string;

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase5a_' +
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

    const dylan = await client.user.update({
      data: { activatedAt: new Date(), status: 'ACTIVE' },
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    dylanId = dylan.id;
    const unit = await client.unit.create({
      data: { code: 'PHASE5A_UNIT', name: 'Synthetic read unit' },
    });
    unitId = unit.id;
    const warehouseA = await client.warehouse.create({
      data: { code: 'PHASE5A_WA', name: 'Synthetic warehouse A' },
    });
    const warehouseB = await client.warehouse.create({
      data: { code: 'PHASE5A_WB', name: 'Synthetic warehouse B' },
    });
    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;
    const productA = await client.product.create({
      data: {
        code: 'PHASE5A-A',
        description: 'Synthetic multi-warehouse product',
        minimumStock: '2.5',
        name: 'Alpha synthetic product',
        unitId,
      },
    });
    const productB = await client.product.create({
      data: {
        code: 'PHASE5A-B',
        name: 'Beta missing valuation',
        unitId,
      },
    });
    const productC = await client.product.create({
      data: {
        code: 'PHASE5A-C',
        name: 'Gamma zero cost',
        unitId,
      },
    });
    productAId = productA.id;
    productBId = productB.id;
    productCId = productC.id;
    await client.inventoryBalance.createMany({
      data: [
        {
          currentUnitCost: '5.25',
          currentUnitPrice: '10.5',
          productId: productAId,
          quantity: '1.25',
          warehouseId: warehouseAId,
        },
        {
          currentUnitCost: '6',
          currentUnitPrice: '12',
          productId: productAId,
          quantity: '2.75',
          warehouseId: warehouseBId,
        },
        {
          costReviewRequired: true,
          productId: productBId,
          quantity: '4',
          warehouseId: warehouseAId,
        },
        {
          currentUnitCost: '0',
          currentUnitPrice: '15',
          productId: productCId,
          quantity: '0',
          warehouseId: warehouseBId,
        },
      ],
    });
    await client.productWarehouseValuation.createMany({
      data: [
        {
          observedAt: new Date('2026-01-01T00:00:00.000Z'),
          productId: productAId,
          unitCost: '5.25',
          unitPrice: '10.5',
          warehouseId: warehouseAId,
        },
        {
          observedAt: new Date('2026-01-02T00:00:00.000Z'),
          productId: productAId,
          unitCost: '6',
          unitPrice: '12',
          warehouseId: warehouseBId,
        },
        {
          observedAt: new Date('2026-01-03T00:00:00.000Z'),
          productId: productCId,
          unitCost: '0',
          unitPrice: '15',
          warehouseId: warehouseBId,
        },
      ],
    });

    app = await createApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator && databaseName) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
  });

  async function session(userId = dylanId): Promise<string> {
    const token = await app.get(SessionService).create(userId);
    return `sgi_session=${token.revealOnce()}`;
  }

  it('rejects anonymous access and allows Dylan through inventory.read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Host', host)
      .expect(401)
      .expect('Cache-Control', 'no-store');
    const response = await request(app.getHttpServer())
      .get('/api/v1/products?search=PHASE5A')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body.data.pagination.totalItems).toBe(3);
  });

  it('does not accept inventory.adjust as inventory.read', async () => {
    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'inventory.adjust' },
    });
    const user = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Adjust-only synthetic user',
        loginIdentifier: 'phase5a_adjust_only',
        status: 'ACTIVE',
        userPermissions: { create: { permissionId: permission.id } },
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Host', host)
      .set('Cookie', await session(user.id))
      .expect(403);
  });

  it('honors a direct DENY of inventory.read', async () => {
    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'inventory.read' },
    });
    const deny = await client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: dylanId },
    });
    await request(app.getHttpServer())
      .get('/api/v1/units')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(403);
    await client.userPermission.update({
      data: { revokedAt: new Date() },
      where: { id: deny.id },
    });
  });

  it('searches and paginates products with deterministic metadata', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/products?search=PHASE5A&page=1&pageSize=2')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/products?search=PHASE5A&page=2&pageSize=2')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(first.body.data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(
      first.body.data.items.map((item: { code: string }) => item.code),
    ).toEqual(['PHASE5A-A', 'PHASE5A-B']);
    expect(second.body.data.items[0].code).toBe('PHASE5A-C');
  });

  it('returns product detail and 404 for a missing product', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${productAId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(detail.body.data).toMatchObject({
      code: 'PHASE5A-A',
      minimumStock: '2.5',
      unit: { code: 'PHASE5A_UNIT' },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/products/${randomUUID()}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(404);
  });

  it('lists and resolves units and warehouses', async () => {
    const units = await request(app.getHttpServer())
      .get('/api/v1/units?search=PHASE5A')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(units.body.data.items).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/api/v1/units/${unitId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses?search=PHASE5A')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(warehouses.body.data.items).toHaveLength(2);
    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${warehouseAId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
  });

  it('aggregates multi-warehouse stock and valuation history exactly', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/inventory?search=PHASE5A&page=1&pageSize=2')
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(list.body.data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productAId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(response.body.data.totalQuantity).toBe('4');
    expect(response.body.data.balances).toHaveLength(2);
    expect(
      response.body.data.balances.flatMap(
        (balance: { valuations: readonly unknown[] }) => balance.valuations,
      ),
    ).toHaveLength(2);

    const filtered = await request(app.getHttpServer())
      .get(
        `/api/v1/inventory/products/${productAId}?warehouseId=${warehouseAId}`,
      )
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(filtered.body.data.totalQuantity).toBe('1.25');
    expect(filtered.body.data.balances).toHaveLength(1);
  });

  it('preserves zero cost and represents missing valuation as absence', async () => {
    const zeroCost = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productCId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(zeroCost.body.data.balances[0].currentUnitCost).toBe('0');
    expect(zeroCost.body.data.balances[0].valuations[0].unitCost).toBe('0');

    const missing = await request(app.getHttpServer())
      .get(`/api/v1/inventory/products/${productBId}`)
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(missing.body.data.balances[0].valuations).toEqual([]);
    expect(JSON.stringify(missing.body)).not.toContain('observedAt":null');
  });

  it('filters inventory by warehouse and positive availability', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/inventory/warehouses/${warehouseBId}?search=PHASE5A&availableOnly=true`,
      )
      .set('Host', host)
      .set('Cookie', await session())
      .expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].product.code).toBe('PHASE5A-A');
    expect(response.body.data.items[0].balances).toHaveLength(1);
  });

  it('validates query parameters and UUIDs strictly', async () => {
    for (const path of [
      '/api/v1/products?page=0',
      '/api/v1/products?pageSize=101',
      '/api/v1/inventory?availableOnly=unknown',
      '/api/v1/products?unknown=value',
      '/api/v1/products/not-a-uuid',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Host', host)
        .set('Cookie', await session())
        .expect(400);
    }
  });

  it('does not mutate business read models', async () => {
    expect({
      balances: await client.inventoryBalance.count(),
      products: await client.product.count(),
      units: await client.unit.count(),
      valuations: await client.productWarehouseValuation.count(),
      warehouses: await client.warehouse.count(),
    }).toEqual({
      balances: 4,
      products: 3,
      units: 1,
      valuations: 3,
      warehouses: 5,
    });
  });
});
