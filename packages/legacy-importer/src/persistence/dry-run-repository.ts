import type { DatabaseClient } from '@sgi/database';
import { canonicalJson } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import { advisoryLockKey } from '../domain/identity.js';
import type {
  ImportExecutionSummary,
  ImportPlan,
  ReconciliationResult,
} from '../domain/import-types.js';
import {
  assertTemporaryDatabase,
  type TemporaryDatabaseFingerprint,
} from './temporary-database-guard.js';

export interface DryRunHooks {
  afterAdvisoryLock?: () => Promise<void>;
}

function databaseJson(value: unknown): never {
  return JSON.parse(canonicalJson(value)) as never;
}

export async function executeDryRun(
  client: DatabaseClient,
  fingerprint: TemporaryDatabaseFingerprint,
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
  hooks: DryRunHooks = {},
): Promise<ImportExecutionSummary> {
  // Canonicalizing thousands of raw envelopes is CPU work, not database work.
  // Keep it outside the short Serializable section so contention in the wider
  // monorepo suite cannot consume the interactive transaction budget.
  const legacyRecords = plan.records.map((record) => ({
    id: record.id,
    legacySourceId: record.legacySourceId,
    importBatchId: record.importBatchId,
    sourceEntity: record.sourceEntity,
    legacyId: record.legacyId,
    legacyRowNumber: record.legacyRowNumber,
    rawData: databaseJson(record.rawData),
    rawHash: record.rawHash,
    status: record.status,
  }));
  const reconciliationIssues = reconciliation.issues.map((issue) => ({
    id: issue.id,
    importBatchId: issue.importBatchId,
    legacyRecordId: issue.legacyRecordId,
    code: issue.code,
    severity: issue.severity,
    status: issue.status,
    requiresHumanApproval: issue.requiresHumanApproval,
    message: issue.message,
    details: databaseJson(issue.details),
    entityType: issue.entityType,
  }));
  const result = summary(plan, reconciliation);
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
        return summary(plan, reconciliation);
      }
      const databaseSourceCode = plan.sourceCode.toUpperCase();
      const existingSource = await transaction.legacySource.findUnique({
        where: { code: databaseSourceCode },
      });
      if (
        existingSource !== null &&
        (existingSource.id !== plan.legacySourceId ||
          existingSource.type !== 'XLSX')
      ) {
        throw new LegacyImporterError('LEGACY_SOURCE_CONFLICT', 4);
      }
      if (existingSource === null) {
        await transaction.legacySource.create({
          data: {
            id: plan.legacySourceId,
            code: databaseSourceCode,
            name: 'SGI legacy inventory workbook',
            type: 'XLSX',
            metadata: {
              profileSchemaVersion: 1,
              sourceCode: plan.sourceCode,
              sourceSha256: plan.sourceSha256,
              manifestSha256: plan.manifestSha256,
            },
          },
        });
      }
      await transaction.importBatch.create({
        data: {
          id: plan.importBatchId,
          legacySourceId: plan.legacySourceId,
          mode: 'DRY_RUN',
          status: 'RUNNING',
          sourceChecksum: plan.sourceSha256,
          mappingVersion: plan.mappingVersion,
          startedAt: new Date(),
          summary: {
            batchKey: plan.batchKey,
            importerVersion: plan.importerVersion,
            manifestSha256: plan.manifestSha256,
            mappingSha256: plan.mappingSha256,
          },
        },
      });
      // Prisma expands createMany into one bind parameter per field. For the
      // complete workbook that means tens of thousands of parameters and can
      // consume the whole transaction budget under parallel test load. A
      // single JSONB parameter keeps the insert atomic while PostgreSQL still
      // applies every schema constraint to every preserved row.
      await transaction.$executeRawUnsafe(
        `INSERT INTO "legacy_records" (
           "id", "legacy_source_id", "import_batch_id", "source_entity",
           "legacy_id", "legacy_row_number", "raw_data", "raw_hash", "status"
         )
         SELECT
           (record->>'id')::uuid,
           (record->>'legacySourceId')::uuid,
           (record->>'importBatchId')::uuid,
           record->>'sourceEntity',
           record->>'legacyId',
           (record->>'legacyRowNumber')::integer,
           record->'rawData',
           record->>'rawHash',
           (record->>'status')::"legacy_record_status"
         FROM jsonb_array_elements($1::jsonb) AS record`,
        JSON.stringify(legacyRecords),
      );
      await transaction.reconciliationIssue.createMany({
        data: reconciliationIssues,
      });
      await transaction.importBatch.update({
        where: { id: plan.importBatchId },
        data: {
          status: 'COMMITTED',
          completedAt: new Date(),
          summary: databaseJson(result),
        },
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
    businessEntityWriteCount: 0,
    persistentImportAuthorized: false,
  };
}
