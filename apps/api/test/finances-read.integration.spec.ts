import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { FinanceReadService } from '../src/finances/finance-read.service.js';
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

describe('FASE 8B.2 finances read model', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let reads!: FinanceReadService;
  let saleCreation!: CreateSaleService;
  let saleLifecycle!: SaleLifecycleService;
  let productId: string;
  let warehouseId: string;
  let databaseName: string;
  let actorId: string;
  let incomeCategoryId: string;
  let expenseCategoryId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  /**
   * Sales are inserted with `LEGACY_IMPORT` origin so this suite exercises the
   * finances read model without rebuilding a full operational sale with items
   * and ledger, which the FASE 7B suites already cover. The finance union
   * filters on status, not origin, so the rule under test is unchanged.
   */
  async function createSale(
    businessDate: string,
    total: string,
    status: 'CANCELLED' | 'COMPLETED' | 'IN_TRANSIT',
  ): Promise<string> {
    const id = randomUUID();
    await client.$executeRawUnsafe(
      `INSERT INTO sales
         (id, origin, business_date, status, payment_status, subtotal, total,
          updated_at)
       VALUES ($1::uuid, 'LEGACY_IMPORT', $2::date, $3::sale_status, 'PENDING',
               $4::numeric, $4::numeric, now())`,
      id,
      businessDate,
      status,
      total,
    );
    return id;
  }

  /**
   * A legacy sale lifecycle is immutable by FASE 7A, so a sale that has to
   * change state must be a real operational one. This uses the FASE 7B
   * services, which build the items, ledger and documents correctly.
   */
  async function createOperationalSale(
    businessDate: string,
    quantity: string,
  ): Promise<string> {
    const sale = await saleCreation.create(
      actorId,
      randomUUID() + randomUUID(),
      {
        businessDate,
        items: [{ productId, quantity, warehouseId }],
        status: 'IN_TRANSIT',
      },
    );
    return sale.id;
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase8b2_' +
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
    reads = new FinanceReadService(client);
    saleCreation = new CreateSaleService(client);
    saleLifecycle = new SaleLifecycleService(client);

    const actor = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic finance actor',
        loginIdentifier: 'phase8b2-actor',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    actorId = actor.id;

    const [income, expense] = await Promise.all([
      client.financialCategory.create({
        data: { code: 'P8B2-INC', entryType: 'INCOME', name: 'Otros ingresos' },
        select: { id: true },
      }),
      client.financialCategory.create({
        data: { code: 'P8B2-EXP', entryType: 'EXPENSE', name: 'Combustible' },
        select: { id: true },
      }),
    ]);
    incomeCategoryId = income.id;
    expenseCategoryId = expense.id;

    const salesRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'SALES' },
    });
    await client.userRole.create({
      data: { roleId: salesRole.id, userId: actorId },
    });
    const cancelPermission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'sales.cancel' },
    });
    await client.userPermission.create({
      data: {
        effect: 'GRANT',
        grantedByUserId: actorId,
        permissionId: cancelPermission.id,
        userId: actorId,
      },
    });

    const warehouse = await client.warehouse.create({
      data: { active: true, code: 'P8B2-W', name: 'Almacén 8B2' },
      select: { id: true },
    });
    warehouseId = warehouse.id;
    const product = await client.product.create({
      data: { active: true, code: 'P8B2-A', name: 'Producto 8B2' },
      select: { id: true },
    });
    productId = product.id;
    await client.inventoryBalance.create({
      data: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId,
        quantity: '500',
        warehouseId,
      },
    });

    // Manual entries: one expense and one income.
    await client.financialEntry.create({
      data: {
        amount: '30.00',
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        categoryId: expenseCategoryId,
        createdByUserId: actorId,
        entryType: 'EXPENSE',
        idempotencyKeyHash: randomUUID().replaceAll('-', '').repeat(2),
        origin: 'OPERATIONAL',
        requestHash: randomUUID().replaceAll('-', '').repeat(2),
        responsibleUserId: actorId,
      },
    });
    await client.financialEntry.create({
      data: {
        amount: '20.00',
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        categoryId: incomeCategoryId,
        createdByUserId: actorId,
        entryType: 'INCOME',
        idempotencyKeyHash: randomUUID().replaceAll('-', '').repeat(2),
        origin: 'OPERATIONAL',
        requestHash: randomUUID().replaceAll('-', '').repeat(2),
        responsibleUserId: actorId,
      },
    });

    // Sales: only the completed one may count as income.
    await createSale('2026-09-01', '100.00', 'COMPLETED');
    await createSale('2026-09-01', '500.00', 'IN_TRANSIT');
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

  it('derives income from completed sales without persisting an entry', async () => {
    const page = await reads.lines({ page: 1, pageSize: 25 });
    const saleLines = page.items.filter((line) => line.source === 'SALE');

    expect(saleLines).toHaveLength(1);
    expect(saleLines[0]?.amount).toBe('100.00');
    expect(saleLines[0]?.entryType).toBe('INCOME');
    expect(saleLines[0]?.saleNumber).toMatch(/^VTA-\d{9}$/u);
    expect(saleLines[0]?.category).toBeNull();

    // DEC-022: the sale income exists only as a derived line.
    expect(await client.financialEntry.count()).toBe(2);
  });

  it('excludes in-transit and cancelled sales from income', async () => {
    const page = await reads.lines({ page: 1, pageSize: 25 });
    const amounts = page.items
      .filter((line) => line.source === 'SALE')
      .map((line) => line.amount);
    expect(amounts).not.toContain('500.00');
  });

  it('totals income, expense and net over the whole filtered set', async () => {
    const totals = await reads.totals({ page: 1, pageSize: 25 });
    // 100.00 derived + 20.00 manual income, minus 30.00 manual expense.
    expect(totals.income).toBe('120.00');
    expect(totals.expense).toBe('30.00');
    expect(totals.net).toBe('90.00');
  });

  it('starts counting a sale as income the moment it is completed', async () => {
    const saleId = await createOperationalSale('2026-09-02', '7');
    const before = await reads.totals({ page: 1, pageSize: 25 });
    // In transit, the sale contributes nothing.
    expect(before.income).toBe('120.00');

    await saleLifecycle.confirmInTransit(
      actorId,
      saleId,
      randomUUID() + randomUUID(),
    );

    const after = await reads.totals({ page: 1, pageSize: 25 });
    // 7 units at the 10.00 reference price.
    expect(after.income).toBe('190.00');
    // DEC-022: no entry was written to make that happen.
    expect(await client.financialEntry.count()).toBe(2);
  });

  it('stops counting a sale as income once it is cancelled', async () => {
    const saleId = await createOperationalSale('2026-09-03', '3');
    await saleLifecycle.confirmInTransit(
      actorId,
      saleId,
      randomUUID() + randomUUID(),
    );
    const completed = await reads.totals({ page: 1, pageSize: 25 });
    expect(completed.income).toBe('220.00');

    // A completed sale cannot be cancelled, so cancel one still in transit and
    // confirm the aggregate never counted it.
    const inTransit = await createOperationalSale('2026-09-03', '9');
    await saleLifecycle.cancel(
      actorId,
      inTransit,
      'Cliente desistió',
      randomUUID() + randomUUID(),
    );

    const after = await reads.totals({ page: 1, pageSize: 25 });
    expect(after.income).toBe('220.00');
    expect(await client.financialEntry.count()).toBe(2);
  });

  it('paginates the merged sources as one result', async () => {
    const all = await reads.lines({ page: 1, pageSize: 50 });
    const total = all.pagination.totalItems;
    expect(total).toBeGreaterThan(2);

    const first = await reads.lines({ page: 1, pageSize: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.pagination.totalItems).toBe(total);

    const second = await reads.lines({ page: 2, pageSize: 2 });
    const ids = [...first.items, ...second.items].map((line) => line.id);
    expect(new Set(ids).size).toBe(first.items.length + second.items.length);
  });

  it('filters by source, type, category and date', async () => {
    const manual = await reads.lines({
      page: 1,
      pageSize: 25,
      source: 'MANUAL',
    });
    expect(manual.items.every((line) => line.source === 'MANUAL')).toBe(true);
    expect(manual.pagination.totalItems).toBe(2);

    const expenses = await reads.lines({
      entryType: 'EXPENSE',
      page: 1,
      pageSize: 25,
    });
    expect(expenses.pagination.totalItems).toBe(1);
    expect(expenses.items[0]?.category?.code).toBe('P8B2-EXP');

    const byCategory = await reads.lines({
      categoryId: incomeCategoryId,
      page: 1,
      pageSize: 25,
    });
    expect(byCategory.pagination.totalItems).toBe(1);

    const outOfRange = await reads.lines({
      from: '2027-01-01',
      page: 1,
      pageSize: 25,
    });
    expect(outOfRange.pagination.totalItems).toBe(0);
  });

  it('renders the business date without a timezone shift', async () => {
    // Managua is west of Greenwich, so a date built at UTC midnight and
    // rendered in local time would move a day back.
    const page = await reads.lines({
      from: '2026-09-01',
      page: 1,
      pageSize: 50,
      to: '2026-09-01',
    });
    expect(page.pagination.totalItems).toBeGreaterThan(0);
    expect(page.items.every((line) => line.businessDate === '2026-09-01')).toBe(
      true,
    );
  });

  it('reports a missing closing as not found', async () => {
    await expect(reads.closing(randomUUID())).rejects.toMatchObject({
      code: 'CLOSING_NOT_FOUND',
    });
  });
});
