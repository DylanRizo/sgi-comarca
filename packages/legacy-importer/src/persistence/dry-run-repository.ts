import type { DatabaseClient } from '@sgi/database';

import { LegacyImporterError } from '../domain/errors.js';
import { advisoryLockKey } from '../domain/identity.js';
import type {
  ImportExecutionSummary,
  ImportPlan,
  ReconciliationResult,
} from '../domain/import-types.js';
import {
  persistImportPlan,
  preparePersistencePayload,
} from './import-persistence.js';
import {
  assertTemporaryDatabase,
  type TemporaryDatabaseFingerprint,
} from './temporary-database-guard.js';

export interface DryRunHooks {
  afterAdvisoryLock?: () => Promise<void>;
}

export async function executeDryRun(
  client: DatabaseClient,
  fingerprint: TemporaryDatabaseFingerprint,
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
  hooks: DryRunHooks = {},
): Promise<ImportExecutionSummary> {
  const result = summary(plan, reconciliation);
  const payload = preparePersistencePayload(plan, reconciliation);
  await assertTemporaryDatabase(client, fingerprint);
  return client.$transaction(
    async (transaction) => {
      const lockRows = await transaction.$queryRawUnsafe<
        Array<{ acquired: boolean }>
      >(
        'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
        advisoryLockKey(plan.batchKey).toString(),
      );
      if (lockRows[0]?.acquired !== true) {
        throw new LegacyImporterError('BATCH_CONCURRENT_EXECUTION', 4);
      }
      await hooks.afterAdvisoryLock?.();
      const existingBatch = await transaction.importBatch.findUnique({
        where: { id: plan.importBatchId },
      });
      if (existingBatch !== null) {
        if (
          existingBatch.mode !== 'DRY_RUN' ||
          existingBatch.status !== 'COMMITTED' ||
          existingBatch.sourceChecksum !== plan.sourceSha256 ||
          existingBatch.mappingVersion !== plan.mappingVersion
        ) {
          throw new LegacyImporterError('IMPORT_BATCH_IDENTITY_CONFLICT', 4);
        }
        return result;
      }
      await persistImportPlan(transaction, plan, reconciliation, {
        mode: 'DRY_RUN',
        finalSummary: result,
        payload,
      });
      return result;
    },
    { isolationLevel: 'Serializable' },
  );
}

function summary(
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
): ImportExecutionSummary {
  const businessEntityCounts = {
    units: plan.businessPlan?.units.length ?? 0,
    products: plan.businessPlan?.products.length ?? 0,
    inventoryBalances: plan.businessPlan?.inventoryBalances.length ?? 0,
    productWarehouseValuations:
      plan.businessPlan?.productWarehouseValuations.length ?? 0,
  };
  const reconciliationIssueCountsByCode = Object.fromEntries(
    [...new Set(reconciliation.issues.map(({ code }) => code))]
      .sort()
      .map((code) => [
        code,
        reconciliation.issues.filter((issue) => issue.code === code).length,
      ]),
  );
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    result: 'DRY_RUN_COMMITTED_IN_DISPOSABLE_DATABASE',
    sourceCode: plan.sourceCode,
    sourceSha256: plan.sourceSha256,
    batchKey: plan.batchKey,
    importBatchId: plan.importBatchId,
    totalSourceRows: plan.totalSourceRows,
    rawPreservedRows: reconciliation.rawPreservedRows,
    droppedRows: reconciliation.droppedRows,
    reconciliationIssueCount: reconciliation.issues.length,
    reconciliationIssueCountsByCode,
    businessEntityWriteCount: Object.values(businessEntityCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    businessEntityCounts,
    persistentImportAuthorized: false,
  };
}
