import { randomBytes } from 'node:crypto';

import { createDatabaseClient } from '@sgi/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { executeDryRun } from '../src/persistence/dry-run-repository.js';
import { createManagedTemporaryDatabase } from '../src/persistence/temporary-database-manager.js';
import {
  assertTemporaryDatabase,
  installTemporaryDatabaseFingerprint,
  type TemporaryDatabaseFingerprint,
} from '../src/persistence/temporary-database-guard.js';
import {
  databasePlan,
  databaseWave12Plan,
} from './fixtures/synthetic-import.js';

describe('FASE 4A temporary PostgreSQL dry-run', () => {
  const client = createDatabaseClient(process.env.DATABASE_URL!);
  let fingerprint: TemporaryDatabaseFingerprint;

  beforeAll(async () => {
    const rows = await client.$queryRawUnsafe<Array<{ database_name: string }>>(
      'SELECT current_database() AS database_name',
    );
    fingerprint = {
      databaseName: rows[0]!.database_name,
      nonce: randomBytes(16).toString('hex'),
    };
    await installTemporaryDatabaseFingerprint(client, fingerprint);
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('rejects a database without the exact positive temporary fingerprint', async () => {
    await expect(
      assertTemporaryDatabase(client, {
        ...fingerprint,
        nonce: '0'.repeat(32),
      }),
    ).rejects.toThrow('TEMP_DATABASE_GUARD_REJECTED');
  });

  it('requires the administrator connection through the environment', async () => {
    const configuredDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(createManagedTemporaryDatabase('.')).rejects.toThrow(
        'DATABASE_URL_REQUIRED',
      );
    } finally {
      if (configuredDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = configuredDatabaseUrl;
      }
    }
  });

  it('preserves exactly 2,064 rows, all Phase 3C issues and no business rows', async () => {
    const { plan, reconciliation } = databasePlan(2_064, 'preservation');
    const result = await executeDryRun(
      client,
      fingerprint,
      plan,
      reconciliation,
    );
    expect(result).toMatchObject({
      totalSourceRows: 2_064,
      rawPreservedRows: 2_064,
      droppedRows: 0,
      reconciliationIssueCount: 24,
      businessEntityWriteCount: 0,
      persistentImportAuthorized: false,
    });
    await expect(
      client.legacyRecord.count({
        where: { importBatchId: plan.importBatchId },
      }),
    ).resolves.toBe(2_064);
    await expect(
      client.reconciliationIssue.count({
        where: { importBatchId: plan.importBatchId },
      }),
    ).resolves.toBe(24);
    const [productCount, balanceCount, movementCount, saleCount, unitCount] =
      await Promise.all([
        client.product.count(),
        client.inventoryBalance.count(),
        client.inventoryMovement.count(),
        client.sale.count(),
        client.unit.count(),
      ]);
    expect({
      productCount,
      balanceCount,
      movementCount,
      saleCount,
      unitCount,
    }).toEqual({
      productCount: 0,
      balanceCount: 0,
      movementCount: 0,
      saleCount: 0,
      unitCount: 0,
    });
  });

  it('is idempotent for the same source, mapping and importer identity', async () => {
    const { plan, reconciliation } = databasePlan(10, 'idempotent');
    const first = await executeDryRun(
      client,
      fingerprint,
      plan,
      reconciliation,
    );
    const second = await executeDryRun(
      client,
      fingerprint,
      plan,
      reconciliation,
    );
    expect(second).toEqual(first);
    await expect(
      client.legacyRecord.count({
        where: { importBatchId: plan.importBatchId },
      }),
    ).resolves.toBe(10);
  });

  it('simulates approved Wave 1-2 entities and links raw evidence only in the temporary database', async () => {
    await client.warehouse.createMany({
      data: [
        {
          code: 'CASA_DYLAN',
          name: 'Synthetic warehouse',
        },
      ],
      skipDuplicates: true,
    });
    const { plan, reconciliation } = databaseWave12Plan('wave12-integration');
    const result = await executeDryRun(
      client,
      fingerprint,
      plan,
      reconciliation,
    );
    expect(result).toMatchObject({
      businessEntityWriteCount: 4,
      reconciliationIssueCountsByCode: {
        VALUATION_OBSERVED_AT_MISSING: 1,
      },
      businessEntityCounts: {
        units: 1,
        products: 1,
        inventoryBalances: 1,
        productWarehouseValuations: 1,
      },
      persistentImportAuthorized: false,
    });
    const linkedRecord = await client.legacyRecord.findUnique({
      where: { id: plan.businessPlan!.recordLinks[2]!.recordId },
    });
    expect(linkedRecord).toMatchObject({
      status: 'IMPORTED',
      targetProductId: plan.businessPlan!.products[0]!.id,
      targetInventoryBalanceId: plan.businessPlan!.inventoryBalances[0]!.id,
    });
    await expect(
      client.productWarehouseValuation.count({
        where: { legacyRecordId: linkedRecord!.id },
      }),
    ).resolves.toBe(1);
    const missingDateRecord = await client.legacyRecord.findUnique({
      where: { id: plan.businessPlan!.recordLinks[3]!.recordId },
    });
    expect(missingDateRecord).toMatchObject({
      status: 'IMPORTED',
      targetProductId: plan.businessPlan!.products[0]!.id,
      targetInventoryBalanceId: plan.businessPlan!.inventoryBalances[0]!.id,
    });
    await expect(
      client.productWarehouseValuation.count({
        where: { legacyRecordId: missingDateRecord!.id },
      }),
    ).resolves.toBe(0);
    await expect(
      client.reconciliationIssue.count({
        where: {
          importBatchId: plan.importBatchId,
          code: 'VALUATION_OBSERVED_AT_MISSING',
          status: 'REQUIRES_HUMAN_APPROVAL',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      executeDryRun(client, fingerprint, plan, reconciliation),
    ).resolves.toEqual(result);
    await expect(
      client.productWarehouseValuation.count({
        where: { id: plan.businessPlan!.productWarehouseValuations[0]!.id },
      }),
    ).resolves.toBe(1);
  });

  it('returns an explicit conflict for a concurrent batch and releases the lock', async () => {
    const { plan, reconciliation } = databasePlan(10, 'concurrent');
    let signalAcquired!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      signalAcquired = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = executeDryRun(client, fingerprint, plan, reconciliation, {
      afterAdvisoryLock: async () => {
        signalAcquired();
        await hold;
      },
    });
    await acquired;
    await expect(
      executeDryRun(client, fingerprint, plan, reconciliation),
    ).rejects.toThrow('BATCH_CONCURRENT_EXECUTION');
    release();
    await expect(first).resolves.toMatchObject({ rawPreservedRows: 10 });
    await expect(
      executeDryRun(client, fingerprint, plan, reconciliation),
    ).resolves.toMatchObject({ rawPreservedRows: 10 });
  });

  it('rolls back every batch row after a constraint failure', async () => {
    const { plan, reconciliation } = databasePlan(10, 'rollback');
    reconciliation.issues[0]!.code = 'X'.repeat(121);
    await expect(
      executeDryRun(client, fingerprint, plan, reconciliation),
    ).rejects.toThrow();
    await expect(
      client.importBatch.findUnique({ where: { id: plan.importBatchId } }),
    ).resolves.toBeNull();
    await expect(
      client.legacyRecord.count({
        where: { importBatchId: plan.importBatchId },
      }),
    ).resolves.toBe(0);
  });
});
