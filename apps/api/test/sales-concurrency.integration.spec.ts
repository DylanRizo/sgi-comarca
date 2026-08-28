import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryAdjustmentService } from '../src/inventory/inventory-adjustment.service.js';
import { InventoryTransferService } from '../src/inventory/inventory-transfer.service.js';
import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { SaleLifecycleService } from '../src/sales/sale-lifecycle.service.js';
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

function key(): string {
  return randomUUID() + randomUUID();
}

describe('FASE 7B sales concurrency', () => {
  let administrator!: DatabaseClient;
  let adjustments!: InventoryAdjustmentService;
  let client!: DatabaseClient;
  let creation!: CreateSaleService;
  let databaseName: string;
  let lifecycle!: SaleLifecycleService;
  let operatorId: string;
  let transfers!: InventoryTransferService;
  let warehouseAId: string;
  let warehouseBId: string;
  let productSequence = 0;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function createProduct(label: string): Promise<string> {
    productSequence += 1;
    return (
      await client.product.create({
        data: {
          active: true,
          code: `P7BC-${productSequence.toString().padStart(2, '0')}`,
          name: `Phase 7B concurrency ${label}`,
        },
        select: { id: true },
      })
    ).id;
  }

  async function seedBalance(
    productId: string,
    warehouseId: string,
    quantity: string,
  ): Promise<void> {
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId,
        quantity,
        warehouseId,
      },
    });
  }

  async function balance(
    productId: string,
    warehouseId: string,
  ): Promise<number> {
    return Number(
      (
        await client.inventoryBalance.findUniqueOrThrow({
          select: { quantity: true },
          where: { productId_warehouseId: { productId, warehouseId } },
        })
      ).quantity.toString(),
    );
  }

  async function createInTransitSale(
    productId: string,
    warehouseId: string,
    quantity: string,
  ) {
    return creation.create(operatorId, key(), {
      businessDate: '2026-08-28',
      items: [{ productId, quantity, warehouseId }],
      status: 'IN_TRANSIT',
    });
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase7bc_' +
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

    const salesRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'SALES' },
    });
    operatorId = (
      await client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Phase 7B concurrency operator',
          loginIdentifier: 'phase7b-concurrency-operator',
          status: 'ACTIVE',
        },
        select: { id: true },
      })
    ).id;
    await client.userRole.create({
      data: { roleId: salesRole.id, userId: operatorId },
    });
    const directPermissions = await client.permission.findMany({
      select: { id: true },
      where: {
        code: { in: ['inventory.adjust', 'sales.cancel', 'transfers.create'] },
      },
    });
    expect(directPermissions).toHaveLength(3);
    await client.userPermission.createMany({
      data: directPermissions.map(({ id }) => ({
        effect: 'GRANT' as const,
        grantedByUserId: operatorId,
        permissionId: id,
        userId: operatorId,
      })),
    });

    const [warehouseA, warehouseB] = await Promise.all(
      ['A', 'B'].map((suffix) =>
        client.warehouse.create({
          data: {
            active: true,
            code: `P7BC-W-${suffix}`,
            name: `Phase 7B concurrency warehouse ${suffix}`,
          },
          select: { id: true },
        }),
      ),
    );
    warehouseAId = warehouseA!.id;
    warehouseBId = warehouseB!.id;

    adjustments = new InventoryAdjustmentService(client);
    creation = new CreateSaleService(client);
    lifecycle = new SaleLifecycleService(client);
    transfers = new InventoryTransferService(client);
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

  it('serializes two sales when stock is sufficient for only one', async () => {
    const productId = await createProduct('limited stock');
    await seedBalance(productId, warehouseAId, '5');
    const input = {
      businessDate: '2026-08-28',
      items: [{ productId, quantity: '4', warehouseId: warehouseAId }],
      status: 'IN_TRANSIT' as const,
    };

    const results = await Promise.allSettled([
      creation.create(operatorId, key(), input),
      creation.create(operatorId, key(), input),
    ]);
    const fulfilled = results.filter(({ status }) => status === 'fulfilled');
    const rejected = results.filter(({ status }) => status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: 'SALE_INSUFFICIENT_STOCK' },
    });
    expect(await balance(productId, warehouseAId)).toBe(1);
    expect(
      await client.inventoryMovement.count({
        where: { productId, type: 'SALE' },
      }),
    ).toBe(1);
  });

  it('serializes a sale and an adjustment on the same balance', async () => {
    const productId = await createProduct('sale adjustment');
    await seedBalance(productId, warehouseAId, '10');

    const results = await Promise.allSettled([
      createInTransitSale(productId, warehouseAId, '8'),
      adjustments.adjust(operatorId, {
        productId,
        quantityDelta: '-3',
        reason: 'Concurrent controlled adjustment',
        warehouseId: warehouseAId,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect([2, 7]).toContain(await balance(productId, warehouseAId));
    expect(await balance(productId, warehouseAId)).toBeGreaterThanOrEqual(0);
  });

  it('serializes a sale and a transfer on the same balance', async () => {
    const productId = await createProduct('sale transfer');
    await seedBalance(productId, warehouseAId, '10');
    await seedBalance(productId, warehouseBId, '0');

    const results = await Promise.allSettled([
      createInTransitSale(productId, warehouseAId, '8'),
      transfers.transfer(operatorId, key(), {
        fromWarehouseId: warehouseAId,
        productId,
        quantity: '3',
        reason: 'Concurrent controlled transfer',
        toWarehouseId: warehouseBId,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const source = await balance(productId, warehouseAId);
    const destination = await balance(productId, warehouseBId);
    expect([
      [2, 0],
      [7, 3],
    ]).toContainEqual([source, destination]);
  });

  it('locks crossed multi-pair sales independently of item input order', async () => {
    const productAId = await createProduct('crossed A');
    const productBId = await createProduct('crossed B');
    await seedBalance(productAId, warehouseAId, '10');
    await seedBalance(productBId, warehouseBId, '10');
    const first = {
      businessDate: '2026-08-28',
      items: [
        { productId: productAId, quantity: '1', warehouseId: warehouseAId },
        { productId: productBId, quantity: '1', warehouseId: warehouseBId },
      ],
      status: 'IN_TRANSIT' as const,
    };
    const second = {
      ...first,
      items: [...first.items].reverse(),
    };

    const sales = await Promise.all([
      creation.create(operatorId, key(), first),
      creation.create(operatorId, key(), second),
    ]);

    expect(sales).toHaveLength(2);
    expect(await balance(productAId, warehouseAId)).toBe(8);
    expect(await balance(productBId, warehouseBId)).toBe(8);
  });

  it('serializes a sale with cancellation of another sale on the same pairs', async () => {
    const productAId = await createProduct('sale cancellation A');
    const productBId = await createProduct('sale cancellation B');
    await seedBalance(productAId, warehouseAId, '10');
    await seedBalance(productBId, warehouseBId, '10');
    const existing = await creation.create(operatorId, key(), {
      businessDate: '2026-08-28',
      items: [
        { productId: productAId, quantity: '4', warehouseId: warehouseAId },
        { productId: productBId, quantity: '4', warehouseId: warehouseBId },
      ],
      status: 'IN_TRANSIT',
    });

    const [created, cancelled] = await Promise.all([
      creation.create(operatorId, key(), {
        businessDate: '2026-08-28',
        items: [
          { productId: productBId, quantity: '6', warehouseId: warehouseBId },
          { productId: productAId, quantity: '6', warehouseId: warehouseAId },
        ],
        status: 'IN_TRANSIT',
      }),
      lifecycle.cancel(
        operatorId,
        existing.id,
        'Concurrent controlled cancellation',
        key(),
      ),
    ]);

    expect(created.status).toBe('IN_TRANSIT');
    expect(cancelled.status).toBe('CANCELLED');
    expect(await balance(productAId, warehouseAId)).toBe(4);
    expect(await balance(productBId, warehouseBId)).toBe(4);
    expect(
      await client.inventoryMovement.count({
        where: { sourceId: existing.id, type: 'SALE_CANCELLATION' },
      }),
    ).toBe(2);
  });

  it('allows exactly one of confirmation and cancellation for the same sale', async () => {
    const productId = await createProduct('confirm cancel');
    await seedBalance(productId, warehouseAId, '10');
    const sale = await createInTransitSale(productId, warehouseAId, '3');

    const results = await Promise.allSettled([
      lifecycle.confirmInTransit(operatorId, sale.id, key()),
      lifecycle.cancel(
        operatorId,
        sale.id,
        'Concurrent lifecycle cancellation',
        key(),
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const persisted = await client.sale.findUniqueOrThrow({
      select: { status: true },
      where: { id: sale.id },
    });
    const confirmations = await client.inTransitConfirmation.count({
      where: { saleId: sale.id },
    });
    const cancellations = await client.saleCancellation.count({
      where: { saleId: sale.id },
    });
    expect(confirmations + cancellations).toBe(1);
    if (persisted.status === 'COMPLETED') {
      expect(confirmations).toBe(1);
      expect(await balance(productId, warehouseAId)).toBe(7);
    } else {
      expect(persisted.status).toBe('CANCELLED');
      expect(cancellations).toBe(1);
      expect(await balance(productId, warehouseAId)).toBe(10);
    }
  });

  it('deduplicates concurrent double confirmation', async () => {
    const productId = await createProduct('double confirm');
    await seedBalance(productId, warehouseAId, '10');
    const sale = await createInTransitSale(productId, warehouseAId, '2');

    const results = await Promise.all([
      lifecycle.confirmInTransit(operatorId, sale.id, key()),
      lifecycle.confirmInTransit(operatorId, sale.id, key()),
    ]);

    expect(results.every(({ status }) => status === 'COMPLETED')).toBe(true);
    expect(
      await client.inTransitConfirmation.count({ where: { saleId: sale.id } }),
    ).toBe(1);
    expect(
      await client.auditLog.count({
        where: { action: 'sales.in_transit_confirmed', entityId: sale.id },
      }),
    ).toBe(1);
    expect(await balance(productId, warehouseAId)).toBe(8);
  });

  it('deduplicates concurrent double cancellation and restores once', async () => {
    const productId = await createProduct('double cancel');
    await seedBalance(productId, warehouseAId, '10');
    const sale = await createInTransitSale(productId, warehouseAId, '2');

    const results = await Promise.all([
      lifecycle.cancel(operatorId, sale.id, 'Concurrent reason A', key()),
      lifecycle.cancel(operatorId, sale.id, 'Concurrent reason B', key()),
    ]);

    expect(results.every(({ status }) => status === 'CANCELLED')).toBe(true);
    expect(
      await client.saleCancellation.count({ where: { saleId: sale.id } }),
    ).toBe(1);
    expect(
      await client.inventoryMovement.count({
        where: { sourceId: sale.id, type: 'SALE_CANCELLATION' },
      }),
    ).toBe(1);
    expect(
      await client.auditLog.count({
        where: { action: 'sales.cancelled', entityId: sale.id },
      }),
    ).toBe(1);
    expect(await balance(productId, warehouseAId)).toBe(10);
  });

  it('deduplicates the same creation key and payload under concurrency', async () => {
    const productId = await createProduct('same key');
    await seedBalance(productId, warehouseAId, '8');
    const idempotencyKey = key();
    const input = {
      businessDate: '2026-08-28',
      items: [{ productId, quantity: '3', warehouseId: warehouseAId }],
      status: 'IN_TRANSIT' as const,
    };

    const [first, replay] = await Promise.all([
      creation.create(operatorId, idempotencyKey, input),
      creation.create(operatorId, idempotencyKey, input),
    ]);

    expect(replay.id).toBe(first.id);
    expect(await balance(productId, warehouseAId)).toBe(5);
    expect(
      await client.inventoryMovement.count({
        where: { sourceId: first.id, type: 'SALE' },
      }),
    ).toBe(1);
    expect(
      await client.auditLog.count({
        where: { action: 'sales.created', entityId: first.id },
      }),
    ).toBe(1);
  });
});
