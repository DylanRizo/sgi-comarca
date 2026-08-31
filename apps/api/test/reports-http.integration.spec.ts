import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
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

describe('FASE 9B.2 reports', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let app!: Awaited<ReturnType<typeof createApplication>>;
  let databaseName: string;
  let reporterId: string;
  let inventoryReporterId: string;
  let financeReporterId: string;
  let outsiderId: string;
  let warehouseId: string;
  let productId: string;
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
      'sgi_phase9b2_' +
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

    const product = await client.product.create({
      data: {
        active: true,
        code: 'REP-001',
        name: 'Producto de reporte, con coma',
      },
      select: { id: true },
    });
    productId = product.id;

    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId,
        quantity: '12.5000',
        warehouseId,
      },
    });

    await client.inventoryMovement.create({
      data: {
        balanceAfter: '12.5000',
        balanceBefore: '0.0000',
        occurredAt: new Date('2026-09-01T12:00:00.000Z'),
        productId,
        quantityDelta: '12.5000',
        sourceType: 'MANUAL_ADJUSTMENT',
        type: 'ADJUSTMENT',
        warehouseId,
      },
    });

    reporterId = await newUser('phase9b2-reporter');
    await grant(reporterId, 'reports.read');

    inventoryReporterId = await newUser('phase9b2-inventory-reporter');
    await grant(inventoryReporterId, 'reports.read');
    await grant(inventoryReporterId, 'inventory.read');

    financeReporterId = await newUser('phase9b2-finance-reporter');
    await grant(financeReporterId, 'reports.read');
    await grant(financeReporterId, 'inventory.read');
    await grant(financeReporterId, 'finances.read');
    await grant(financeReporterId, 'sales.read');

    outsiderId = await newUser('phase9b2-outsider');
    await grant(outsiderId, 'inventory.read');
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
      .get('/api/v1/reports/inventory')
      .set('Host', host)
      .set('Origin', origin)
      .expect(401);
  });

  it('refuses an actor without reports.read', async () => {
    await get('/api/v1/reports/inventory', await cookie(outsiderId)).expect(
      403,
    );
  });

  it('never lets reports.read alone widen access to a domain', async () => {
    // Reporting is a capability, not an access grant: the actor holds
    // reports.read but not inventory.read, so the inventory report stays shut.
    const session = await cookie(reporterId);
    await get('/api/v1/reports/inventory', session).expect(403);
    await get('/api/v1/reports/movements', session).expect(403);
    await get('/api/v1/reports/sales', session).expect(403);
    await get('/api/v1/reports/finances', session).expect(403);
  });

  it('returns the inventory report without money for an actor lacking finances.read', async () => {
    const response = await get(
      '/api/v1/reports/inventory',
      await cookie(inventoryReporterId),
    ).expect(200);
    const row = response.body.data.items.find(
      (item: { productCode: string }) => item.productCode === 'REP-001',
    );
    expect(row).toBeDefined();
    expect(row.quantity).toBe('12.5000');
    // The columns exist but stay empty, so a CSV keeps one stable shape.
    expect(row.unitCost).toBeNull();
    expect(row.stockValue).toBeNull();
  });

  it('populates money only for an actor holding finances.read', async () => {
    const response = await get(
      '/api/v1/reports/inventory',
      await cookie(financeReporterId),
    ).expect(200);
    const row = response.body.data.items.find(
      (item: { productCode: string }) => item.productCode === 'REP-001',
    );
    expect(row.unitCost).toBe('4.00');
    // 12.5 * 4.00 computed on exact scaled integers, never in floating point.
    expect(row.stockValue).toBe('50.00');
  });

  it('paginates on the server', async () => {
    const response = await get(
      '/api/v1/reports/inventory?page=1&pageSize=1',
      await cookie(inventoryReporterId),
    ).expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.pagination.pageSize).toBe(1);
  });

  it('rejects an unknown query parameter instead of ignoring it', async () => {
    await get(
      '/api/v1/reports/inventory?unexpected=1',
      await cookie(inventoryReporterId),
    ).expect(400);
  });

  it('rejects a malformed date range', async () => {
    await get(
      '/api/v1/reports/movements?from=01-09-2026',
      await cookie(inventoryReporterId),
    ).expect(400);
  });

  it('filters movements by an inclusive civil date range', async () => {
    const session = await cookie(inventoryReporterId);
    const inside = await get(
      '/api/v1/reports/movements?from=2026-09-01&to=2026-09-01',
      session,
    ).expect(200);
    expect(inside.body.data.pagination.totalItems).toBe(1);

    const before = await get(
      '/api/v1/reports/movements?from=2026-08-01&to=2026-08-31',
      session,
    ).expect(200);
    expect(before.body.data.pagination.totalItems).toBe(0);
  });

  it('exports CSV with a download name and a neutralised separator', async () => {
    const response = await get(
      '/api/v1/reports/inventory?format=csv',
      await cookie(financeReporterId),
    ).expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="sgi-inventario-',
    );
    const [header, ...rows] = response.text.trim().split('\r\n');
    expect(header).toBe(
      'productCode,productName,warehouseCode,warehouseName,quantity,unitCost,stockValue',
    );
    // The product name contains a comma, so it must arrive quoted rather than
    // shifting every later column.
    const line = rows.find((row) => row.startsWith('REP-001,'));
    expect(line).toContain('"Producto de reporte, con coma"');
    expect(line?.endsWith(',4.00,50.00')).toBe(true);
  });

  it('omits money from a CSV export for an actor lacking finances.read', async () => {
    const response = await get(
      '/api/v1/reports/inventory?format=csv',
      await cookie(inventoryReporterId),
    ).expect(200);
    const line = response.text
      .trim()
      .split('\r\n')
      .find((row) => row.startsWith('REP-001,'));
    expect(line?.endsWith(',12.5000,,')).toBe(true);
  });

  it('never emits a cost snapshot, hash, or legacy free text', async () => {
    const session = await cookie(financeReporterId);
    for (const path of ['sales', 'finances', 'movements', 'inventory']) {
      const response = await get(`/api/v1/reports/${path}`, session).expect(
        200,
      );
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('unitCostSnapshot');
      expect(serialized).not.toContain('idempotencyKeyHash');
      expect(serialized).not.toContain('requestHash');
      expect(serialized).not.toContain('deliveryPlace');
      expect(serialized).not.toContain('legacy');
    }
  });
});
