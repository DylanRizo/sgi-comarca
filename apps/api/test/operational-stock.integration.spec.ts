import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';
import { prepareOperationalCatalogs } from '../../../packages/database/src/bootstrap/operational-catalogs.js';
import { createApplication } from '../src/bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { StockReceiptService } from '../src/stock-receipts/stock-receipt.service.js';
import { ProductWriteService } from '../src/products/product-write.service.js';
import { InventoryValuationService } from '../src/stock-receipts/inventory-valuation.service.js';

const originalUrl = process.env.DATABASE_URL!;
const databaseName = `sgi_operational_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
type Browser = { cookie: string; csrf: string };

describe('Operational products, receipts and protected valuation', () => {
  let administrator: DatabaseClient;
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let receipts: StockReceiptService;
  let dylan: string,
    jean: string,
    luden: string,
    samantha: string,
    unitId: string,
    groupId: string,
    warehouseId: string;

  beforeAll(async () => {
    const target = new URL(originalUrl);
    target.pathname = '/postgres';
    administrator = createDatabaseClient(target.toString());
    await administrator.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    target.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = target.toString();
    const root = fileURLToPath(
      new URL('../../../packages/database/', import.meta.url),
    );
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../packages/database/node_modules/prisma/build/index.js',
            import.meta.url,
          ),
        ),
        'migrate',
        'deploy',
        '--config',
        fileURLToPath(
          new URL(
            '../../../packages/database/prisma.config.ts',
            import.meta.url,
          ),
        ),
      ],
      { cwd: root, env: process.env },
    );
    client = createDatabaseClient(target.toString());
    await runBootstrap(client);
    await prepareOperationalCatalogs(client);
    await client.user.updateMany({
      data: { activatedAt: new Date(), status: 'ACTIVE' },
    });
    const users = await client.user.findMany();
    const userId = (name: string) =>
      users.find((user) => user.loginIdentifier === name)!.id;
    dylan = userId('dylan');
    jean = userId('jean');
    luden = userId('luden');
    samantha = userId('samantha');
    unitId = (
      await client.unit.findUniqueOrThrow({ where: { code: 'UNIDADES' } })
    ).id;
    groupId = (
      await client.productGroup.findUniqueOrThrow({
        where: { code: 'GENERAL' },
      })
    ).id;
    warehouseId = (
      await client.warehouse.findUniqueOrThrow({
        where: { code: 'CASA_DYLAN' },
      })
    ).id;
    receipts = new StockReceiptService(client);
    app = await createApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    process.env.DATABASE_URL = originalUrl;
  });

  async function browser(id: string): Promise<Browser> {
    const token = (await app.get(SessionService).create(id)).revealOnce();
    return {
      cookie: `sgi_session=${token}`,
      csrf: app.get(CsrfTokenService).create(token),
    };
  }
  function post(
    auth: Browser,
    path: string,
    body: object,
    key: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  }
  function product(code: string = randomUUID()) {
    return {
      code,
      name: 'Producto sintético',
      unitId,
      groupId,
      minimumStock: '2.5',
    };
  }
  function receipt(productId: string) {
    return {
      productId,
      warehouseId,
      quantity: '1.25',
      reason: 'Recepción sintética',
    };
  }

  it('prepares catalogs idempotently without importing products', async () => {
    await prepareOperationalCatalogs(client);
    expect(await client.unit.count()).toBe(14);
    expect(await client.productGroup.count()).toBe(1);
    expect(await client.product.count()).toBe(0);
  });

  it('creates an atomic first receipt exactly once after a lost response', async () => {
    const auth = await browser(dylan),
      key = randomUUID();
    const input = {
      ...product('  synthetic-a  '),
      initialReceipt: {
        warehouseId,
        quantity: '3.25',
        unitCost: '15.20',
        unitPrice: '22.50',
        reason: 'Primera entrada',
      },
    };
    const first = await post(auth, '/products', input, key).expect(201);
    const replay = await post(auth, '/products', input, key).expect(201);
    expect(replay.body.data).toEqual(first.body.data);
    const id = first.body.data.product.id as string;
    expect(first.body.data.product.code).toBe('SYNTHETIC-A');
    expect(first.body.data.receipt.items[0]).toMatchObject({
      quantity: '3.25',
      balanceBefore: '0',
      balanceAfter: '3.25',
      unitCost: '15.20',
    });
    expect(
      await client.inventoryMovement.count({ where: { productId: id } }),
    ).toBe(1);
    expect(
      await client.stockReceiptItem.count({ where: { productId: id } }),
    ).toBe(1);
    expect(
      await client.auditLog.count({
        where: { entityId: id, action: 'product.created' },
      }),
    ).toBe(1);
    await post(
      auth,
      '/products',
      { ...input, name: 'Otra intención' },
      key,
    ).expect(409);
    await post(auth, '/products', product('synthetic-a')).expect(409);
  });

  it('rolls back product and audit when the first receipt fails', async () => {
    const input = {
      ...product('ROLLBACK-RECEIPT'),
      initialReceipt: {
        warehouseId: randomUUID(),
        quantity: '2',
        reason: 'Revertir',
      },
    };
    await expect(
      receipts.createProduct(dylan, randomUUID(), input),
    ).rejects.toMatchObject({ code: 'STOCK_RESOURCE_NOT_FOUND' });
    expect(await client.product.count({ where: { code: input.code } })).toBe(0);
  });

  it('allows all four operators to create and receive, but only finance to supply values', async () => {
    for (const actor of [dylan, samantha, jean, luden]) {
      const created = await receipts.createProduct(
        actor,
        randomUUID(),
        product(),
      );
      const result = await receipts.create(
        actor,
        randomUUID(),
        receipt(created.product.id),
      );
      expect(result.items[0]!.unitCost).toBeNull();
      if (actor === jean || actor === luden) {
        await expect(
          receipts.create(actor, randomUUID(), {
            ...receipt(created.product.id),
            unitCost: '19',
          }),
        ).rejects.toMatchObject({ code: 'STOCK_PERMISSION_DENIED' });
      } else {
        const valued = await receipts.create(actor, randomUUID(), {
          ...receipt(created.product.id),
          unitCost: '19',
          unitPrice: '30',
        });
        expect(valued.items[0]!.unitCost).toBe('19.00');
      }
    }
  });

  it('preserves current values when omitted and hides costs on every inventory read route', async () => {
    const created = await receipts.createProduct(
      dylan,
      randomUUID(),
      product(),
    );
    const input = {
      ...receipt(created.product.id),
      unitCost: '14.75',
      unitPrice: '28',
    };
    const valued = await receipts.create(dylan, randomUUID(), input);
    const next = await receipts.create(
      jean,
      randomUUID(),
      receipt(created.product.id),
    );
    expect(next.items[0]!.unitCost).toBeNull();
    const balance = await client.inventoryBalance.findFirstOrThrow({
      where: { productId: created.product.id },
    });
    expect(balance.currentUnitCost?.toString()).toBe('14.75');
    for (const actor of [jean, luden]) {
      const auth = await browser(actor);
      for (const path of [
        `/inventory/products/${created.product.id}`,
        `/inventory?search=${created.product.code}`,
        `/inventory/warehouses/${warehouseId}?search=${created.product.code}`,
      ]) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1${path}`)
          .set('Host', 'localhost:3001')
          .set('Cookie', auth.cookie)
          .expect(200);
        const item = response.body.data.items?.[0] ?? response.body.data;
        expect(item.balances[0]).toMatchObject({
          canReadCost: false,
          currentUnitCost: null,
          currentUnitPrice: '28',
        });
        expect(item.balances[0].valuations[0].unitCost).toBeNull();
      }
      const hidden = await receipts.get(actor, valued.id);
      expect(hidden.items[0]!.unitCost).toBeNull();
      await request(app.getHttpServer())
        .get('/api/v1/inventory/valuations/pending')
        .set('Host', 'localhost:3001')
        .set('Cookie', auth.cookie)
        .expect(403);
    }
  });

  it('reaches an already valued pair through search, not through pending', async () => {
    const created = await receipts.createProduct(
      dylan,
      randomUUID(),
      product(),
    );
    await receipts.create(dylan, randomUUID(), {
      ...receipt(created.product.id),
      unitCost: '31.50',
      unitPrice: '60',
    });
    const auth = await browser(dylan);
    const pending = await request(app.getHttpServer())
      .get('/api/v1/inventory/valuations/pending')
      .set('Host', 'localhost:3001')
      .set('Cookie', auth.cookie)
      .expect(200);
    expect(
      pending.body.data.items.some(
        (item: { product: { id: string } }) =>
          item.product.id === created.product.id,
      ),
    ).toBe(false);
    const found = await request(app.getHttpServer())
      .get(`/api/v1/inventory/valuations?search=${created.product.code}`)
      .set('Host', 'localhost:3001')
      .set('Cookie', auth.cookie)
      .expect(200);
    const line = found.body.data.items.find(
      (item: { product: { id: string } }) =>
        item.product.id === created.product.id,
    );
    expect(line).toMatchObject({ unitCost: '31.50', unitPrice: '60.00' });
    // Correcting it keeps the omitted value and never touches the quantity.
    const before = await client.inventoryBalance.findUniqueOrThrow({
      where: { id: line.id },
    });
    const valuations = new InventoryValuationService(client);
    await valuations.update(dylan, line.id, randomUUID(), {
      expectedVersion: line.version,
      reason: 'Nuevo precio de temporada',
      unitPrice: '72',
    });
    const balance = await client.inventoryBalance.findUniqueOrThrow({
      where: { id: line.id },
    });
    expect(balance.currentUnitCost?.toString()).toBe('31.5');
    expect(balance.currentUnitPrice?.toString()).toBe('72');
    expect(balance.quantity.toString()).toBe(before.quantity.toString());
    // The search is financial information, so it needs the same permission.
    const denied = await browser(luden);
    await request(app.getHttpServer())
      .get(`/api/v1/inventory/valuations?search=${created.product.code}`)
      .set('Host', 'localhost:3001')
      .set('Cookie', denied.cookie)
      .expect(403);
  });

  it('serializes concurrent receipts and persistent replays', async () => {
    const created = await receipts.createProduct(
      dylan,
      randomUUID(),
      product(),
    );
    const key = randomUUID(),
      input = receipt(created.product.id);
    const results = await Promise.all([
      receipts.create(dylan, key, input),
      receipts.create(dylan, key, input),
      receipts.create(jean, randomUUID(), input),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    const balance = await client.inventoryBalance.findFirstOrThrow({
      where: { productId: created.product.id },
    });
    expect(balance.quantity.toString()).toBe('2.5');
    expect(
      await client.inventoryMovement.count({
        where: { productId: created.product.id },
      }),
    ).toBe(2);
  });

  it('edits metadata without rewriting stock or historical codes', async () => {
    const created = await receipts.createProduct(
      dylan,
      randomUUID(),
      product(),
    );
    await receipts.create(dylan, randomUUID(), receipt(created.product.id));
    const writes = new ProductWriteService(client);
    const input = {
      ...product(created.product.code),
      expectedUpdatedAt: created.product.updatedAt,
    };
    await expect(
      writes.edit(jean, created.product.id, randomUUID(), {
        ...input,
        code: 'CHANGED-HISTORY',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_HISTORY_LOCKED' });
    const edited = await writes.edit(jean, created.product.id, randomUUID(), {
      ...input,
      name: 'Nombre corregido',
    });
    expect(edited.name).toBe('Nombre corregido');
    await expect(
      writes.edit(jean, created.product.id, randomUUID(), input),
    ).rejects.toMatchObject({ code: 'STOCK_OPERATION_CONFLICT' });
    expect(
      await client.inventoryMovement.count({
        where: { productId: created.product.id },
      }),
    ).toBe(1);
  });

  it('completes valuation with version control without altering past receipts or stock', async () => {
    const created = await receipts.createProduct(jean, randomUUID(), product());
    const received = await receipts.create(
      jean,
      randomUUID(),
      receipt(created.product.id),
    );
    const before = await client.inventoryBalance.findFirstOrThrow({
      where: { productId: created.product.id },
    });
    const service = new InventoryValuationService(client);
    const input = {
      expectedVersion: before.version,
      unitCost: '21.10',
      unitPrice: '35',
      reason: 'Completar costo documentado',
    };
    const key = randomUUID();
    const updated = await service.update(samantha, before.id, key, input);
    expect(await service.update(samantha, before.id, key, input)).toEqual(
      updated,
    );
    await expect(
      service.update(dylan, before.id, randomUUID(), input),
    ).rejects.toMatchObject({ code: 'STOCK_OPERATION_CONFLICT' });
    expect(
      (await receipts.get(dylan, received.id)).items[0]!.unitCost,
    ).toBeNull();
    const after = await client.inventoryBalance.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.quantity.toString()).toBe(before.quantity.toString());
    expect(after.currentUnitCost?.toString()).toBe('21.1');
    expect(
      await client.inventoryMovement.count({
        where: { productId: created.product.id },
      }),
    ).toBe(1);
    await expect(
      client.stockReceipt.update({
        where: { id: received.id },
        data: { reason: 'Reescribir historia' },
      }),
    ).rejects.toThrow();
    await expect(
      client.stockReceiptItem.delete({ where: { id: received.items[0]!.id } }),
    ).rejects.toThrow();
  });

  it('validates HTTP input, idempotency and permission before mutation', async () => {
    const auth = await browser(jean);
    await post(auth, '/products', { ...product(), minimumStock: '-1' }).expect(
      400,
    );
    await post(auth, '/products', product(), 'short').expect(400);
    await post(auth, '/products', {
      ...product(),
      initialReceipt: {
        warehouseId,
        quantity: '2',
        reason: 'No permitido',
        unitCost: '5',
      },
    }).expect(403);
    await post(auth, '/products', { ...product(), surprise: true }).expect(400);
  });
});
