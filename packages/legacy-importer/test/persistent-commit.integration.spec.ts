import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseClient } from '@sgi/database';

import type { PersistentCommitOptions } from '../src/persistence/persistent-commit-engine.js';
import { readTargetDatabaseIdentity } from '../src/guards/target-fingerprint.js';
import { executePersistentCommitSimulation } from '../src/persistence/persistent-commit-engine.js';
import {
  installPersistentSimulationFingerprint,
  type PersistentSimulationFingerprint,
} from '../src/persistence/persistent-simulation-guard.js';
import {
  createManagedTemporaryDatabase,
  type ManagedTemporaryDatabase,
} from '../src/persistence/temporary-database-manager.js';
import { databaseFullCommitPlan } from './fixtures/synthetic-import.js';

describe('FASE 4C.1 persistent commit simulation', () => {
  let database: ManagedTemporaryDatabase;
  let client: DatabaseClient;
  let simulation: PersistentSimulationFingerprint;
  let operatorUserId: string;
  let baseOptions: PersistentCommitOptions;
  let initialAuditCount: number;

  beforeAll(async () => {
    database = await createManagedTemporaryDatabase(process.cwd());
    client = database.client;
    simulation = {
      databaseName: database.fingerprint.databaseName,
      nonce: randomBytes(16).toString('hex'),
    };
    await installPersistentSimulationFingerprint(client, simulation);
    const operators = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id::text AS id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
         JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN'
        ORDER BY u.id
        LIMIT 1`,
    );
    operatorUserId = operators[0]!.id;
    await client.user.update({
      where: { id: operatorUserId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    initialAuditCount = await client.auditLog.count();
    const prepared = {
      ...databaseFullCommitPlan('persistent-simulation'),
      workbook: {} as never,
      verifiedEvidence: {} as never,
      mapping: {} as never,
      mappingSha256: 'f'.repeat(64),
    };
    const target = await readTargetDatabaseIdentity(
      client,
      'persistent-simulation',
    );
    const artifactChecksums = {
      'import-plan.json': 'a'.repeat(64),
      'dry-run-summary.json': 'b'.repeat(64),
      'reconciliation.json': 'c'.repeat(64),
      'row-results.json': 'd'.repeat(64),
      'commit-preview.md': 'e'.repeat(64),
    };
    const backup = {
      backupSha256: '1'.repeat(64),
      backupReference: 'backup:1111111111111111',
      restoreEvidenceSha256: '2'.repeat(64),
      restoreTestedAt: '2026-08-09T00:00:00.000Z',
    };
    baseOptions = {
      prepared,
      expectedEvidence: {
        sourceSha256: prepared.plan.sourceSha256,
        manifestSha256: prepared.plan.manifestSha256,
        mappingSha256: prepared.plan.mappingSha256,
        approvedPlanKey: prepared.plan.approvedPlanKey,
        importerVersion: prepared.plan.importerVersion,
      },
      approvedArtifactChecksums: artifactChecksums,
      targetEnvironment: 'persistent-simulation',
      expectedTargetFingerprint: target.fingerprint,
      operatorUserId,
      backup,
      maintenanceWindowAcknowledged: true,
      revalidateEvidence: async () => prepared,
      revalidateCriticalEvidence: async () => ({
        sourceSha256: prepared.plan.sourceSha256,
        manifestSha256: prepared.plan.manifestSha256,
        mappingSha256: prepared.plan.mappingSha256,
        importerVersion: prepared.plan.importerVersion,
      }),
      revalidateApprovedArtifacts: async () => artifactChecksums,
      revalidateBackup: async () => backup,
      revalidateBackupIdentity: async () => backup,
      sourceSha256BeforeFinalCommit: async () => prepared.plan.sourceSha256,
      ...(process.env.LEGACY_IMPORT_TIMINGS === '1'
        ? {
            hooks: {
              onPhaseTiming: ({ phase, durationMs }) => {
                process.stdout.write(
                  `COMMIT_TIMING ${phase}=${durationMs.toFixed(1)}ms\n`,
                );
              },
            },
          }
        : {}),
    };
  }, 120_000);

  afterAll(async () => {
    await database?.dispose();
  });

  async function expectEmptyTarget(): Promise<void> {
    const [
      sources,
      batches,
      records,
      issues,
      units,
      products,
      balances,
      values,
    ] = await Promise.all([
      client.legacySource.count(),
      client.importBatch.count(),
      client.legacyRecord.count(),
      client.reconciliationIssue.count(),
      client.unit.count(),
      client.product.count(),
      client.inventoryBalance.count(),
      client.productWarehouseValuation.count(),
    ]);
    expect({
      sources,
      batches,
      records,
      issues,
      units,
      products,
      balances,
      values,
    }).toEqual({
      sources: 0,
      batches: 0,
      records: 0,
      issues: 0,
      units: 0,
      products: 0,
      balances: 0,
      values: 0,
    });
    await expect(client.auditLog.count()).resolves.toBe(initialAuditCount);
  }

  it('rejects non-empty targets, missing warehouses and inactive operators without writes', async () => {
    await client.unit.create({
      data: { code: 'PREEXISTING', name: 'Synthetic' },
    });
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_TARGET_NOT_EMPTY');
    await client.unit.delete({ where: { code: 'PREEXISTING' } });

    await client.warehouse.update({
      where: { code: 'CASA_JEAN' },
      data: { active: false },
    });
    baseOptions.expectedTargetFingerprint = (
      await readTargetDatabaseIdentity(client, 'persistent-simulation')
    ).fingerprint;
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_WAREHOUSE_MATRIX_INVALID');
    await client.warehouse.update({
      where: { code: 'CASA_JEAN' },
      data: { active: true },
    });
    baseOptions.expectedTargetFingerprint = (
      await readTargetDatabaseIdentity(client, 'persistent-simulation')
    ).fingerprint;

    for (const status of ['PENDING_ACTIVATION', 'DISABLED'] as const) {
      await client.user.update({
        where: { id: operatorUserId },
        data: { status },
      });
      await expect(
        executePersistentCommitSimulation(client, simulation, baseOptions),
      ).rejects.toThrow('COMMIT_OPERATOR_NOT_ACTIVE');
    }
    await client.user.update({
      where: { id: operatorUserId },
      data: { status: 'ACTIVE' },
    });
    await expect(
      executePersistentCommitSimulation(client, simulation, {
        ...baseOptions,
        operatorUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('COMMIT_OPERATOR_NOT_FOUND');
    const nonAdmin = await client.user.findFirst({
      where: { id: { not: operatorUserId } },
      orderBy: { id: 'asc' },
    });
    await client.user.update({
      where: { id: nonAdmin!.id },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    await expect(
      executePersistentCommitSimulation(client, simulation, {
        ...baseOptions,
        operatorUserId: nonAdmin!.id,
      }),
    ).rejects.toThrow('COMMIT_OPERATOR_ADMIN_REQUIRED');
    await client.user.update({
      where: { id: nonAdmin!.id },
      data: { status: 'PENDING_ACTIVATION', activatedAt: null },
    });
    await expectEmptyTarget();
  }, 120_000);

  it('rejects prior source or batch state create-only', async () => {
    await client.legacySource.create({
      data: {
        id: baseOptions.prepared.plan.legacySourceId,
        code: baseOptions.prepared.plan.sourceCode.toUpperCase(),
        name: 'Synthetic source',
        type: 'XLSX',
      },
    });
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_TARGET_NOT_EMPTY');
    await client.legacySource.delete({
      where: { id: baseOptions.prepared.plan.legacySourceId },
    });
    await client.legacySource.create({
      data: {
        id: baseOptions.prepared.plan.legacySourceId,
        code: baseOptions.prepared.plan.sourceCode.toUpperCase(),
        name: 'Synthetic source',
        type: 'XLSX',
      },
    });
    await client.importBatch.create({
      data: {
        id: baseOptions.prepared.plan.importBatchId,
        legacySourceId: baseOptions.prepared.plan.legacySourceId,
        mode: 'COMMIT',
        status: 'COMMITTED',
        sourceChecksum: baseOptions.prepared.plan.sourceSha256,
        mappingVersion: baseOptions.prepared.plan.mappingVersion,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_TARGET_NOT_EMPTY');
    await client.importBatch.delete({
      where: { id: baseOptions.prepared.plan.importBatchId },
    });
    await client.legacySource.delete({
      where: { id: baseOptions.prepared.plan.legacySourceId },
    });
    await expectEmptyTarget();
  });

  it('rolls back every row and the audit at all approved failure points', async () => {
    const failurePoints = [
      'UNIT_10',
      'PRODUCT_80',
      'BALANCE_200',
      'VALUATION_300',
      'RECONCILIATION_ISSUE',
      'AUDIT_LOG',
      'BATCH_FINALIZATION',
    ] as const;
    for (const failurePoint of failurePoints) {
      await expect(
        executePersistentCommitSimulation(client, simulation, {
          ...baseOptions,
          hooks: { failurePoint },
        }),
      ).rejects.toThrow(`SIMULATED_FAILURE:${failurePoint}`);
      await expectEmptyTarget();
    }
  }, 240_000);

  it('rolls back if the source changes immediately before final commit', async () => {
    await expect(
      executePersistentCommitSimulation(client, simulation, {
        ...baseOptions,
        sourceSha256BeforeFinalCommit: async () => '9'.repeat(64),
      }),
    ).rejects.toThrow('COMMIT_TOCTOU_SOURCE_CHANGED');
    await expectEmptyTarget();
  }, 120_000);

  it('serializes identical and incompatible imports through the global lock and releases it', async () => {
    let signalLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = executePersistentCommitSimulation(client, simulation, {
      ...baseOptions,
      hooks: {
        failurePoint: 'BATCH_FINALIZATION',
        afterLocks: async () => {
          signalLocked();
          await hold;
        },
      },
    });
    await locked;
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_CONCURRENT_EXECUTION');
    release();
    await expect(first).rejects.toThrow('SIMULATED_FAILURE:BATCH_FINALIZATION');
    await expectEmptyTarget();
  }, 120_000);

  it('commits the exact synthetic Waves 1-2 scope atomically in a marked disposable database', async () => {
    const result = await executePersistentCommitSimulation(
      client,
      simulation,
      baseOptions,
    );
    expect(result).toMatchObject({
      executionMode: 'COMMIT',
      result: 'PERSISTENT_IMPORT_COMMITTED',
      totalSourceRows: 2_064,
      rawPreservedRows: 2_064,
      droppedRows: 0,
      reconciliationIssueCount: 189,
      reconciliationStatusCounts: {
        RESOLVED: 13,
        OPEN: 173,
        REQUIRES_HUMAN_APPROVAL: 3,
      },
      reconciliationSeverityCounts: {
        ERROR: 5,
        WARNING: 179,
        INFO: 5,
      },
      businessEntityWriteCount: 872,
      businessEntityCounts: {
        units: 14,
        products: 144,
        inventoryBalances: 357,
        productWarehouseValuations: 357,
      },
    });
    const counts = await Promise.all([
      client.legacySource.count(),
      client.importBatch.count(),
      client.legacyRecord.count(),
      client.reconciliationIssue.count(),
      client.unit.count(),
      client.product.count(),
      client.inventoryBalance.count(),
      client.productWarehouseValuation.count(),
      client.inventoryMovement.count(),
      client.sale.count(),
      client.saleItem.count(),
      client.saleCancellation.count(),
      client.inTransitConfirmation.count(),
    ]);
    expect(counts).toEqual([
      1, 1, 2_064, 189, 14, 144, 357, 357, 0, 0, 0, 0, 0,
    ]);
    await expect(
      client.importBatch.findUnique({
        where: { id: baseOptions.prepared.plan.importBatchId },
      }),
    ).resolves.toMatchObject({ mode: 'COMMIT', status: 'COMMITTED' });
    const audit = await client.auditLog.findFirst({
      where: { action: 'legacy_import.committed' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit).toMatchObject({
      actorUserId: operatorUserId,
      entityType: 'ImportBatch',
      entityId: baseOptions.prepared.plan.importBatchId,
    });
    expect(JSON.stringify(audit?.metadata)).not.toMatch(
      /rawData|password|DATABASE_URL|cellValues/iu,
    );
    await expect(client.auditLog.count()).resolves.toBe(initialAuditCount + 1);
    await expect(
      executePersistentCommitSimulation(client, simulation, baseOptions),
    ).rejects.toThrow('COMMIT_TARGET_NOT_EMPTY');
  }, 180_000);
});
