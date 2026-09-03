import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { SaleError } from '../src/sales/sale.errors.js';
import { SaleReadService } from '../src/sales/sale-read.service.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

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

describe('FASE 7B.3 operational sale creation', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let creation!: CreateSaleService;
  let reads!: SaleReadService;
  let databaseName: string;
  let sellerId: string;
  let noPermissionUserId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let productAId: string;
  let productBId: string;
  let zeroCostProductId: string;
  let nullCostProductId: string;
  let nullPriceProductId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function balanceQuantity(
    productId: string,
    warehouseId: string,
  ): Promise<string> {
    const balance = await client.inventoryBalance.findUniqueOrThrow({
      select: { quantity: true },
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return balance.quantity.toString();
  }

  async function seedBalance(
    productId: string,
    warehouseId: string,
    quantity: string,
    price: string | null,
    cost: string | null,
  ): Promise<void> {
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: cost,
        currentUnitPrice: price,
        productId,
        quantity,
        warehouseId,
      },
    });
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase7b3_' +
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
    creation = new CreateSaleService(client);
    reads = new SaleReadService(client);

    const salesRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'SALES' },
    });
    const seller = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic seller',
        loginIdentifier: 'phase7b3-seller',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    sellerId = seller.id;
    await client.userRole.create({
      data: { roleId: salesRole.id, userId: sellerId },
    });

    const outsider = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic outsider',
        loginIdentifier: 'phase7b3-outsider',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    noPermissionUserId = outsider.id;

    const [warehouseA, warehouseB] = await Promise.all(
      ['A', 'B'].map((suffix) =>
        client.warehouse.create({
          data: {
            active: true,
            code: `P7B3-W-${suffix}`,
            name: `Phase 7B3 warehouse ${suffix}`,
          },
          select: { id: true },
        }),
      ),
    );
    warehouseAId = warehouseA!.id;
    warehouseBId = warehouseB!.id;

    const productCodes = [
      'P7B3-A',
      'P7B3-B',
      'P7B3-ZERO-COST',
      'P7B3-NULL-COST',
      'P7B3-NULL-PRICE',
    ];
    const created = await Promise.all(
      productCodes.map((code) =>
        client.product.create({
          data: { active: true, code, name: `Product ${code}` },
          select: { id: true },
        }),
      ),
    );
    productAId = created[0]!.id;
    productBId = created[1]!.id;
    zeroCostProductId = created[2]!.id;
    nullCostProductId = created[3]!.id;
    nullPriceProductId = created[4]!.id;

    await seedBalance(productAId, warehouseAId, '100', '10.00', '4.00');
    await seedBalance(productAId, warehouseBId, '50', '11.00', '5.00');
    await seedBalance(productBId, warehouseAId, '20', '2.50', '1.00');
    await seedBalance(zeroCostProductId, warehouseAId, '10', '3.00', '0.00');
    await seedBalance(nullCostProductId, warehouseAId, '10', '3.00', null);
    await seedBalance(nullPriceProductId, warehouseAId, '10', null, '1.00');
  }, 120_000);

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

  it('creates an in-transit sale, generates the number, and deducts stock once', async () => {
    const before = await balanceQuantity(productAId, warehouseAId);
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '2', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });

    expect(sale.saleNumber).toMatch(/^VTA-\d{9}$/u);
    expect(sale.status).toBe('IN_TRANSIT');
    expect(sale.paymentStatus).toBe('PENDING');
    expect(sale.origin).toBe('OPERATIONAL');
    expect(sale.businessDate).toBe('2026-08-27');
    expect(sale.completedAt).toBeNull();
    expect(sale.subtotal).toBe('20.00');
    expect(sale.total).toBe('20.00');

    const after = await balanceQuantity(productAId, warehouseAId);
    expect(Number(before) - Number(after)).toBe(2);

    const movements = await client.inventoryMovement.findMany({
      where: { sourceId: sale.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('SALE');
    expect(movements[0]?.sourceType).toBe('SALE');
    expect(movements[0]?.quantityDelta.toString()).toBe('-2');
    expect(movements[0]?.actorUserId).toBe(sellerId);

    const audits = await client.auditLog.findMany({
      where: { action: 'sales.created', entityId: sale.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('persists and reads back the operational logistics of a sale', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      delivererText: '  Jean  ',
      deliveryPlace: 'Altamira, casa 12',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      observations: 'Entregar despues de las 5',
      paymentMethodText: 'Efectivo',
      salesChannelText: 'WhatsApp',
      status: 'IN_TRANSIT',
    });

    // Stored trimmed, matching exactly what the idempotency hash saw.
    expect(sale.delivererText).toBe('Jean');
    expect(sale.salesChannelText).toBe('WhatsApp');
    expect(sale.paymentMethodText).toBe('Efectivo');
    expect(sale.deliveryPlace).toBe('Altamira, casa 12');
    expect(sale.observations).toBe('Entregar despues de las 5');

    const reread = await reads.get(sale.id);
    expect(reread.salesChannelText).toBe('WhatsApp');
    expect(reread.deliveryPlace).toBe('Altamira, casa 12');
  });

  it('leaves logistics null when the counter omits it', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      delivererText: '   ',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });

    // Whitespace is not a value: a walk-in sale has no courier.
    expect(sale.delivererText).toBeNull();
    expect(sale.salesChannelText).toBeNull();
    expect(sale.deliveryPlace).toBeNull();
    expect(sale.observations).toBeNull();
  });

  it('refuses to replay one key with a rewritten address', async () => {
    const key = randomUUID() + randomUUID();
    const base = {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT' as const,
    };
    await creation.create(sellerId, key, {
      ...base,
      deliveryPlace: 'Altamira, casa 12',
    });

    await expect(
      creation.create(sellerId, key, {
        ...base,
        deliveryPlace: 'Reparto San Juan',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('creates a completed sale across warehouses and allocates shipping exactly', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
        { productId: productAId, quantity: '1', warehouseId: warehouseBId },
        { productId: productBId, quantity: '1', warehouseId: warehouseAId },
      ],
      shippingAmount: '10.00',
      status: 'COMPLETED',
    });

    expect(sale.status).toBe('COMPLETED');
    expect(sale.completedAt).not.toBeNull();
    expect(sale.paymentStatus).toBe('PENDING');
    // 10.00 + 11.00 + 2.50
    expect(sale.subtotal).toBe('23.50');
    expect(sale.total).toBe('33.50');

    const allocations = sale.items.map((item) => item.shippingAllocation);
    // 1000 cents over 3 lines: 334 + 333 + 333
    expect(allocations).toStrictEqual(['3.34', '3.33', '3.33']);
    const allocated = allocations.reduce(
      (total, value) => total + Math.round(Number(value) * 100),
      0,
    );
    expect(allocated).toBe(1000);

    const movements = await client.inventoryMovement.findMany({
      where: { sourceId: sale.id },
    });
    expect(movements).toHaveLength(3);
  });

  it('persists snapshots and never exposes cost through the read surface', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });

    const persisted = await client.saleItem.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(persisted.unitPriceSnapshot?.toString()).toBe('10');
    expect(persisted.unitCostSnapshot?.toString()).toBe('4');

    const view = await reads.get(sale.id);
    expect(JSON.stringify(view)).not.toContain('unitCostSnapshot');
    expect(view.items[0]?.unitPriceSnapshot).toBe('10.00');
  });

  it('accepts a zero cost and records a price override in sanitized audit', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        {
          productId: zeroCostProductId,
          quantity: '1',
          unitPrice: '7.00',
          warehouseId: warehouseAId,
        },
      ],
      status: 'IN_TRANSIT',
    });

    const item = await client.saleItem.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(item.unitCostSnapshot?.toString()).toBe('0');
    expect(item.unitPriceSnapshot?.toString()).toBe('7');

    const audit = await client.auditLog.findFirstOrThrow({
      where: { action: 'sales.created', entityId: sale.id },
    });
    const metadata = audit.metadata as {
      priceOverrides: {
        appliedUnitPrice: string;
        referenceUnitPrice: string;
      }[];
    };
    expect(metadata.priceOverrides).toHaveLength(1);
    expect(metadata.priceOverrides[0]?.referenceUnitPrice).toBe('3.00');
    expect(metadata.priceOverrides[0]?.appliedUnitPrice).toBe('7.00');
    expect(JSON.stringify(audit.metadata)).not.toContain('idempotency');
  });

  it('rejects the whole sale for a missing balance, cost, or price', async () => {
    await expect(
      creation.create(sellerId, randomUUID() + randomUUID(), {
        businessDate: '2026-08-27',
        items: [
          { productId: productBId, quantity: '1', warehouseId: warehouseBId },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('SALE_BALANCE_NOT_FOUND'));

    await expect(
      creation.create(sellerId, randomUUID() + randomUUID(), {
        businessDate: '2026-08-27',
        items: [
          {
            productId: nullCostProductId,
            quantity: '1',
            warehouseId: warehouseAId,
          },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('SALE_COST_MISSING'));

    await expect(
      creation.create(sellerId, randomUUID() + randomUUID(), {
        businessDate: '2026-08-27',
        items: [
          {
            productId: nullPriceProductId,
            quantity: '1',
            warehouseId: warehouseAId,
          },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('SALE_PRICE_MISSING'));
  });

  it('uses the reference price when the null-price product gets an override', async () => {
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        {
          productId: nullPriceProductId,
          quantity: '1',
          unitPrice: '5.00',
          warehouseId: warehouseAId,
        },
      ],
      status: 'IN_TRANSIT',
    });
    expect(sale.subtotal).toBe('5.00');
  });

  it('rejects insufficient stock without any partial write', async () => {
    const before = await balanceQuantity(productBId, warehouseAId);
    const salesBefore = await client.sale.count();
    await expect(
      creation.create(sellerId, randomUUID() + randomUUID(), {
        businessDate: '2026-08-27',
        items: [
          {
            productId: productBId,
            quantity: '9999',
            warehouseId: warehouseAId,
          },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('SALE_INSUFFICIENT_STOCK'));
    expect(await balanceQuantity(productBId, warehouseAId)).toBe(before);
    expect(await client.sale.count()).toBe(salesBefore);
  });

  it('aggregates repeated product/warehouse lines and keeps one movement per line', async () => {
    const balanceBefore = await client.inventoryBalance.findUniqueOrThrow({
      select: { quantity: true, version: true },
      where: {
        productId_warehouseId: {
          productId: productAId,
          warehouseId: warehouseAId,
        },
      },
    });
    const before = Number(balanceBefore.quantity.toString());
    const sale = await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
        { productId: productAId, quantity: '2', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });

    expect(sale.items).toHaveLength(2);
    const movements = await client.inventoryMovement.findMany({
      orderBy: { balanceBefore: 'desc' },
      where: { sourceId: sale.id },
    });
    expect(
      movements.map((movement) => ({
        after: movement.balanceAfter.toString(),
        before: movement.balanceBefore.toString(),
        delta: movement.quantityDelta.toString(),
      })),
    ).toEqual([
      { after: String(before - 1), before: String(before), delta: '-1' },
      { after: String(before - 3), before: String(before - 1), delta: '-2' },
    ]);
    const balanceAfter = await client.inventoryBalance.findUniqueOrThrow({
      select: { quantity: true, version: true },
      where: {
        productId_warehouseId: {
          productId: productAId,
          warehouseId: warehouseAId,
        },
      },
    });
    expect(Number(balanceAfter.quantity.toString())).toBe(before - 3);
    expect(balanceAfter.version).toBe(balanceBefore.version + 1);
  });

  it('replays the same key and payload without a second effect', async () => {
    const key = randomUUID() + randomUUID();
    const payload = {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT' as const,
    };
    const first = await creation.create(sellerId, key, payload);
    const balanceAfterFirst = await balanceQuantity(productAId, warehouseAId);
    const movementsAfterFirst = await client.inventoryMovement.count();
    const auditsAfterFirst = await client.auditLog.count();

    const replay = await creation.create(sellerId, key, payload);
    expect(replay.id).toBe(first.id);
    expect(replay.saleNumber).toBe(first.saleNumber);
    expect(await balanceQuantity(productAId, warehouseAId)).toBe(
      balanceAfterFirst,
    );
    expect(await client.inventoryMovement.count()).toBe(movementsAfterFirst);
    expect(await client.auditLog.count()).toBe(auditsAfterFirst);
  });

  it('rejects the same key with a different payload', async () => {
    const key = randomUUID() + randomUUID();
    await creation.create(sellerId, key, {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });
    await expect(
      creation.create(sellerId, key, {
        businessDate: '2026-08-27',
        items: [
          { productId: productAId, quantity: '2', warehouseId: warehouseAId },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('IDEMPOTENCY_KEY_REUSED'));
  });

  it('requires a valid idempotency key', async () => {
    const payload = {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT' as const,
    };
    await expect(creation.create(sellerId, undefined, payload)).rejects.toThrow(
      new SaleError('IDEMPOTENCY_KEY_REQUIRED'),
    );
    await expect(creation.create(sellerId, 'short', payload)).rejects.toThrow(
      new SaleError('IDEMPOTENCY_KEY_INVALID'),
    );
  });

  it('denies an actor without sales.create', async () => {
    await expect(
      creation.create(noPermissionUserId, randomUUID() + randomUUID(), {
        businessDate: '2026-08-27',
        items: [
          { productId: productAId, quantity: '1', warehouseId: warehouseAId },
        ],
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(new SaleError('SALES_PERMISSION_DENIED'));
  });

  it('never creates, copies, or modifies a product warehouse valuation', async () => {
    const before = await client.productWarehouseValuation.count();
    await creation.create(sellerId, randomUUID() + randomUUID(), {
      businessDate: '2026-08-27',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
      ],
      status: 'IN_TRANSIT',
    });
    expect(await client.productWarehouseValuation.count()).toBe(before);
  });
});
