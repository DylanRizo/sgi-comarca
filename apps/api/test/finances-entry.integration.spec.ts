import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CreateFinancialEntryService } from '../src/finances/create-financial-entry.service.js';
import { FinanceError } from '../src/finances/finance.errors.js';
import { FinanceReadService } from '../src/finances/finance-read.service.js';
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

describe('FASE 8B.3 manual financial entries', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let creation!: CreateFinancialEntryService;
  let reads!: FinanceReadService;
  let databaseName: string;
  let financeUserId: string;
  let outsiderId: string;
  let inactiveUserId: string;
  let expenseCategoryId: string;
  let incomeCategoryId: string;
  let inactiveCategoryId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  function request(overrides: Record<string, unknown> = {}) {
    return {
      amount: '25.00',
      businessDate: '2026-09-10',
      categoryId: expenseCategoryId,
      entryType: 'EXPENSE' as const,
      responsibleUserId: financeUserId,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase8b3_' +
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
    creation = new CreateFinancialEntryService(client);
    reads = new FinanceReadService(client);

    const financeRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'FINANCE' },
    });
    const financeUser = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic finance user',
        loginIdentifier: 'phase8b3-finance',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    financeUserId = financeUser.id;
    await client.userRole.create({
      data: { roleId: financeRole.id, userId: financeUserId },
    });

    const outsider = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: 'Synthetic outsider',
        loginIdentifier: 'phase8b3-outsider',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    outsiderId = outsider.id;

    const inactive = await client.user.create({
      data: {
        displayName: 'Synthetic inactive user',
        loginIdentifier: 'phase8b3-inactive',
        status: 'PENDING_ACTIVATION',
      },
      select: { id: true },
    });
    inactiveUserId = inactive.id;

    const [expense, income, inactiveCategory] = await Promise.all([
      client.financialCategory.create({
        data: { code: 'P8B3-EXP', entryType: 'EXPENSE', name: 'Combustible' },
        select: { id: true },
      }),
      client.financialCategory.create({
        data: { code: 'P8B3-INC', entryType: 'INCOME', name: 'Otros ingresos' },
        select: { id: true },
      }),
      client.financialCategory.create({
        data: {
          active: false,
          code: 'P8B3-OLD',
          entryType: 'EXPENSE',
          name: 'Categoría retirada',
        },
        select: { id: true },
      }),
    ]);
    expenseCategoryId = expense.id;
    incomeCategoryId = income.id;
    inactiveCategoryId = inactiveCategory.id;
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

  it('creates a manual entry and audits it once', async () => {
    const line = await creation.create(financeUserId, key(), request());

    expect(line.source).toBe('MANUAL');
    expect(line.amount).toBe('25.00');
    expect(line.entryType).toBe('EXPENSE');
    expect(line.businessDate).toBe('2026-09-10');
    expect(line.category?.code).toBe('P8B3-EXP');
    expect(line.saleId).toBeNull();

    const audits = await client.auditLog.findMany({
      where: { action: 'finances.entry_created', entityId: line.id },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.metadata)).not.toContain('idempotency');
  });

  it('never persists an entry for sale income', async () => {
    const before = await client.financialEntry.count();
    await creation.create(
      financeUserId,
      key(),
      request({
        amount: '5.00',
        categoryId: incomeCategoryId,
        entryType: 'INCOME',
      }),
    );
    // Only the manual entry was written; nothing derives into the table.
    expect(await client.financialEntry.count()).toBe(before + 1);
  });

  it('rejects a category that does not match the entry type', async () => {
    await expect(
      creation.create(
        financeUserId,
        key(),
        request({ categoryId: incomeCategoryId }),
      ),
    ).rejects.toThrow(new FinanceError('FINANCE_CATEGORY_INVALID'));
  });

  it('rejects an inactive category', async () => {
    await expect(
      creation.create(
        financeUserId,
        key(),
        request({ categoryId: inactiveCategoryId }),
      ),
    ).rejects.toThrow(new FinanceError('FINANCE_CATEGORY_INVALID'));
  });

  it('rejects an inactive responsible user', async () => {
    await expect(
      creation.create(
        financeUserId,
        key(),
        request({ responsibleUserId: inactiveUserId }),
      ),
    ).rejects.toThrow(new FinanceError('FINANCE_RESPONSIBLE_INVALID'));
  });

  it('rejects a zero or negative amount before reaching the database', async () => {
    for (const amount of ['0', '0.00']) {
      await expect(
        creation.create(financeUserId, key(), request({ amount })),
      ).rejects.toThrow(new FinanceError('FINANCE_REQUEST_INVALID'));
    }
  });

  it('denies an actor without finances.manual.create', async () => {
    await expect(creation.create(outsiderId, key(), request())).rejects.toThrow(
      new FinanceError('FINANCE_PERMISSION_DENIED'),
    );
  });

  it('requires a valid idempotency key', async () => {
    await expect(
      creation.create(financeUserId, undefined, request()),
    ).rejects.toThrow(new FinanceError('FINANCE_REQUEST_INVALID'));
    await expect(
      creation.create(financeUserId, 'short', request()),
    ).rejects.toThrow(new FinanceError('FINANCE_REQUEST_INVALID'));
  });

  it('replays the same key and payload without a second entry', async () => {
    const idempotencyKey = key();
    const payload = request({ amount: '11.00' });
    const first = await creation.create(financeUserId, idempotencyKey, payload);
    const entries = await client.financialEntry.count();
    const audits = await client.auditLog.count();

    const replay = await creation.create(
      financeUserId,
      idempotencyKey,
      payload,
    );
    expect(replay.id).toBe(first.id);
    expect(await client.financialEntry.count()).toBe(entries);
    expect(await client.auditLog.count()).toBe(audits);
  });

  it('rejects the same key with a different payload', async () => {
    const idempotencyKey = key();
    await creation.create(
      financeUserId,
      idempotencyKey,
      request({ amount: '12.00' }),
    );
    await expect(
      creation.create(
        financeUserId,
        idempotencyKey,
        request({ amount: '13.00' }),
      ),
    ).rejects.toThrow(new FinanceError('FINANCE_CONCURRENCY_CONFLICT'));
  });

  it('keeps a persisted entry immutable', async () => {
    const line = await creation.create(
      financeUserId,
      key(),
      request({ amount: '14.00' }),
    );
    await expect(
      client.$executeRawUnsafe(
        `UPDATE financial_entries SET amount = 99 WHERE id = $1::uuid`,
        line.id,
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: { originalCode: '55000' },
        },
      },
    });
    await expect(
      client.$executeRawUnsafe(
        `DELETE FROM financial_entries WHERE id = $1::uuid`,
        line.id,
      ),
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: { originalCode: '55000' },
        },
      },
    });
  });

  it('shows the new entries through the read model', async () => {
    const page = await reads.lines({ page: 1, pageSize: 50, source: 'MANUAL' });
    expect(page.pagination.totalItems).toBeGreaterThan(0);
    expect(page.items.every((line) => line.source === 'MANUAL')).toBe(true);
  });
});
