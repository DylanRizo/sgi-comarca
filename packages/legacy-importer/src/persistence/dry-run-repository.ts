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
  const recordLinks = new Map(
    (plan.businessPlan?.recordLinks ?? []).map((link) => [link.recordId, link]),
  );
  const legacyRecordBases = plan.records.map((record) => ({
    id: record.id,
    legacySourceId: record.legacySourceId,
    importBatchId: record.importBatchId,
    sourceEntity: record.sourceEntity,
    legacyId: record.legacyId,
    legacyRowNumber: record.legacyRowNumber,
    rawData: databaseJson(record.rawData),
    rawHash: record.rawHash,
    status: record.status,
    link: recordLinks.get(record.id),
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
      const warehouseIds = new Map(
        (
          await transaction.warehouse.findMany({
            select: { id: true, code: true },
          })
        ).map(({ id, code }) => [code, id]),
      );
      const businessPlan = plan.businessPlan;
      if (businessPlan !== undefined) {
        const requiredWarehouseCodes = new Set(
          businessPlan.inventoryBalances.map(
            ({ warehouseCode }) => warehouseCode,
          ),
        );
        if (
          [...requiredWarehouseCodes].some(
            (warehouseCode) => !warehouseIds.has(warehouseCode),
          )
        ) {
          throw new LegacyImporterError('TARGET_WAREHOUSE_MISSING', 4);
        }
        await transaction.unit.createMany({
          data: businessPlan.units.map(({ id, code, name }) => ({
            id,
            code,
            name,
          })),
        });
        await transaction.product.createMany({
          data: businessPlan.products.map((product) => ({
            id: product.id,
            code: product.code,
            name: product.name,
            unitId: product.unitId,
            minimumStock: product.minimumStock,
            createdAt: new Date(product.createdAt),
          })),
        });
        await transaction.inventoryBalance.createMany({
          data: businessPlan.inventoryBalances.map((balance) => ({
            id: balance.id,
            productId: balance.productId,
            warehouseId: warehouseIds.get(balance.warehouseCode)!,
            quantity: balance.quantity,
            currentUnitPrice: balance.currentUnitPrice,
            currentUnitCost: balance.currentUnitCost,
            priceReviewRequired: balance.priceReviewRequired,
            costReviewRequired: balance.costReviewRequired,
          })),
        });
      }
      const legacyRecords = legacyRecordBases.map(({ link, ...record }) => ({
        ...record,
        targetUnitId: link?.targetUnitId ?? null,
        targetProductId: link?.targetProductId ?? null,
        targetWarehouseId:
          link?.targetWarehouseCode === null ||
          link?.targetWarehouseCode === undefined
            ? null
            : warehouseIds.get(link.targetWarehouseCode),
        targetInventoryBalanceId: link?.targetInventoryBalanceId ?? null,
      }));
      // Prisma expands createMany into one bind parameter per field. For the
      // complete workbook that means tens of thousands of parameters and can
      // consume the whole transaction budget under parallel test load. A
      // single JSONB parameter keeps the insert atomic while PostgreSQL still
      // applies every schema constraint to every preserved row.
      await transaction.$executeRawUnsafe(
        `INSERT INTO "legacy_records" (
           "id", "legacy_source_id", "import_batch_id", "source_entity",
           "legacy_id", "legacy_row_number", "raw_data", "raw_hash", "status",
           "target_unit_id", "target_product_id", "target_warehouse_id",
           "target_inventory_balance_id"
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
           (record->>'status')::"legacy_record_status",
           NULLIF(record->>'targetUnitId', '')::uuid,
           NULLIF(record->>'targetProductId', '')::uuid,
           NULLIF(record->>'targetWarehouseId', '')::uuid,
           NULLIF(record->>'targetInventoryBalanceId', '')::uuid
         FROM jsonb_array_elements($1::jsonb) AS record`,
        JSON.stringify(legacyRecords),
      );
      if (businessPlan !== undefined) {
        await transaction.productWarehouseValuation.createMany({
          data: businessPlan.productWarehouseValuations.map((valuation) => ({
            id: valuation.id,
            productId: valuation.productId,
            warehouseId: warehouseIds.get(valuation.warehouseCode)!,
            unitPrice: valuation.unitPrice,
            unitCost: valuation.unitCost,
            currencyCode: 'NIO',
            observedAt: new Date(valuation.observedAt),
            effectiveAt: new Date(valuation.effectiveAt),
            legacyRecordId: valuation.legacyRecordId,
            requiresHumanReview: valuation.requiresHumanReview,
            reviewReason: valuation.reviewReason,
          })),
        });
      }
      await transaction.reconciliationIssue.createMany({
        data: reconciliationIssues,
      });
      const [legacyRecordCount, reconciliationIssueCount] = await Promise.all([
        transaction.legacyRecord.count({
          where: { importBatchId: plan.importBatchId },
        }),
        transaction.reconciliationIssue.count({
          where: { importBatchId: plan.importBatchId },
        }),
      ]);
      if (
        legacyRecordCount !== plan.totalSourceRows ||
        reconciliationIssueCount !== reconciliation.issues.length
      ) {
        throw new LegacyImporterError(
          'DRY_RUN_PERSISTENCE_INVARIANT_FAILED',
          6,
        );
      }
      if (businessPlan !== undefined) {
        const [
          unitCount,
          productCount,
          balanceCount,
          valuationCount,
          inventoryRecordCount,
          missingObservedAtIssueCount,
          movementCount,
          saleCount,
          saleItemCount,
        ] = await Promise.all([
          transaction.unit.count({
            where: { id: { in: businessPlan.units.map(({ id }) => id) } },
          }),
          transaction.product.count({
            where: { id: { in: businessPlan.products.map(({ id }) => id) } },
          }),
          transaction.inventoryBalance.count({
            where: {
              id: { in: businessPlan.inventoryBalances.map(({ id }) => id) },
            },
          }),
          transaction.productWarehouseValuation.count({
            where: {
              id: {
                in: businessPlan.productWarehouseValuations.map(({ id }) => id),
              },
            },
          }),
          transaction.legacyRecord.count({
            where: {
              importBatchId: plan.importBatchId,
              sourceEntity: 'Inventario',
            },
          }),
          transaction.reconciliationIssue.count({
            where: {
              importBatchId: plan.importBatchId,
              code: 'VALUATION_OBSERVED_AT_MISSING',
              status: 'REQUIRES_HUMAN_APPROVAL',
            },
          }),
          transaction.inventoryMovement.count(),
          transaction.sale.count(),
          transaction.saleItem.count(),
        ]);
        if (
          unitCount !== businessPlan.units.length ||
          productCount !== businessPlan.products.length ||
          balanceCount !== businessPlan.inventoryBalances.length ||
          valuationCount !== businessPlan.productWarehouseValuations.length ||
          inventoryRecordCount !==
            plan.records.filter(
              ({ sourceEntity }) => sourceEntity === 'Inventario',
            ).length ||
          missingObservedAtIssueCount !==
            reconciliation.issues.filter(
              ({ code }) => code === 'VALUATION_OBSERVED_AT_MISSING',
            ).length ||
          movementCount !== 0 ||
          saleCount !== 0 ||
          saleItemCount !== 0
        ) {
          throw new LegacyImporterError(
            'WAVE12_DRY_RUN_PERSISTENCE_INVARIANT_FAILED',
            6,
          );
        }
      }
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
