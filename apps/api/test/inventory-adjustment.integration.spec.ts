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
import {
  InventoryAdjustmentService,
  type InventoryClock,
} from '../src/inventory/inventory-adjustment.service.js';
import {
  InventoryAuditService,
  type InventoryAdjustmentAuditInput,
} from '../src/inventory/inventory-audit.service.js';
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

describe('FASE 5C inventory adjustments', () => {
  let administrator!: DatabaseClient;
  let app!: Awaited<ReturnType<typeof createApplication>>;
  let client!: DatabaseClient;
  let concurrentProductId: string;
  let databaseName: string;
  let dylanId: string;
  let productId: string;
  let readOnlyUserId: string;
  let rollbackProductId: string;
  let warehouseId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase5c_' +
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
    const readOnly = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Read only synthetic user',
        loginIdentifier: 'phase5c-read-only',
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

    const unit = await client.unit.create({
      data: { code: 'PHASE5C_UNIT', name: 'Synthetic adjustment unit' },
    });
    const warehouse = await client.warehouse.create({
      data: { code: 'PHASE5C_WH', name: 'Synthetic adjustment warehouse' },
    });
    warehouseId = warehouse.id;
    const products = await Promise.all(
      ['MAIN', 'ROLLBACK', 'CONCURRENT'].map((suffix) =>
        client.product.create({
          data: {
            code: `PHASE5C-${suffix}`,
            name: `Synthetic ${suffix.toLowerCase()} product`,
            unitId: unit.id,
          },
        }),
      ),
    );
    const [main, rollback, concurrent] = products;
    if (!main || !rollback || !concurrent) {
      throw new Error('Synthetic products could not be created.');
    }
    productId = main.id;
    rollbackProductId = rollback.id;
    concurrentProductId = concurrent.id;
    await client.inventoryBalance.createMany({
      data: [
        { productId, quantity: '10', warehouseId },
        { productId: rollbackProductId, quantity: '7', warehouseId },
        { productId: concurrentProductId, quantity: '10', warehouseId },
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
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  async function browser(userId = dylanId): Promise<Browser> {
    const secret = await app.get(SessionService).create(userId);
    const token = secret.revealOnce();
    return {
      cookie: `sgi_session=${token}`,
      csrfToken: app.get(CsrfTokenService).create(token),
    };
  }

  function adjustment(
    authenticated: Browser,
    body: Record<string, unknown>,
  ): request.Test {
    return request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .set('X-CSRF-Token', authenticated.csrfToken)
      .send(body);
  }

  function input(
    quantityDelta: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      productId,
      quantityDelta,
      reason: 'Conteo fisico controlado',
      warehouseId,
      ...overrides,
    };
  }

  it('atomically applies positive and negative adjustments with ledger and audit', async () => {
    const authenticated = await browser();
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Host', host)
      .set('Origin', origin)
      .send(input('5'))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Host', host)
      .set('Origin', origin)
      .set('Cookie', authenticated.cookie)
      .send(input('5'))
      .expect(403);

    const positive = await adjustment(authenticated, input('+5'))
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(positive.body.data).toMatchObject({
      balanceAfter: '15',
      balanceBefore: '10',
      quantityDelta: '5',
    });
    const negative = await adjustment(authenticated, input('-3')).expect(201);
    expect(negative.body.data).toMatchObject({
      balanceAfter: '12',
      balanceBefore: '15',
      quantityDelta: '-3',
    });

    const balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    expect(balance.quantity.toString()).toBe('12');
    expect(balance.version).toBe(3);
    const movements = await client.inventoryMovement.findMany({
      orderBy: { occurredAt: 'asc' },
      where: { productId, warehouseId },
    });
    expect(movements).toHaveLength(2);
    expect(movements.map(({ type }) => type)).toEqual([
      'ADJUSTMENT',
      'ADJUSTMENT',
    ]);
    expect(movements.map(({ actorUserId }) => actorUserId)).toEqual([
      dylanId,
      dylanId,
    ]);
    expect(
      await client.auditLog.count({
        where: {
          action: 'inventory.adjusted',
          entityId: { in: movements.map(({ id }) => id) },
        },
      }),
    ).toBe(2);
  });

  it('rejects invalid resources, zero, blank reason and negative stock safely', async () => {
    const authenticated = await browser();
    await adjustment(authenticated, input('0')).expect(400);
    await adjustment(authenticated, input('1', { reason: '   ' })).expect(400);
    await adjustment(authenticated, input('1', { productId: randomUUID() }))
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('INVENTORY_PRODUCT_NOT_FOUND');
      });
    await adjustment(authenticated, input('1', { warehouseId: randomUUID() }))
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('INVENTORY_WAREHOUSE_NOT_FOUND');
      });
    const movementCount = await client.inventoryMovement.count({
      where: { productId },
    });
    await adjustment(authenticated, input('-13'))
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('INVENTORY_NEGATIVE_BALANCE');
      });
    expect(
      (
        await client.inventoryBalance.findUniqueOrThrow({
          where: { productId_warehouseId: { productId, warehouseId } },
        })
      ).quantity.toString(),
    ).toBe('12');
    expect(await client.inventoryMovement.count({ where: { productId } })).toBe(
      movementCount,
    );
  });

  it('rejects read-only users and a direct inventory.adjust DENY', async () => {
    await adjustment(await browser(readOnlyUserId), input('1')).expect(403);
    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'inventory.adjust' },
    });
    const deny = await client.userPermission.create({
      data: {
        effect: 'DENY',
        grantedByUserId: dylanId,
        permissionId: permission.id,
        userId: dylanId,
      },
    });
    await adjustment(await browser(), input('1')).expect(403);
    await client.userPermission.update({
      data: { revokedAt: new Date(), revokedByUserId: dylanId },
      where: { id: deny.id },
    });
  });

  it('rolls back movement and balance when audit persistence fails', async () => {
    class FailingAudit extends InventoryAuditService {
      override async recordAdjustment(
        _transaction: Parameters<InventoryAuditService['recordAdjustment']>[0],
        _input: InventoryAdjustmentAuditInput,
      ): Promise<void> {
        void _transaction;
        void _input;
        throw new Error('INJECTED_AUDIT_FAILURE');
      }
    }
    const clock: InventoryClock = {
      now: () => new Date('2026-08-16T13:00:00.000Z'),
    };
    const service = new InventoryAdjustmentService(
      client,
      new FailingAudit(),
      clock,
    );
    await expect(
      service.adjust(dylanId, {
        productId: rollbackProductId,
        quantityDelta: '2',
        reason: 'Injected rollback verification',
        warehouseId,
      }),
    ).rejects.toThrow('INJECTED_AUDIT_FAILURE');
    expect(
      (
        await client.inventoryBalance.findUniqueOrThrow({
          where: {
            productId_warehouseId: {
              productId: rollbackProductId,
              warehouseId,
            },
          },
        })
      ).quantity.toString(),
    ).toBe('7');
    expect(
      await client.inventoryMovement.count({
        where: { productId: rollbackProductId },
      }),
    ).toBe(0);
  });

  it('serializes concurrent changes to the same product and warehouse', async () => {
    const service = app.get(InventoryAdjustmentService);
    const results = await Promise.all([
      service.adjust(dylanId, {
        productId: concurrentProductId,
        quantityDelta: '5',
        reason: 'Concurrent positive adjustment',
        warehouseId,
      }),
      service.adjust(dylanId, {
        productId: concurrentProductId,
        quantityDelta: '-3',
        reason: 'Concurrent negative adjustment',
        warehouseId,
      }),
    ]);
    expect(results).toHaveLength(2);
    expect(
      (
        await client.inventoryBalance.findUniqueOrThrow({
          where: {
            productId_warehouseId: {
              productId: concurrentProductId,
              warehouseId,
            },
          },
        })
      ).quantity.toString(),
    ).toBe('12');
    expect(
      await client.inventoryMovement.count({
        where: { productId: concurrentProductId },
      }),
    ).toBe(2);
  });

  it('keeps inventory movement rows immutable', async () => {
    const movement = await client.inventoryMovement.findFirstOrThrow({
      where: { productId },
    });
    await expect(
      client.inventoryMovement.update({
        data: { observation: 'Mutation must fail' },
        where: { id: movement.id },
      }),
    ).rejects.toThrow();
  });
});
