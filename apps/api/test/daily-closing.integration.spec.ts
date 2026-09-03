import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClosingPreviewService } from '../src/finances/closing-preview.service.js';
import { CreateFinancialEntryService } from '../src/finances/create-financial-entry.service.js';
import { DailyClosingService } from '../src/finances/daily-closing.service.js';
import { FinanceError } from '../src/finances/finance.errors.js';
import { CreateSaleService } from '../src/sales/create-sale.service.js';
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

describe('FASE 8B.4 daily closing lifecycle', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let closings!: DailyClosingService;
  let previews!: ClosingPreviewService;
  let entries!: CreateFinancialEntryService;
  let sales!: CreateSaleService;
  let databaseName: string;
  let financeUserId: string;
  let outsiderId: string;
  let sellerId: string;
  let productId: string;
  let warehouseId: string;
  let now = new Date('2026-09-10T12:00:00.000Z');
  const originalDatabaseUrl = process.env.DATABASE_URL;

  function request(businessDate: string, realCash = '0.00') {
    return {
      businessDate,
      observations: `Closing ${businessDate}`,
      realCash,
      realDigital: '0.00',
    };
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase8b4_' +
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

    closings = new DailyClosingService(
      client,
      { reopeningWindowDays: 30, tolerance: '0.50' },
      undefined,
      { now: () => new Date(now) },
    );
    previews = new ClosingPreviewService(client, '0.50');
    entries = new CreateFinancialEntryService(client);
    sales = new CreateSaleService(client, undefined, {
      now: () => new Date(now),
    });

    const [financeRole, salesRole] = await Promise.all([
      client.role.findUniqueOrThrow({
        select: { id: true },
        where: { code: 'FINANCE' },
      }),
      client.role.findUniqueOrThrow({
        select: { id: true },
        where: { code: 'SALES' },
      }),
    ]);
    const [financeUser, outsider, seller] = await Promise.all([
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Synthetic closing operator',
          loginIdentifier: 'phase8b4-finance',
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Synthetic closing outsider',
          loginIdentifier: 'phase8b4-outsider',
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      client.user.create({
        data: {
          activatedAt: new Date(),
          displayName: 'Synthetic closing seller',
          loginIdentifier: 'phase8b4-seller',
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    financeUserId = financeUser.id;
    outsiderId = outsider.id;
    sellerId = seller.id;
    await Promise.all([
      client.userRole.create({
        data: { roleId: financeRole.id, userId: financeUserId },
      }),
      client.userRole.create({
        data: { roleId: salesRole.id, userId: sellerId },
      }),
    ]);

    const [warehouse, product] = await Promise.all([
      client.warehouse.create({
        data: {
          active: true,
          code: 'P8B4-W',
          name: 'Phase 8B4 warehouse',
        },
        select: { id: true },
      }),
      client.product.create({
        data: {
          active: true,
          code: 'P8B4-P',
          name: 'Phase 8B4 product',
        },
        select: { id: true },
      }),
    ]);
    warehouseId = warehouse.id;
    productId = product.id;
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId,
        quantity: '100',
        warehouseId,
      },
    });
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

  it('creates a zero-sales closing with a stable civil date and audit', async () => {
    now = new Date('2026-09-10T12:00:00.000Z');
    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-09-10'),
    );

    expect(closing).toMatchObject({
      balanced: true,
      businessDate: '2026-09-10',
      difference: '0.00',
      inTransitSaleCount: 0,
      realCash: '0.00',
      realDigital: '0.00',
      status: 'CLOSED',
      systemSales: '0.00',
      toleranceApplied: '0.50',
    });
    expect(
      await client.auditLog.count({
        where: { action: 'closings.created', entityId: closing.id },
      }),
    ).toBe(1);
  });

  it('previews the same figures the closing will record', async () => {
    // The whole point: if the preview and the closing disagreed, a partner
    // would count the drawer against one number and the system would store
    // another. Both read through the same query.
    now = new Date('2026-10-02T14:00:00.000Z');
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-02',
      items: [{ productId, quantity: '2', warehouseId }],
      paymentMethodText: 'Efectivo',
      status: 'COMPLETED',
    });
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-02',
      items: [{ productId, quantity: '1', warehouseId }],
      status: 'IN_TRANSIT',
    });

    const preview = await previews.preview('2026-10-02');
    expect(preview.alreadyClosed).toBe(false);
    expect(preview.existingClosingId).toBeNull();
    expect(preview.inTransitSaleCount).toBe(1);
    expect(preview.tolerance).toBe('0.50');

    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-10-02', preview.systemSales),
    );
    expect(closing.systemSales).toBe(preview.systemSales);
    expect(closing.inTransitSaleCount).toBe(preview.inTransitSaleCount);
    expect(closing.balanced).toBe(true);
  });

  it('splits each seller by how the sale was paid', async () => {
    now = new Date('2026-10-03T14:00:00.000Z');
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-03',
      items: [{ productId, quantity: '2', warehouseId }],
      paymentMethodText: 'Efectivo',
      sellerUserId: sellerId,
      status: 'COMPLETED',
    });
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-03',
      items: [{ productId, quantity: '1', warehouseId }],
      paymentMethodText: 'Digital',
      sellerUserId: sellerId,
      status: 'COMPLETED',
    });

    const preview = await previews.preview('2026-10-03');
    expect(preview.bySeller).toHaveLength(1);
    const seller = preview.bySeller[0];
    expect(seller?.sellerUserId).toBe(sellerId);
    expect(seller?.sellerName).not.toBe('');
    expect(seller?.cashAmount).toBe('20.00');
    expect(seller?.digitalAmount).toBe('10.00');
    expect(seller?.unspecifiedAmount).toBe('0.00');
    expect(seller?.totalAmount).toBe('30.00');
    expect(seller?.saleCount).toBe(2);
  });

  it('reports an unstated payment method instead of assuming digital', async () => {
    // The legacy system folded anything not marked cash into digital, which
    // silently overstated it. An unknown method is reported as unknown.
    now = new Date('2026-10-04T14:00:00.000Z');
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-04',
      items: [{ productId, quantity: '3', warehouseId }],
      sellerUserId: sellerId,
      status: 'COMPLETED',
    });

    const seller = (await previews.preview('2026-10-04')).bySeller[0];
    expect(seller?.unspecifiedAmount).toBe('30.00');
    expect(seller?.digitalAmount).toBe('0.00');
    expect(seller?.cashAmount).toBe('0.00');
  });

  it('warns that the date is already closed, and points at the closing', async () => {
    now = new Date('2026-10-05T14:00:00.000Z');
    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-10-05', '0.00'),
    );

    const preview = await previews.preview('2026-10-05');
    expect(preview.alreadyClosed).toBe(true);
    expect(preview.existingClosingId).toBe(closing.id);
    expect(preview.existingClosingStatus).toBe('CLOSED');
  });

  it('lists the day expenses without letting them move the balance', async () => {
    // DEC-023: expenses are context for counting physical cash, never part of
    // the difference.
    now = new Date('2026-10-06T14:00:00.000Z');
    await sales.create(sellerId, key(), {
      businessDate: '2026-10-06',
      items: [{ productId, quantity: '1', warehouseId }],
      status: 'COMPLETED',
    });
    const category = await client.financialCategory.create({
      data: {
        active: true,
        code: 'TEST-COMBUSTIBLE',
        entryType: 'EXPENSE',
        name: 'Combustible',
      },
      select: { id: true, name: true },
    });
    // Through the real service, so the expense satisfies the FASE 8A shape
    // constraints exactly as a recorded one does.
    await entries.create(financeUserId, key(), {
      amount: '7.50',
      businessDate: '2026-10-06',
      categoryId: category.id,
      description: 'Combustible',
      entryType: 'EXPENSE',
      responsibleUserId: financeUserId,
    });

    const preview = await previews.preview('2026-10-06');
    expect(preview.totalExpenses).toBe('7.50');
    expect(preview.dayExpenses).toHaveLength(1);
    expect(preview.dayExpenses[0]?.description).toBe('Combustible');
    expect(preview.dayExpenses[0]?.categoryName).toBe(category.name);

    // The expense is listed, and the balance still ignores it entirely.
    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-10-06', preview.systemSales),
    );
    expect(closing.balanced).toBe(true);
    expect(closing.difference).toBe('0.00');
  });

  it('freezes completed sales and counts in-transit sales separately', async () => {
    now = new Date('2026-09-11T14:00:00.000Z');
    await sales.create(sellerId, key(), {
      businessDate: '2026-09-11',
      items: [{ productId, quantity: '2', warehouseId }],
      status: 'COMPLETED',
    });
    await sales.create(sellerId, key(), {
      businessDate: '2026-09-11',
      items: [{ productId, quantity: '1', warehouseId }],
      status: 'IN_TRANSIT',
    });

    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-09-11', '20.00'),
    );

    expect(closing.systemSales).toBe('20.00');
    expect(closing.inTransitSaleCount).toBe(1);
    expect(closing.difference).toBe('0.00');
    expect(closing.balanced).toBe(true);
  });

  it('reports in-transit sales without touching them or inventory', async () => {
    now = new Date('2026-09-18T14:00:00.000Z');
    const inTransit = await sales.create(sellerId, key(), {
      businessDate: '2026-09-18',
      items: [{ productId, quantity: '4', warehouseId }],
      status: 'IN_TRANSIT',
    });
    const movementsBefore = await client.inventoryMovement.count();
    const balanceBefore = await client.inventoryBalance.findFirstOrThrow({
      select: { quantity: true, version: true },
      where: { productId, warehouseId },
    });

    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-09-18', '0.00'),
    );
    expect(closing.inTransitSaleCount).toBe(1);

    // DEC-019: unlike the legacy behaviour, a closing never cancels an
    // in-transit sale and never moves stock as a side effect.
    const sale = await client.sale.findUniqueOrThrow({
      select: { completedAt: true, paymentStatus: true, status: true },
      where: { id: inTransit.id },
    });
    expect(sale.status).toBe('IN_TRANSIT');
    expect(sale.paymentStatus).toBe('PENDING');
    expect(sale.completedAt).toBeNull();
    expect(
      await client.saleCancellation.count({ where: { saleId: inTransit.id } }),
    ).toBe(0);
    expect(await client.inventoryMovement.count()).toBe(movementsBefore);

    const balanceAfter = await client.inventoryBalance.findFirstOrThrow({
      select: { quantity: true, version: true },
      where: { productId, warehouseId },
    });
    expect(balanceAfter.quantity.toString()).toBe(
      balanceBefore.quantity.toString(),
    );
    expect(balanceAfter.version).toBe(balanceBefore.version);
  });

  it('replays a create request and rejects a changed payload or date collision', async () => {
    now = new Date('2026-09-12T12:00:00.000Z');
    const idempotencyKey = key();
    const payload = request('2026-09-12');
    const first = await closings.create(financeUserId, idempotencyKey, payload);
    const closingCount = await client.dailyClosing.count();
    const auditCount = await client.auditLog.count({
      where: { action: 'closings.created', entityId: first.id },
    });

    const replay = await closings.create(
      financeUserId,
      idempotencyKey,
      payload,
    );
    expect(replay.id).toBe(first.id);
    expect(await client.dailyClosing.count()).toBe(closingCount);
    expect(
      await client.auditLog.count({
        where: { action: 'closings.created', entityId: first.id },
      }),
    ).toBe(auditCount);
    await expect(
      closings.create(
        financeUserId,
        idempotencyKey,
        request('2026-09-12', '1.00'),
      ),
    ).rejects.toThrow(new FinanceError('FINANCE_CONCURRENCY_CONFLICT'));
    await expect(
      closings.create(financeUserId, key(), payload),
    ).rejects.toThrow(new FinanceError('CLOSING_ALREADY_EXISTS'));
  });

  it('denies invalid keys and actors without the closing permissions', async () => {
    await expect(
      closings.create(financeUserId, 'short', request('2026-09-20')),
    ).rejects.toThrow(new FinanceError('CLOSING_REQUEST_INVALID'));
    await expect(
      closings.create(outsiderId, key(), request('2026-09-20')),
    ).rejects.toThrow(new FinanceError('CLOSING_PERMISSION_DENIED'));
    await expect(
      closings.reopen(outsiderId, randomUUID(), 'Reason', key()),
    ).rejects.toThrow(new FinanceError('CLOSING_PERMISSION_DENIED'));
  });

  it('reopens inside the window without changing frozen figures', async () => {
    now = new Date('2026-09-14T08:00:00.000Z');
    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-09-13', '4.00'),
    );
    const before = await client.dailyClosing.findUniqueOrThrow({
      where: { id: closing.id },
    });
    const idempotencyKey = key();

    const reopened = await closings.reopen(
      financeUserId,
      closing.id,
      '  Conteo corregido  ',
      idempotencyKey,
    );
    const after = await client.dailyClosing.findUniqueOrThrow({
      where: { id: closing.id },
    });

    expect(reopened.status).toBe('REOPENED');
    expect(reopened.reopenings).toHaveLength(1);
    expect(reopened.reopenings[0]?.reason).toBe('Conteo corregido');
    expect(after.businessDate).toEqual(before.businessDate);
    expect(after.realCash).toEqual(before.realCash);
    expect(after.realDigital).toEqual(before.realDigital);
    expect(after.systemSales).toEqual(before.systemSales);
    expect(after.difference).toEqual(before.difference);
    expect(after.toleranceApplied).toEqual(before.toleranceApplied);
    expect(after.balanced).toBe(before.balanced);
    expect(after.status).toBe('REOPENED');
    expect(
      await client.auditLog.count({
        where: { action: 'closings.reopened', entityId: closing.id },
      }),
    ).toBe(1);

    const replay = await closings.reopen(
      financeUserId,
      closing.id,
      'Conteo corregido',
      idempotencyKey,
    );
    expect(replay.status).toBe('REOPENED');
    expect(replay.reopenings).toHaveLength(1);
    expect(
      await client.dailyClosingReopening.count({
        where: { closingId: closing.id },
      }),
    ).toBe(1);
  });

  it('rejects a second reopening with a new key', async () => {
    now = new Date('2026-09-15T08:00:00.000Z');
    const closing = await closings.create(
      financeUserId,
      key(),
      request('2026-09-14'),
    );
    await closings.reopen(financeUserId, closing.id, 'First reason', key());

    await expect(
      closings.reopen(financeUserId, closing.id, 'Second reason', key()),
    ).rejects.toThrow(new FinanceError('CLOSING_ALREADY_REOPENED'));
  });

  it('allows the final day and rejects the exact reopening deadline', async () => {
    now = new Date('2026-07-31T23:59:59.999Z');
    const allowed = await closings.create(
      financeUserId,
      key(),
      request('2026-07-01'),
    );
    const reopened = await closings.reopen(
      financeUserId,
      allowed.id,
      'Within the final day',
      key(),
    );
    expect(reopened.status).toBe('REOPENED');

    now = new Date('2026-08-01T00:00:00.000Z');
    const expired = await closings.create(
      financeUserId,
      key(),
      request('2026-07-02'),
    );
    now = new Date('2026-08-02T00:00:00.000Z');
    await expect(
      closings.reopen(financeUserId, expired.id, 'Too late', key()),
    ).rejects.toThrow(new FinanceError('CLOSING_REOPENING_WINDOW_EXPIRED'));
  });

  it('allows reopening even when a later closing exists', async () => {
    now = new Date('2026-09-17T10:00:00.000Z');
    const earlier = await closings.create(
      financeUserId,
      key(),
      request('2026-09-16'),
    );
    await closings.create(financeUserId, key(), request('2026-09-17'));

    const reopened = await closings.reopen(
      financeUserId,
      earlier.id,
      'Later closing does not block this one',
      key(),
    );
    expect(reopened.status).toBe('REOPENED');
  });

  it('rejects a blank reason and an unknown closing', async () => {
    await expect(
      closings.reopen(financeUserId, randomUUID(), '   ', key()),
    ).rejects.toThrow(new FinanceError('CLOSING_REQUEST_INVALID'));
    await expect(
      closings.reopen(financeUserId, randomUUID(), 'Valid reason', key()),
    ).rejects.toThrow(new FinanceError('CLOSING_NOT_FOUND'));
  });
});
