import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionService } from '../src/auth/application/session.service.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { createApplication } from '../src/bootstrap.js';
import { InventoryAdjustmentService } from '../src/inventory/inventory-adjustment.service.js';
import {
  InventoryAuditService,
  type InventoryTransferAuditInput,
} from '../src/inventory/inventory-audit.service.js';
import { InventoryTransferService } from '../src/inventory/inventory-transfer.service.js';
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

type Browser = { cookie: string; csrfToken: string };
type ProductFixture = { id: string };

describe('FASE 6B inventory transfers and movement history', () => {
  let administrator!: DatabaseClient;
  let app!: Awaited<ReturnType<typeof createApplication>>;
  let client!: DatabaseClient;
  let databaseName: string;
  let dylanId: string;
  let inventoryManagerId: string;
  let readOnlyUserId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let warehouseCId: string;
  const products = new Map<string, ProductFixture>();
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase6b_' +
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

    dylanId = (
      await client.user.update({
        data: { activatedAt: new Date(), status: 'ACTIVE' },
        select: { id: true },
        where: { loginIdentifier: 'dylan' },
      })
    ).id;
    const inventoryManager = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic inventory manager',
        loginIdentifier: 'phase6b-manager',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    inventoryManagerId = inventoryManager.id;
    const inventoryManagerRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'INVENTORY_MANAGER' },
    });
    await client.userRole.create({
      data: { roleId: inventoryManagerRole.id, userId: inventoryManagerId },
    });

    const readOnly = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic read-only user',
        loginIdentifier: 'phase6b-read-only',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    readOnlyUserId = readOnly.id;
    const readPermission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'inventory.read' },
    });
    await client.userPermission.create({
      data: {
        effect: 'GRANT',
        grantedByUserId: dylanId,
        permissionId: readPermission.id,
        userId: readOnlyUserId,
      },
    });

    const [warehouseA, warehouseB, warehouseC] = await Promise.all(
      ['A', 'B', 'C'].map((suffix) =>
        client.warehouse.create({
          data: {
            code: `PHASE6B_${suffix}`,
            name: `Synthetic warehouse ${suffix}`,
          },
        }),
      ),
    );
    if (!warehouseA || !warehouseB || !warehouseC) {
      throw new Error('Synthetic warehouses could not be created.');
    }
    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;
    warehouseCId = warehouseC.id;

    const unit = await client.unit.create({
      data: { code: 'PHASE6B_UNIT', name: 'Synthetic transfer unit' },
    });
    for (const name of [
      'MAIN',
      'OTHER_ACTOR',
      'MISSING_DESTINATION',
      'ROLLBACK',
      'SAME_KEY',
      'LIMITED',
      'ADJUSTMENT_TRANSFER',
      'CROSS',
      'MISSING_DESTINATION_CONCURRENT',
    ]) {
      const product = await client.product.create({
        data: {
          code: `PHASE6B-${name}`,
          name: `Synthetic ${name.toLowerCase()} product`,
          unitId: unit.id,
        },
        select: { id: true },
      });
      products.set(name, product);
    }

    const balanceFixtures: Array<{
      productId: string;
      quantity: string;
      warehouseId: string;
    }> = [];
    const addBalances = (
      name: string,
      quantities: Partial<Record<'A' | 'B' | 'C', string>>,
    ) => {
      const productId = product(name);
      for (const [warehouse, quantity] of Object.entries(quantities)) {
        balanceFixtures.push({
          productId,
          quantity,
          warehouseId:
            warehouse === 'A'
              ? warehouseAId
              : warehouse === 'B'
                ? warehouseBId
                : warehouseCId,
        });
      }
    };
    addBalances('MAIN', { A: '10', B: '3' });
    addBalances('OTHER_ACTOR', { A: '5', B: '0' });
    addBalances('MISSING_DESTINATION', { A: '5' });
    addBalances('ROLLBACK', { A: '7', B: '1' });
    addBalances('SAME_KEY', { A: '10', B: '0' });
    addBalances('LIMITED', { A: '6', B: '0' });
    addBalances('ADJUSTMENT_TRANSFER', { A: '10', B: '0' });
    addBalances('CROSS', { A: '10', B: '10' });
    addBalances('MISSING_DESTINATION_CONCURRENT', { A: '10' });
    await client.inventoryBalance.createMany({ data: balanceFixtures });

    const mainBalance = await balance('MAIN', warehouseAId);
    await client.inventoryMovement.create({
      data: {
        actorUserId: dylanId,
        balanceAfter: '10',
        balanceBefore: '10',
        observation: 'Synthetic adjustment history',
        occurredAt: new Date('2026-08-20T12:00:00.000Z'),
        productId: product('MAIN'),
        quantityDelta: '0',
        sourceType: 'PHASE6B_FIXTURE',
        type: 'ADJUSTMENT',
        warehouseId: mainBalance.warehouseId,
      },
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
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  function product(name: string): string {
    const fixture = products.get(name);
    if (!fixture) throw new Error(`Missing product fixture ${name}.`);
    return fixture.id;
  }

  async function balance(name: string, warehouseId: string) {
    return client.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_warehouseId: { productId: product(name), warehouseId },
      },
    });
  }

  async function browser(userId = dylanId): Promise<Browser> {
    const secret = await app.get(SessionService).create(userId);
    const token = secret.revealOnce();
    return {
      cookie: `sgi_session=${token}`,
      csrfToken: app.get(CsrfTokenService).create(token),
    };
  }

  function payload(
    name: string,
    quantity = '1',
    overrides: Record<string, unknown> = {},
  ) {
    return {
      fromWarehouseId: warehouseAId,
      productId: product(name),
      quantity,
      reason: 'Reubicacion sintetica controlada',
      toWarehouseId: warehouseBId,
      ...overrides,
    };
  }

  function transfer(
    authenticated: Browser,
    key: string | undefined,
    body: Record<string, unknown>,
  ): request.Test {
    const pending = request(app.getHttpServer())
      .post('/api/v1/inventory/transfers')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .set('X-CSRF-Token', authenticated.csrfToken);
    if (key) pending.set('Idempotency-Key', key);
    return pending.send(body);
  }

  it('serves deterministic movement list, filters and detail with inventory.read', async () => {
    const authenticated = await browser();
    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/inventory/movements?productId=${product('MAIN')}&movementType=ADJUSTMENT&page=1&pageSize=10`,
      )
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({
      product: { id: product('MAIN') },
      transfer: null,
      type: 'ADJUSTMENT',
      warehouse: { id: warehouseAId },
    });
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inventory/movements/${list.body.data.items[0].id}`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .expect(200);
    expect(detail.body.data.id).toBe(list.body.data.items[0].id);
    const overlappingLists = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/inventory/movements?page=1&pageSize=25')
          .set('Host', host)
          .set('Origin', origin)
          .set('Cookie', authenticated.cookie)
          .expect(200),
      ),
    );
    expect(
      overlappingLists.every(({ body }) => body.data.items.length === 1),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/movements/${randomUUID()}`)
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .expect(404);
  });

  it('enforces private, CSRF, permission, DENY and idempotency boundaries', async () => {
    const authenticated = await browser();
    await request(app.getHttpServer())
      .post('/api/v1/inventory/transfers')
      .set('Host', host)
      .set('Origin', origin)
      .send(payload('MAIN'))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/transfers')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .send(payload('MAIN'))
      .expect(403);
    await transfer(authenticated, undefined, payload('MAIN')).expect(400);
    await transfer(authenticated, 'short', payload('MAIN')).expect(400);
    await transfer(
      await browser(readOnlyUserId),
      `readonly-${randomUUID()}`,
      payload('MAIN'),
    ).expect(403);

    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'transfers.create' },
    });
    const deny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        grantedByUserId: dylanId,
        permissionId: permission.id,
        userId: dylanId,
      },
    });
    await transfer(
      await browser(),
      `denied-${randomUUID()}`,
      payload('MAIN'),
    ).expect(403);
    await client.userPermission.update({
      data: { revokedAt: new Date(), revokedByUserId: dylanId },
      where: { id: deny.id },
    });
  });

  it('creates an atomic transfer, ledger and audit exactly once', async () => {
    const authenticated = await browser();
    const key = `main-${randomUUID()}`;
    const first = await transfer(authenticated, key, payload('MAIN', '4'))
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(first.body.data).toMatchObject({
      destinationBalanceAfter: '7',
      destinationBalanceBefore: '3',
      originBalanceAfter: '6',
      originBalanceBefore: '10',
      quantity: '4',
      stockTotal: '13',
    });
    const retry = await transfer(
      authenticated,
      key,
      payload('MAIN', '4'),
    ).expect(201);
    expect(retry.body.data.transferId).toBe(first.body.data.transferId);
    await transfer(authenticated, key, payload('MAIN', '3'))
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      });

    expect(await client.inventoryTransfer.count()).toBe(1);
    expect(await client.inventoryTransferItem.count()).toBe(1);
    const movements = await client.inventoryMovement.findMany({
      where: { transferItemId: first.body.data.transferItemId },
    });
    expect(movements).toHaveLength(2);
    expect(movements.map(({ type }) => type).sort()).toEqual([
      'TRANSFER_IN',
      'TRANSFER_OUT',
    ]);
    expect(
      await client.auditLog.count({
        where: {
          action: 'inventory.transferred',
          entityId: first.body.data.transferId,
        },
      }),
    ).toBe(1);
    const audit = await client.auditLog.findFirstOrThrow({
      where: { entityId: first.body.data.transferId },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(key);
  });

  it('validates resources, warehouse distinction, quantity and stock', async () => {
    const authenticated = await browser();
    const attempt = (body: Record<string, unknown>) =>
      transfer(authenticated, `validation-${randomUUID()}`, body);
    await attempt(
      payload('OTHER_ACTOR', '1', { toWarehouseId: warehouseAId }),
    ).expect(400);
    await attempt(payload('OTHER_ACTOR', '0')).expect(400);
    await attempt(payload('OTHER_ACTOR', '1', { productId: randomUUID() }))
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('INVENTORY_TRANSFER_PRODUCT_NOT_FOUND');
      });
    await attempt(
      payload('OTHER_ACTOR', '1', { toWarehouseId: randomUUID() }),
    ).expect(404);
    await attempt(payload('OTHER_ACTOR', '6'))
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('INVENTORY_TRANSFER_INSUFFICIENT_STOCK');
      });
  });

  it('scopes the same idempotency key to the actor', async () => {
    const key = `actor-scope-${randomUUID()}`;
    const result = await transfer(
      await browser(inventoryManagerId),
      key,
      payload('OTHER_ACTOR', '2'),
    ).expect(201);
    expect(result.body.data.quantity).toBe('2');
  });

  it('creates a missing destination balance without creating valuation', async () => {
    const beforeValuations = await client.productWarehouseValuation.count({
      where: { productId: product('MISSING_DESTINATION') },
    });
    const result = await transfer(
      await browser(),
      `missing-${randomUUID()}`,
      payload('MISSING_DESTINATION', '2', {
        toWarehouseId: warehouseCId,
      }),
    ).expect(201);
    expect(result.body.data).toMatchObject({
      destinationBalanceAfter: '2',
      destinationBalanceBefore: '0',
    });
    expect(
      await client.productWarehouseValuation.count({
        where: { productId: product('MISSING_DESTINATION') },
      }),
    ).toBe(beforeValuations);
  });

  it('rolls back all transfer state when audit persistence fails', async () => {
    class FailingAudit extends InventoryAuditService {
      override async recordTransfer(
        _transaction: Parameters<InventoryAuditService['recordTransfer']>[0],
        _input: InventoryTransferAuditInput,
      ): Promise<void> {
        void _transaction;
        void _input;
        throw new Error('INJECTED_TRANSFER_AUDIT_FAILURE');
      }
    }
    const service = new InventoryTransferService(client, new FailingAudit());
    await expect(
      service.transfer(
        dylanId,
        `rollback-${randomUUID()}`,
        payload('ROLLBACK', '2'),
      ),
    ).rejects.toThrow('INJECTED_TRANSFER_AUDIT_FAILURE');
    expect((await balance('ROLLBACK', warehouseAId)).quantity.toString()).toBe(
      '7',
    );
    expect((await balance('ROLLBACK', warehouseBId)).quantity.toString()).toBe(
      '1',
    );
    expect(
      await client.inventoryTransfer.count({
        where: { items: { some: { productId: product('ROLLBACK') } } },
      }),
    ).toBe(0);
  });

  it('deduplicates concurrent identical requests without a unique-race failure', async () => {
    const service = app.get(InventoryTransferService);
    const key = `same-key-${randomUUID()}`;
    const [first, second] = await Promise.all([
      service.transfer(dylanId, key, payload('SAME_KEY', '3')),
      service.transfer(dylanId, key, payload('SAME_KEY', '3')),
    ]);
    expect(first.transferId).toBe(second.transferId);
    expect((await balance('SAME_KEY', warehouseAId)).quantity.toString()).toBe(
      '7',
    );
    expect((await balance('SAME_KEY', warehouseBId)).quantity.toString()).toBe(
      '3',
    );
  });

  it('serializes limited stock and never permits a negative balance', async () => {
    const service = app.get(InventoryTransferService);
    const results = await Promise.allSettled([
      service.transfer(
        dylanId,
        `limited-a-${randomUUID()}`,
        payload('LIMITED', '4'),
      ),
      service.transfer(
        dylanId,
        `limited-b-${randomUUID()}`,
        payload('LIMITED', '4'),
      ),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect((await balance('LIMITED', warehouseAId)).quantity.toNumber()).toBe(
      2,
    );
    expect((await balance('LIMITED', warehouseBId)).quantity.toNumber()).toBe(
      4,
    );
  });

  it('serializes an adjustment and transfer on the same balance', async () => {
    const transfers = app.get(InventoryTransferService);
    const adjustments = app.get(InventoryAdjustmentService);
    const results = await Promise.allSettled([
      transfers.transfer(
        dylanId,
        `adjust-transfer-${randomUUID()}`,
        payload('ADJUSTMENT_TRANSFER', '8'),
      ),
      adjustments.adjust(dylanId, {
        productId: product('ADJUSTMENT_TRANSFER'),
        quantityDelta: '-3',
        reason: 'Concurrent controlled count',
        warehouseId: warehouseAId,
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      (await balance('ADJUSTMENT_TRANSFER', warehouseAId)).quantity.toNumber(),
    ).toBeGreaterThanOrEqual(0);
  });

  it('orders locks for crossed transfers without a permanent deadlock', async () => {
    const service = app.get(InventoryTransferService);
    const [aToB, bToA] = await Promise.all([
      service.transfer(
        dylanId,
        `cross-a-${randomUUID()}`,
        payload('CROSS', '2'),
      ),
      service.transfer(
        inventoryManagerId,
        `cross-b-${randomUUID()}`,
        payload('CROSS', '3', {
          fromWarehouseId: warehouseBId,
          toWarehouseId: warehouseAId,
        }),
      ),
    ]);
    expect(aToB.transferId).not.toBe(bToA.transferId);
    expect((await balance('CROSS', warehouseAId)).quantity.toString()).toBe(
      '11',
    );
    expect((await balance('CROSS', warehouseBId)).quantity.toString()).toBe(
      '9',
    );
  });

  it('handles concurrent transfers into a previously absent balance', async () => {
    const service = app.get(InventoryTransferService);
    await Promise.all([
      service.transfer(
        dylanId,
        `missing-concurrent-a-${randomUUID()}`,
        payload('MISSING_DESTINATION_CONCURRENT', '2', {
          toWarehouseId: warehouseCId,
        }),
      ),
      service.transfer(
        inventoryManagerId,
        `missing-concurrent-b-${randomUUID()}`,
        payload('MISSING_DESTINATION_CONCURRENT', '2', {
          toWarehouseId: warehouseCId,
        }),
      ),
    ]);
    expect(
      (
        await balance('MISSING_DESTINATION_CONCURRENT', warehouseAId)
      ).quantity.toString(),
    ).toBe('6');
    expect(
      (
        await balance('MISSING_DESTINATION_CONCURRENT', warehouseCId)
      ).quantity.toString(),
    ).toBe('4');
    expect(
      await client.inventoryBalance.count({
        where: {
          productId: product('MISSING_DESTINATION_CONCURRENT'),
          warehouseId: warehouseCId,
        },
      }),
    ).toBe(1);
  });

  it('keeps transfer documents and ledger immutable', async () => {
    const transferRow = await client.inventoryTransfer.findFirstOrThrow();
    const item = await client.inventoryTransferItem.findFirstOrThrow({
      where: { transferId: transferRow.id },
    });
    await expect(
      client.inventoryTransfer.update({
        data: { reason: 'Mutation must fail' },
        where: { id: transferRow.id },
      }),
    ).rejects.toThrow();
    await expect(
      client.inventoryTransferItem.update({
        data: { quantity: '99' },
        where: { id: item.id },
      }),
    ).rejects.toThrow();
  });
});
