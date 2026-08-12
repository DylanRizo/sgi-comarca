import type { DatabaseClient } from '@sgi/database';
import { canonicalJson } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import type {
  ImportPlan,
  JsonValue,
  ReconciliationResult,
} from '../domain/import-types.js';

type ImportTransaction = Pick<
  DatabaseClient,
  | '$executeRawUnsafe'
  | '$queryRawUnsafe'
  | 'auditLog'
  | 'importBatch'
  | 'inventoryBalance'
  | 'inventoryMovement'
  | 'legacyRecord'
  | 'legacySource'
  | 'product'
  | 'productWarehouseValuation'
  | 'reconciliationIssue'
  | 'sale'
  | 'saleCancellation'
  | 'saleItem'
  | 'inTransitConfirmation'
  | 'unit'
  | 'warehouse'
>;

export type PersistenceFailurePoint =
  | 'UNIT_10'
  | 'PRODUCT_80'
  | 'BALANCE_200'
  | 'VALUATION_300'
  | 'RECONCILIATION_ISSUE'
  | 'AUDIT_LOG'
  | 'BATCH_FINALIZATION';

export interface ImportAuditRecord {
  id: string;
  actorUserId: string;
  action: 'legacy_import.committed';
  entityType: 'ImportBatch';
  entityId: string;
  metadata: JsonValue;
}

export interface PersistImportOptions {
  mode: 'DRY_RUN' | 'COMMIT';
  finalSummary: unknown;
  payload: PreparedPersistencePayload;
  audit?: ImportAuditRecord;
  failurePoint?: PersistenceFailurePoint;
  beforeFinalCommit?: () => Promise<void>;
  onPhaseTiming?: (phase: string, durationMs: number) => void;
}

export interface PreparedPersistencePayload {
  rawRecordsJson: string;
  units: Array<{ id: string; code: string; name: string }>;
  products: Array<{
    id: string;
    code: string;
    name: string;
    unitId: string;
    minimumStock: string;
    createdAt: Date;
  }>;
  balances: Array<{
    id: string;
    productId: string;
    warehouseCode: string;
    quantity: string;
    currentUnitPrice: string;
    currentUnitCost: string;
    priceReviewRequired: boolean;
    costReviewRequired: boolean;
  }>;
  recordLinks: Array<{
    recordId: string;
    targetUnitId: string | null;
    targetProductId: string | null;
    targetWarehouseCode: string | null;
    targetInventoryBalanceId: string | null;
  }>;
  valuations: Array<{
    id: string;
    productId: string;
    warehouseCode: string;
    unitPrice: string;
    unitCost: string;
    currencyCode: 'NIO';
    observedAt: Date;
    effectiveAt: Date;
    legacyRecordId: string;
    requiresHumanReview: boolean;
    reviewReason: string | null;
  }>;
  reconciliationIssues: Array<{
    id: string;
    importBatchId: string;
    legacyRecordId: string | null;
    code: string;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    status: 'OPEN' | 'RESOLVED' | 'REQUIRES_HUMAN_APPROVAL';
    requiresHumanApproval: boolean;
    message: string;
    details: never;
    entityType: string | null;
  }>;
}

export function preparePersistencePayload(
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
): PreparedPersistencePayload {
  const business = plan.businessPlan;
  return {
    rawRecordsJson: JSON.stringify(
      plan.records.map((record) => ({
        id: record.id,
        legacySourceId: record.legacySourceId,
        importBatchId: record.importBatchId,
        sourceEntity: record.sourceEntity,
        legacyId: record.legacyId,
        legacyRowNumber: record.legacyRowNumber,
        rawData: databaseJson(record.rawData),
        rawHash: record.rawHash,
        status: record.status,
      })),
    ),
    units: (business?.units ?? []).map(({ id, code, name }) => ({
      id,
      code,
      name,
    })),
    products: (business?.products ?? []).map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      unitId: product.unitId,
      minimumStock: product.minimumStock,
      createdAt: new Date(product.createdAt),
    })),
    balances: (business?.inventoryBalances ?? []).map((balance) => ({
      id: balance.id,
      productId: balance.productId,
      warehouseCode: balance.warehouseCode,
      quantity: balance.quantity,
      currentUnitPrice: balance.currentUnitPrice,
      currentUnitCost: balance.currentUnitCost,
      priceReviewRequired: balance.priceReviewRequired,
      costReviewRequired: balance.costReviewRequired,
    })),
    recordLinks: [...(business?.recordLinks ?? [])],
    valuations: (business?.productWarehouseValuations ?? []).map(
      (valuation) => ({
        id: valuation.id,
        productId: valuation.productId,
        warehouseCode: valuation.warehouseCode,
        unitPrice: valuation.unitPrice,
        unitCost: valuation.unitCost,
        currencyCode: 'NIO',
        observedAt: new Date(valuation.observedAt),
        effectiveAt: new Date(valuation.effectiveAt),
        legacyRecordId: valuation.legacyRecordId,
        requiresHumanReview: valuation.requiresHumanReview,
        reviewReason: valuation.reviewReason,
      }),
    ),
    reconciliationIssues: reconciliation.issues.map((issue) => ({
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
    })),
  };
}

async function measured<T>(
  options: PersistImportOptions,
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    options.onPhaseTiming?.(phase, performance.now() - startedAt);
  }
}

function databaseJson(value: unknown): never {
  return JSON.parse(canonicalJson(value)) as never;
}

async function createManyWithInjectedFailure<T>(options: {
  values: T[];
  failurePoint: PersistenceFailurePoint | undefined;
  expectedFailurePoint: PersistenceFailurePoint;
  failureIndex: number;
  createMany(values: T[]): Promise<unknown>;
}): Promise<void> {
  if (options.failurePoint !== options.expectedFailurePoint) {
    await options.createMany(options.values);
    return;
  }
  await options.createMany(options.values.slice(0, options.failureIndex - 1));
  throw new LegacyImporterError(
    `SIMULATED_FAILURE:${options.expectedFailurePoint}`,
    6,
  );
}

export async function persistImportPlan(
  transaction: ImportTransaction,
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
  options: PersistImportOptions,
): Promise<void> {
  const businessPlan = plan.businessPlan;
  const payload = options.payload;
  const databaseSourceCode = plan.sourceCode.toUpperCase();
  await measured(options, 'legacy-source', async () => {
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
  });
  await measured(options, 'import-batch-running', () =>
    transaction.importBatch.create({
      data: {
        id: plan.importBatchId,
        legacySourceId: plan.legacySourceId,
        mode: options.mode,
        status: 'RUNNING',
        sourceChecksum: plan.sourceSha256,
        mappingVersion: plan.mappingVersion,
        startedAt: new Date(),
        summary: databaseJson({
          approvedPlanKey: plan.approvedPlanKey,
          batchKey: plan.batchKey,
          executionMode: options.mode,
          importerVersion: plan.importerVersion,
          manifestSha256: plan.manifestSha256,
          mappingSha256: plan.mappingSha256,
        }),
      },
    }),
  );
  await measured(options, 'legacy-records', () =>
    transaction.$executeRawUnsafe(
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
      payload.rawRecordsJson,
    ),
  );

  const warehouseRows = await measured(options, 'warehouse-read', () =>
    transaction.warehouse.findMany({ select: { id: true, code: true } }),
  );
  const warehouseIds = new Map(warehouseRows.map(({ id, code }) => [code, id]));
  if (businessPlan !== undefined) {
    const requiredWarehouseCodes = new Set(
      businessPlan.inventoryBalances.map(({ warehouseCode }) => warehouseCode),
    );
    if (
      [...requiredWarehouseCodes].some(
        (warehouseCode) => !warehouseIds.has(warehouseCode),
      )
    ) {
      throw new LegacyImporterError('TARGET_WAREHOUSE_MISSING', 4);
    }
    await measured(options, 'units', () =>
      createManyWithInjectedFailure({
        values: payload.units,
        failurePoint: options.failurePoint,
        expectedFailurePoint: 'UNIT_10',
        failureIndex: 10,
        createMany: async (values) =>
          transaction.unit.createMany({ data: values }),
      }),
    );
    await measured(options, 'products', () =>
      createManyWithInjectedFailure({
        values: payload.products,
        failurePoint: options.failurePoint,
        expectedFailurePoint: 'PRODUCT_80',
        failureIndex: 80,
        createMany: async (values) =>
          transaction.product.createMany({ data: values }),
      }),
    );
    const balances = payload.balances.map((balance) => ({
      id: balance.id,
      productId: balance.productId,
      warehouseId: warehouseIds.get(balance.warehouseCode)!,
      quantity: balance.quantity,
      currentUnitPrice: balance.currentUnitPrice,
      currentUnitCost: balance.currentUnitCost,
      priceReviewRequired: balance.priceReviewRequired,
      costReviewRequired: balance.costReviewRequired,
    }));
    await measured(options, 'inventory-balances', () =>
      createManyWithInjectedFailure({
        values: balances,
        failurePoint: options.failurePoint,
        expectedFailurePoint: 'BALANCE_200',
        failureIndex: 200,
        createMany: async (values) =>
          transaction.inventoryBalance.createMany({ data: values }),
      }),
    );

    const links = payload.recordLinks.map((link) => ({
      recordId: link.recordId,
      targetUnitId: link.targetUnitId,
      targetProductId: link.targetProductId,
      targetWarehouseId:
        link.targetWarehouseCode === null
          ? null
          : warehouseIds.get(link.targetWarehouseCode),
      targetInventoryBalanceId: link.targetInventoryBalanceId,
    }));
    await measured(options, 'legacy-record-links', () =>
      transaction.$executeRawUnsafe(
        `UPDATE legacy_records AS target
          SET target_unit_id = NULLIF(link->>'targetUnitId', '')::uuid,
              target_product_id = NULLIF(link->>'targetProductId', '')::uuid,
              target_warehouse_id = NULLIF(link->>'targetWarehouseId', '')::uuid,
              target_inventory_balance_id = NULLIF(link->>'targetInventoryBalanceId', '')::uuid
         FROM jsonb_array_elements($1::jsonb) AS link
        WHERE target.id = (link->>'recordId')::uuid`,
        JSON.stringify(links),
      ),
    );
    const valuations = payload.valuations.map((valuation) => ({
      id: valuation.id,
      productId: valuation.productId,
      warehouseId: warehouseIds.get(valuation.warehouseCode)!,
      unitPrice: valuation.unitPrice,
      unitCost: valuation.unitCost,
      currencyCode: 'NIO',
      observedAt: valuation.observedAt,
      effectiveAt: valuation.effectiveAt,
      legacyRecordId: valuation.legacyRecordId,
      requiresHumanReview: valuation.requiresHumanReview,
      reviewReason: valuation.reviewReason,
    }));
    await measured(options, 'valuations', () =>
      createManyWithInjectedFailure({
        values: valuations,
        failurePoint: options.failurePoint,
        expectedFailurePoint: 'VALUATION_300',
        failureIndex: 300,
        createMany: async (values) =>
          transaction.productWarehouseValuation.createMany({ data: values }),
      }),
    );
  }

  if (options.failurePoint === 'RECONCILIATION_ISSUE') {
    throw new LegacyImporterError('SIMULATED_FAILURE:RECONCILIATION_ISSUE', 6);
  }
  await measured(options, 'reconciliation-issues', () =>
    transaction.reconciliationIssue.createMany({
      data: payload.reconciliationIssues,
    }),
  );
  if (options.audit !== undefined) {
    const audit = options.audit;
    if (options.failurePoint === 'AUDIT_LOG') {
      throw new LegacyImporterError('SIMULATED_FAILURE:AUDIT_LOG', 6);
    }
    await measured(options, 'audit-log', () =>
      transaction.auditLog.create({
        data: {
          id: audit.id,
          actorUserId: audit.actorUserId,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
          metadata: databaseJson(audit.metadata),
        },
      }),
    );
  }
  await measured(options, 'persistence-invariants', () =>
    assertPersistedCounts(transaction, plan, reconciliation, options.audit),
  );
  await measured(options, 'final-source-check', async () =>
    options.beforeFinalCommit?.(),
  );
  if (options.failurePoint === 'BATCH_FINALIZATION') {
    throw new LegacyImporterError('SIMULATED_FAILURE:BATCH_FINALIZATION', 6);
  }
  await measured(options, 'import-batch-committed', () =>
    transaction.importBatch.update({
      where: { id: plan.importBatchId },
      data: {
        status: 'COMMITTED',
        completedAt: new Date(),
        summary: databaseJson(options.finalSummary),
      },
    }),
  );
}

async function assertPersistedCounts(
  transaction: ImportTransaction,
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
  audit: ImportAuditRecord | undefined,
): Promise<void> {
  const business = plan.businessPlan;
  const rows = await transaction.$queryRawUnsafe<
    Array<{
      legacy_records: bigint;
      issues: bigint;
      units: bigint;
      products: bigint;
      balances: bigint;
      valuations: bigint;
      movements: bigint;
      sales: bigint;
      sale_items: bigint;
      sale_cancellations: bigint;
      in_transit_confirmations: bigint;
      audits: bigint;
    }>
  >(
    `SELECT
       (SELECT count(*) FROM legacy_records WHERE import_batch_id = $1::uuid) AS legacy_records,
       (SELECT count(*) FROM reconciliation_issues WHERE import_batch_id = $1::uuid) AS issues,
       (SELECT count(*) FROM units WHERE id = ANY($2::uuid[])) AS units,
       (SELECT count(*) FROM products WHERE id = ANY($3::uuid[])) AS products,
       (SELECT count(*) FROM inventory_balances WHERE id = ANY($4::uuid[])) AS balances,
       (SELECT count(*) FROM product_warehouse_valuations WHERE id = ANY($5::uuid[])) AS valuations,
       (SELECT count(*) FROM inventory_movements) AS movements,
       (SELECT count(*) FROM sales) AS sales,
       (SELECT count(*) FROM sale_items) AS sale_items,
       (SELECT count(*) FROM sale_cancellations) AS sale_cancellations,
       (SELECT count(*) FROM in_transit_confirmations) AS in_transit_confirmations,
       (SELECT count(*) FROM audit_logs WHERE id = $6::uuid) AS audits`,
    plan.importBatchId,
    business?.units.map(({ id }) => id) ?? [],
    business?.products.map(({ id }) => id) ?? [],
    business?.inventoryBalances.map(({ id }) => id) ?? [],
    business?.productWarehouseValuations.map(({ id }) => id) ?? [],
    audit?.id ?? '00000000-0000-0000-0000-000000000000',
  );
  const counts = rows[0];
  if (counts === undefined) {
    throw new LegacyImporterError('IMPORT_PERSISTENCE_INVARIANT_FAILED', 6);
  }
  if (
    Number(counts.legacy_records) !== plan.totalSourceRows ||
    Number(counts.issues) !== reconciliation.issues.length ||
    Number(counts.units) !== (business?.units.length ?? 0) ||
    Number(counts.products) !== (business?.products.length ?? 0) ||
    Number(counts.balances) !== (business?.inventoryBalances.length ?? 0) ||
    Number(counts.valuations) !==
      (business?.productWarehouseValuations.length ?? 0) ||
    Number(counts.movements) !== 0 ||
    Number(counts.sales) !== 0 ||
    Number(counts.sale_items) !== 0 ||
    Number(counts.sale_cancellations) !== 0 ||
    Number(counts.in_transit_confirmations) !== 0 ||
    (audit !== undefined && Number(counts.audits) !== 1)
  ) {
    throw new LegacyImporterError('IMPORT_PERSISTENCE_INVARIANT_FAILED', 6);
  }
}
