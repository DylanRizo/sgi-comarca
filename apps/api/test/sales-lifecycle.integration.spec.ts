import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { SaleError } from '../src/sales/sale.errors.js';
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

describe('FASE 7B.4 sale lifecycle', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let creation!: CreateSaleService;
  let lifecycle!: SaleLifecycleService;
  let databaseName: string;
  let sellerId: string;
  let cancellerId: string;
  let warehouseId: string;
  let productId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function newSale(quantity = '1'): Promise<string> {
    const sale = await creation.create(sellerId, key(), {
      businessDate: '2026-08-27',
      items: [{ productId, quantity, warehouseId }],
      status: 'IN_TRANSIT',
    });
    return sale.id;
  }

  async function balanceQuantity(): Promise<number> {
    const balance = await client.inventoryBalance.findUniqueOrThrow({
      select: { quantity: true },
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return Number(balance.quantity.toString());
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase7b4_' +
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
    lifecycle = new SaleLifecycleService(client);

    const salesRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'SALES' },
    });
    const seller = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic seller',
        loginIdentifier: 'phase7b4-seller',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    sellerId = seller.id;
    await client.userRole.create({
      data: { roleId: salesRole.id, userId: sellerId },
    });

    // sales.cancel is a direct grant only, never a role grant.
    const canceller = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic canceller',
        loginIdentifier: 'phase7b4-canceller',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    cancellerId = canceller.id;
    await client.userRole.create({
      data: { roleId: salesRole.id, userId: cancellerId },
    });
    const cancelPermission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'sales.cancel' },
    });
    await client.userPermission.create({
      data: {
        effect: 'GRANT',
        grantedByUserId: sellerId,
        permissionId: cancelPermission.id,
        userId: cancellerId,
      },
    });

    const warehouse = await client.warehouse.create({
      data: { active: true, code: 'P7B4-W', name: 'Phase 7B4 warehouse' },
      select: { id: true },
    });
    warehouseId = warehouse.id;
    const product = await client.product.create({
      data: { active: true, code: 'P7B4-A', name: 'Phase 7B4 product' },
      select: { id: true },
    });
    productId = product.id;
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId,
        quantity: '1000',
        warehouseId,
      },
    });
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

  it('confirms an in-transit sale without touching inventory or payment', async () => {
    const saleId = await newSale();
    const stockBefore = await balanceQuantity();
    const movementsBefore = await client.inventoryMovement.count();

    const confirmed = await lifecycle.confirmInTransit(sellerId, saleId, key());

    expect(confirmed.status).toBe('COMPLETED');
    expect(confirmed.paymentStatus).toBe('PENDING');
    expect(confirmed.completedAt).not.toBeNull();
    expect(await balanceQuantity()).toBe(stockBefore);
    expect(await client.inventoryMovement.count()).toBe(movementsBefore);

    const confirmation = await client.inTransitConfirmation.findUniqueOrThrow({
      where: { saleId },
    });
    const sale = await client.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.completedAt?.toISOString()).toBe(
      confirmation.confirmedAt.toISOString(),
    );

    const audits = await client.auditLog.findMany({
      where: { action: 'sales.in_transit_confirmed', entityId: saleId },
    });
    expect(audits).toHaveLength(1);
  });

  it('replays a confirmation without a second document or audit event', async () => {
    const saleId = await newSale();
    const idempotencyKey = key();
    await lifecycle.confirmInTransit(sellerId, saleId, idempotencyKey);
    const audits = await client.auditLog.count();

    const replay = await lifecycle.confirmInTransit(
      sellerId,
      saleId,
      idempotencyKey,
    );
    expect(replay.status).toBe('COMPLETED');
    expect(await client.auditLog.count()).toBe(audits);
    expect(
      await client.inTransitConfirmation.count({ where: { saleId } }),
    ).toBe(1);
  });

  it('rejects confirming an already completed sale with a new key', async () => {
    const saleId = await newSale();
    await lifecycle.confirmInTransit(sellerId, saleId, key());
    const confirmations = await client.inTransitConfirmation.count({
      where: { saleId },
    });
    const again = await lifecycle.confirmInTransit(sellerId, saleId, key());
    expect(again.status).toBe('COMPLETED');
    expect(
      await client.inTransitConfirmation.count({ where: { saleId } }),
    ).toBe(confirmations);
  });

  it('cancels a pending in-transit sale and restores stock exactly once', async () => {
    const saleId = await newSale('3');
    const stockAfterSale = await balanceQuantity();

    const cancelled = await lifecycle.cancel(
      cancellerId,
      saleId,
      'Cliente desistio',
      key(),
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.paymentStatus).toBe('PENDING');
    expect(cancelled.completedAt).toBeNull();
    expect(await balanceQuantity()).toBe(stockAfterSale + 3);

    const movements = await client.inventoryMovement.findMany({
      where: { sourceId: saleId, type: 'SALE_CANCELLATION' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.quantityDelta.toString()).toBe('3');
    expect(movements[0]?.actorUserId).toBe(cancellerId);

    const audits = await client.auditLog.findMany({
      where: { action: 'sales.cancelled', entityId: saleId },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.metadata)).not.toContain('idempotency');
  });

  it('does not restore stock twice on a repeated cancellation', async () => {
    const saleId = await newSale('2');
    await lifecycle.cancel(cancellerId, saleId, 'Primera', key());
    const stockAfterCancel = await balanceQuantity();
    const movements = await client.inventoryMovement.count();

    const again = await lifecycle.cancel(cancellerId, saleId, 'Segunda', key());
    expect(again.status).toBe('CANCELLED');
    expect(await balanceQuantity()).toBe(stockAfterCancel);
    expect(await client.inventoryMovement.count()).toBe(movements);
    expect(await client.saleCancellation.count({ where: { saleId } })).toBe(1);
  });

  it('refuses to cancel a completed sale', async () => {
    const saleId = await newSale();
    await lifecycle.confirmInTransit(sellerId, saleId, key());
    await expect(
      lifecycle.cancel(cancellerId, saleId, 'Tarde', key()),
    ).rejects.toThrow(new SaleError('SALE_INVALID_STATE'));
  });

  it('refuses to confirm a cancelled sale', async () => {
    const saleId = await newSale();
    await lifecycle.cancel(cancellerId, saleId, 'Anulada', key());
    await expect(
      lifecycle.confirmInTransit(sellerId, saleId, key()),
    ).rejects.toThrow(new SaleError('SALE_INVALID_STATE'));
  });

  it('denies cancellation to a SALES role without the direct grant', async () => {
    const saleId = await newSale();
    await expect(
      lifecycle.cancel(sellerId, saleId, 'Sin permiso', key()),
    ).rejects.toThrow(new SaleError('SALES_PERMISSION_DENIED'));
  });

  it('rejects a reused key with a different payload', async () => {
    const saleId = await newSale();
    const other = await newSale();
    const idempotencyKey = key();
    await lifecycle.cancel(cancellerId, saleId, 'Motivo A', idempotencyKey);
    await expect(
      lifecycle.cancel(cancellerId, other, 'Motivo B', idempotencyKey),
    ).rejects.toThrow(new SaleError('IDEMPOTENCY_KEY_REUSED'));
  });

  it('requires a non-empty reason and a valid key', async () => {
    const saleId = await newSale();
    await expect(
      lifecycle.cancel(cancellerId, saleId, '   ', key()),
    ).rejects.toThrow(new SaleError('SALES_REQUEST_INVALID'));
    await expect(
      lifecycle.cancel(cancellerId, saleId, 'Motivo', undefined),
    ).rejects.toThrow(new SaleError('IDEMPOTENCY_KEY_REQUIRED'));
  });

  it('reports a missing sale', async () => {
    await expect(
      lifecycle.confirmInTransit(sellerId, randomUUID(), key()),
    ).rejects.toThrow(new SaleError('SALE_NOT_FOUND'));
  });
});
