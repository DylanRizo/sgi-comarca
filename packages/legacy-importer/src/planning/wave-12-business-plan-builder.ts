import type {
  NeutralCell,
  NeutralSheet,
  NeutralWorkbook,
} from '@sgi/legacy-profiler';

import { parseUnambiguousDecimal } from '../domain/decimal-parser.js';
import { LegacyImporterError } from '../domain/errors.js';
import { deterministicUuid } from '../domain/identity.js';
import type {
  MappingRegistry,
  PlannedLegacyRecord,
  PlannedReconciliationIssue,
  Wave12BusinessPlan,
} from '../domain/import-types.js';
import { resolveApprovedMapping } from '../mapping/approved-mapping-resolver.js';

const APPROVED_BUSINESS_WRITES = [
  'InventoryBalance',
  'Product',
  'ProductWarehouseValuation',
  'Unit',
] as const;

const APPROVED_UNIT_MAPPINGS = new Map([
  ['Unidades', 'UNIDADES'],
  ['Unidad', 'UNIDADES'],
  ['Kilogramos', 'KILOGRAMOS'],
  ['Gramos', 'GRAMOS'],
  ['Toneladas', 'TONELADAS'],
  ['Litros', 'LITROS'],
  ['Mililitros', 'MILILITROS'],
  ['Metros', 'METROS'],
  ['Centímetros', 'CENTIMETROS'],
  ['Metros Cuadrados', 'METROS_CUADRADOS'],
  ['Metros Cúbicos', 'METROS_CUBICOS'],
  ['Piezas', 'PIEZAS'],
  ['Cajas', 'CAJAS'],
  ['Paquetes', 'PAQUETES'],
  ['Docenas', 'DOCENAS'],
]);

const APPROVED_WAREHOUSE_MAPPINGS = new Map([
  ['Casa Dylan', 'CASA_DYLAN'],
  ['Casa Luden', 'CASA_LUDEN'],
  ['Casa Jean', 'CASA_JEAN'],
]);

const APPROVED_DEFERRED_SCOPES = new Map([
  ['salesGrouping', 'PHASE_7'],
  ['salesDuplicatePairs', 'PHASE_7'],
  ['salesWithoutMovement', 'PHASE_7'],
  ['salesUnresolvedProductReferences', 'PHASE_7'],
  ['salesUserMappings', 'PHASE_7'],
  ['movementRoutes', 'PHASE_6'],
  ['movementWithoutSale', 'PHASE_6'],
  ['dailyClosings', 'PHASE_8'],
]);

class SheetView {
  readonly rows = new Map<number, Map<number, NeutralCell>>();

  constructor(readonly sheet: NeutralSheet) {
    for (const cell of sheet.cells) {
      const row = this.rows.get(cell.row) ?? new Map<number, NeutralCell>();
      row.set(cell.column, cell);
      this.rows.set(cell.row, row);
    }
  }

  value(row: number, column: number): unknown {
    return this.rows.get(row)?.get(column)?.value;
  }
}

function exactText(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LegacyImporterError(code, 6);
  }
  return value;
}

function decimal(value: unknown, scale: number, code: string): string {
  try {
    return parseUnambiguousDecimal(value, scale).canonical;
  } catch {
    throw new LegacyImporterError(code, 6);
  }
}

function instant(
  value: unknown,
  dateSystem: NeutralWorkbook['dateSystem'],
  code: string,
): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    const epoch =
      dateSystem === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const converted = new Date(epoch + value * 86_400_000);
    if (!Number.isNaN(converted.getTime())) return converted.toISOString();
  }
  throw new LegacyImporterError(code, 6);
}

function optionalInstant(
  value: unknown,
  dateSystem: NeutralWorkbook['dateSystem'],
): string | null {
  if (value === undefined || value === null || value === '') return null;
  return instant(value, dateSystem, 'INVENTORY_OBSERVED_AT_INVALID');
}

function sheet(workbook: NeutralWorkbook, name: string): SheetView {
  const source = workbook.sheets.find((candidate) => candidate.name === name);
  if (source === undefined) {
    throw new LegacyImporterError('WAVE12_SOURCE_SHEET_MISSING', 6);
  }
  return new SheetView(source);
}

function sourceRecords(
  records: PlannedLegacyRecord[],
  sourceEntity: string,
): PlannedLegacyRecord[] {
  return records
    .filter((record) => record.sourceEntity === sourceEntity)
    .sort((left, right) => left.legacyRowNumber - right.legacyRowNumber);
}

function issue(
  importBatchId: string,
  input: Omit<PlannedReconciliationIssue, 'id' | 'importBatchId'>,
): PlannedReconciliationIssue {
  return {
    id: deterministicUuid('reconciliation-issue', {
      importBatchId,
      code: input.code,
      legacyRecordId: input.legacyRecordId,
      details: input.details,
    }),
    importBatchId,
    ...input,
  };
}

function assertApprovedRegistry(mapping: MappingRegistry): void {
  const writes = [...mapping.approvedMappings.businessEntityWrites].sort();
  if (
    writes.length !== APPROVED_BUSINESS_WRITES.length ||
    writes.some((value, index) => value !== APPROVED_BUSINESS_WRITES[index])
  ) {
    throw new LegacyImporterError('WAVE12_BUSINESS_WRITE_SCOPE_INVALID', 4);
  }
  const decisions = mapping.approvedDecisions;
  if (
    decisions === undefined ||
    decisions.inventorySnapshotSelection.strategy !==
      'LATEST_SOURCE_TIMESTAMP' ||
    decisions.zeroCostPolicy !== 'PRESERVE_ZERO_AND_REVIEW' ||
    decisions.valuationPolicy !== 'PER_WAREHOUSE' ||
    decisions.missingValuationObservedAtPolicy.sourceSheet !== 'Inventario' ||
    decisions.missingValuationObservedAtPolicy.action !==
      'PRESERVE_RAW_AND_BALANCE_WITHOUT_VALUATION' ||
    decisions.missingValuationObservedAtPolicy.issueCode !==
      'VALUATION_OBSERVED_AT_MISSING' ||
    decisions.missingValuationObservedAtPolicy.physicalRows.length !== 2 ||
    decisions.missingValuationObservedAtPolicy.physicalRows
      .slice()
      .sort((left, right) => left - right)
      .some((row, index) => row !== [153, 154][index]) ||
    decisions.inventoryAuthority !== 'INVENTORY_SHEET' ||
    decisions.semanticTextPolicy !== 'PRESERVE_PHYSICAL_TEXT'
  ) {
    throw new LegacyImporterError('WAVE12_APPROVED_DECISIONS_MISSING', 4);
  }
  if (
    mapping.approvedMappings.units.length !== APPROVED_UNIT_MAPPINGS.size ||
    mapping.approvedMappings.units.some(
      ({ sourceValue, targetCode }) =>
        APPROVED_UNIT_MAPPINGS.get(sourceValue) !== targetCode,
    ) ||
    mapping.approvedMappings.warehouses.length !==
      APPROVED_WAREHOUSE_MAPPINGS.size ||
    mapping.approvedMappings.warehouses.some(
      ({ sourceValue, targetCode }) =>
        APPROVED_WAREHOUSE_MAPPINGS.get(sourceValue) !== targetCode,
    )
  ) {
    throw new LegacyImporterError('WAVE12_APPROVED_MAPPING_MATRIX_INVALID', 4);
  }
  const deferredScopes = Object.entries(decisions.deferredScopes);
  if (
    deferredScopes.length !== APPROVED_DEFERRED_SCOPES.size ||
    deferredScopes.some(
      ([scope, phase]) => APPROVED_DEFERRED_SCOPES.get(scope) !== phase,
    )
  ) {
    throw new LegacyImporterError('WAVE12_DEFERRED_SCOPE_MATRIX_INVALID', 4);
  }
}

export function buildWave12BusinessPlan(
  workbook: NeutralWorkbook,
  mapping: MappingRegistry,
  records: PlannedLegacyRecord[],
  importBatchId: string,
): Wave12BusinessPlan {
  assertApprovedRegistry(mapping);
  const links = new Map<string, Wave12BusinessPlan['recordLinks'][number]>();
  const link = (record: PlannedLegacyRecord) => {
    const existing = links.get(record.id);
    if (existing !== undefined) return existing;
    const created = {
      recordId: record.id,
      targetUnitId: null,
      targetProductId: null,
      targetWarehouseCode: null,
      targetInventoryBalanceId: null,
      mappingStatus: 'APPROVED' as const,
      errorCodes: [] as string[],
    };
    links.set(record.id, created);
    return created;
  };

  const unitsSheet = sheet(workbook, 'Unidades');
  const units = sourceRecords(records, 'Unidades').map((record) => {
    const name = exactText(
      unitsSheet.value(record.legacyRowNumber, 1),
      'UNIT_SOURCE_VALUE_INVALID',
    );
    const resolution = resolveApprovedMapping(
      name,
      mapping.approvedMappings.units,
    );
    if (resolution.status !== 'APPROVED' || resolution.targetCode === null) {
      throw new LegacyImporterError('UNIT_MAPPING_UNRESOLVED', 4);
    }
    const id = deterministicUuid('unit', {
      sourceCode: workbook.sourceCode,
      targetCode: resolution.targetCode,
    });
    link(record).targetUnitId = id;
    return { id, code: resolution.targetCode, name, sourceRecordId: record.id };
  });
  if (
    units.length !== 14 ||
    new Set(units.map(({ code }) => code)).size !== 14
  ) {
    throw new LegacyImporterError('UNIT_CATALOG_INVARIANT_FAILED', 6);
  }
  const unitIds = new Map(units.map(({ code, id }) => [code, id]));

  const productsSheet = sheet(workbook, 'Productos');
  const productRecords = sourceRecords(records, 'Productos');
  const byProductCode = new Map<string, PlannedLegacyRecord[]>();
  for (const record of productRecords) {
    const code = exactText(
      productsSheet.value(record.legacyRowNumber, 1),
      'PRODUCT_CODE_INVALID',
    );
    const group = byProductCode.get(code) ?? [];
    group.push(record);
    byProductCode.set(code, group);
  }
  const products = [...byProductCode.entries()].map(([code, group]) => {
    const canonicalDecision =
      mapping.approvedDecisions?.productCanonicalization.find(
        (decision) => decision.sourceCode === code,
      );
    const canonical =
      group.length === 1
        ? group[0]
        : group.find(
            ({ legacyRowNumber }) =>
              legacyRowNumber === canonicalDecision?.canonicalRow,
          );
    if (
      canonical === undefined ||
      (group.length > 1 &&
        (canonicalDecision === undefined ||
          canonicalDecision.evidenceOnlyRows.length !== group.length - 1 ||
          canonicalDecision.evidenceOnlyRows
            .slice()
            .sort((left, right) => left - right)
            .some(
              (row, index) =>
                row !==
                group
                  .filter(({ id }) => id !== canonical.id)
                  .map(({ legacyRowNumber }) => legacyRowNumber)
                  .sort((left, right) => left - right)[index],
            )))
    ) {
      throw new LegacyImporterError('PRODUCT_DUPLICATE_DECISION_MISSING', 4);
    }
    const unitSource = exactText(
      productsSheet.value(canonical.legacyRowNumber, 3),
      'PRODUCT_UNIT_INVALID',
    );
    const unitResolution = resolveApprovedMapping(
      unitSource,
      mapping.approvedMappings.units,
    );
    const unitId =
      unitResolution.targetCode === null
        ? undefined
        : unitIds.get(unitResolution.targetCode);
    if (unitResolution.status !== 'APPROVED' || unitId === undefined) {
      throw new LegacyImporterError('PRODUCT_UNIT_MAPPING_UNRESOLVED', 4);
    }
    const id = deterministicUuid('product', {
      sourceCode: workbook.sourceCode,
      code,
    });
    for (const record of group) {
      const recordLink = link(record);
      recordLink.targetProductId = id;
      recordLink.targetUnitId = unitId;
      if (record.id !== canonical.id) {
        recordLink.errorCodes.push('DEC_004_DUPLICATE_RAW_ONLY');
      }
    }
    return {
      id,
      code,
      name: exactText(
        productsSheet.value(canonical.legacyRowNumber, 2),
        'PRODUCT_NAME_INVALID',
      ),
      unitId,
      minimumStock: decimal(
        productsSheet.value(canonical.legacyRowNumber, 5),
        4,
        'PRODUCT_MINIMUM_STOCK_INVALID',
      ),
      createdAt: instant(
        productsSheet.value(canonical.legacyRowNumber, 7),
        workbook.dateSystem,
        'PRODUCT_CREATED_AT_INVALID',
      ),
      canonicalSourceRecordId: canonical.id,
      evidenceSourceRecordIds: group
        .filter(({ id: recordId }) => recordId !== canonical.id)
        .map(({ id: recordId }) => recordId),
    };
  });
  if (products.length !== 144) {
    throw new LegacyImporterError('PRODUCT_COUNT_INVARIANT_FAILED', 6);
  }
  const productIds = new Map(products.map(({ code, id }) => [code, id]));

  const inventorySheet = sheet(workbook, 'Inventario');
  const inventoryGroups = new Map<
    string,
    Array<{
      record: PlannedLegacyRecord;
      productCode: string;
      productId: string;
      warehouseCode: string;
      quantity: string;
      unitCost: string;
      unitPrice: string;
      observedAt: string | null;
    }>
  >();
  for (const record of sourceRecords(records, 'Inventario')) {
    const productCode = exactText(
      inventorySheet.value(record.legacyRowNumber, 1),
      'INVENTORY_PRODUCT_CODE_INVALID',
    );
    const productId = productIds.get(productCode);
    if (productId === undefined) {
      throw new LegacyImporterError('INVENTORY_PRODUCT_MAPPING_UNRESOLVED', 4);
    }
    const warehouseSource = exactText(
      inventorySheet.value(record.legacyRowNumber, 7),
      'INVENTORY_WAREHOUSE_INVALID',
    );
    const warehouse = resolveApprovedMapping(
      warehouseSource,
      mapping.approvedMappings.warehouses,
    );
    if (warehouse.status !== 'APPROVED' || warehouse.targetCode === null) {
      throw new LegacyImporterError(
        'INVENTORY_WAREHOUSE_MAPPING_UNRESOLVED',
        4,
      );
    }
    const row = {
      record,
      productCode,
      productId,
      warehouseCode: warehouse.targetCode,
      quantity: decimal(
        inventorySheet.value(record.legacyRowNumber, 3),
        4,
        'INVENTORY_QUANTITY_INVALID',
      ),
      unitCost: decimal(
        inventorySheet.value(record.legacyRowNumber, 5),
        2,
        'INVENTORY_COST_INVALID',
      ),
      unitPrice: decimal(
        inventorySheet.value(record.legacyRowNumber, 6),
        2,
        'INVENTORY_PRICE_INVALID',
      ),
      observedAt: optionalInstant(
        inventorySheet.value(record.legacyRowNumber, 8),
        workbook.dateSystem,
      ),
    };
    const key = `${productId}\u0000${warehouse.targetCode}`;
    const group = inventoryGroups.get(key) ?? [];
    group.push(row);
    inventoryGroups.set(key, group);
  }

  const inventoryBalances: Wave12BusinessPlan['inventoryBalances'] = [];
  const valuations: Wave12BusinessPlan['productWarehouseValuations'] = [];
  const businessIssues: PlannedReconciliationIssue[] = [];
  let missingValuationObservedAt = 0;
  const duplicateInventoryGroups = [...inventoryGroups.values()].filter(
    (group) => group.length > 1,
  );
  if (
    duplicateInventoryGroups.length !== 2 ||
    duplicateInventoryGroups.some(
      (group) =>
        group.length !== 2 ||
        group.some(({ productCode }) => productCode !== 'CCWH-L'),
    ) ||
    new Set(duplicateInventoryGroups.map(({ 0: row }) => row!.warehouseCode))
      .size !== 2
  ) {
    throw new LegacyImporterError('CCWH_L_SNAPSHOT_INVARIANT_FAILED', 6);
  }
  for (const [key, group] of inventoryGroups) {
    group.sort(
      (left, right) =>
        (left.observedAt === null
          ? right.observedAt === null
            ? 0
            : -1
          : right.observedAt === null
            ? 1
            : left.observedAt.localeCompare(right.observedAt)) ||
        left.record.legacyRowNumber - right.record.legacyRowNumber,
    );
    const selected = group.at(-1)!;
    const balanceId = deterministicUuid('inventory-balance', {
      sourceCode: workbook.sourceCode,
      key,
    });
    inventoryBalances.push({
      id: balanceId,
      productId: selected.productId,
      warehouseCode: selected.warehouseCode,
      quantity: selected.quantity,
      currentUnitPrice: selected.unitPrice,
      currentUnitCost: selected.unitCost,
      priceReviewRequired: false,
      costReviewRequired: selected.unitCost === '0',
      sourceRecordIds: group.map(({ record }) => record.id),
      selectedSourceRecordId: selected.record.id,
    });
    for (const row of group) {
      const recordLink = link(row.record);
      recordLink.targetProductId = row.productId;
      recordLink.targetWarehouseCode = row.warehouseCode;
      recordLink.targetInventoryBalanceId = balanceId;
      const needsReview = row.unitCost === '0';
      if (row.observedAt === null) {
        missingValuationObservedAt += 1;
        recordLink.errorCodes.push('VALUATION_OBSERVED_AT_MISSING');
        businessIssues.push(
          issue(importBatchId, {
            legacyRecordId: row.record.id,
            code: 'VALUATION_OBSERVED_AT_MISSING',
            severity: 'WARNING',
            status: 'REQUIRES_HUMAN_APPROVAL',
            requiresHumanApproval: true,
            message: 'VALUATION_OMITTED_WITHOUT_FAITHFUL_OBSERVED_AT',
            details: {
              decisionCode: 'PHASE-4B-MISSING-VALUATION-OBSERVED-AT',
              sourceSheet: 'Inventario',
              physicalRow: row.record.legacyRowNumber,
              legacyRecordId: row.record.id,
              targetKey: {
                productId: row.productId,
                warehouseCode: row.warehouseCode,
              },
              inventoryBalanceId: balanceId,
              resolution: 'PRESERVE_RAW_AND_BALANCE_WITHOUT_VALUATION',
              omittedEntity: 'ProductWarehouseValuation',
            },
            entityType: 'ProductWarehouseValuation',
          }),
        );
      } else {
        valuations.push({
          id: deterministicUuid('product-warehouse-valuation', {
            sourceCode: workbook.sourceCode,
            legacyRecordId: row.record.id,
          }),
          productId: row.productId,
          warehouseCode: row.warehouseCode,
          unitPrice: row.unitPrice,
          unitCost: row.unitCost,
          observedAt: row.observedAt,
          effectiveAt: row.observedAt,
          legacyRecordId: row.record.id,
          requiresHumanReview: needsReview,
          reviewReason: needsReview ? 'LEGACY_ZERO_COST' : null,
        });
      }
      if (needsReview) {
        businessIssues.push(
          issue(importBatchId, {
            legacyRecordId: row.record.id,
            code: 'LEGACY_ZERO_COST_REVIEW',
            severity: 'WARNING',
            status: 'REQUIRES_HUMAN_APPROVAL',
            requiresHumanApproval: true,
            message: 'APPROVED_ZERO_COST_PRESERVED_REVIEW_REQUIRED',
            details: {
              decisionCode: 'DEC-015',
              sourceRow: row.record.legacyRowNumber,
              resolution: 'PRESERVE_ZERO_AND_REVIEW',
            },
            entityType: 'ProductWarehouseValuation',
          }),
        );
      }
    }
  }
  if (
    sourceRecords(records, 'Inventario').length !== 359 ||
    inventoryBalances.length !== 357 ||
    valuations.length !== 357 ||
    missingValuationObservedAt !== 2 ||
    sourceRecords(records, 'Inventario')
      .filter((record) =>
        links
          .get(record.id)
          ?.errorCodes.includes('VALUATION_OBSERVED_AT_MISSING'),
      )
      .map(({ legacyRowNumber }) => legacyRowNumber)
      .sort((left, right) => left - right)
      .some((row, index) => row !== [153, 154][index])
  ) {
    throw new LegacyImporterError('INVENTORY_COUNT_INVARIANT_FAILED', 6);
  }

  const movementSheet = sheet(workbook, 'Movimientos');
  const movementBalances = new Map<
    string,
    { balance: string; record: PlannedLegacyRecord }
  >();
  for (const record of sourceRecords(records, 'Movimientos')) {
    const productCode = exactText(
      movementSheet.value(record.legacyRowNumber, 1),
      'MOVEMENT_PRODUCT_CODE_INVALID',
    );
    const productId = productIds.get(productCode);
    if (productId === undefined) continue;
    const warehouseValue = movementSheet.value(record.legacyRowNumber, 9);
    if (typeof warehouseValue !== 'string') continue;
    const warehouse = resolveApprovedMapping(
      warehouseValue,
      mapping.approvedMappings.warehouses,
    );
    if (warehouse.status !== 'APPROVED' || warehouse.targetCode === null) {
      continue;
    }
    movementBalances.set(`${productId}\u0000${warehouse.targetCode}`, {
      balance: decimal(
        movementSheet.value(record.legacyRowNumber, 8),
        4,
        'MOVEMENT_RESULTING_STOCK_INVALID',
      ),
      record,
    });
  }
  let differing = 0;
  let inventoryOnly = 0;
  for (const [key, group] of inventoryGroups) {
    const selected = group.at(-1)!;
    const movement = movementBalances.get(key);
    if (movement === undefined) {
      inventoryOnly += 1;
      businessIssues.push(
        issue(importBatchId, {
          legacyRecordId: selected.record.id,
          code: 'INVENTORY_ONLY_BALANCE_KEY',
          severity: 'INFO',
          status: 'OPEN',
          requiresHumanApproval: false,
          message: 'INVENTORY_AUTHORITY_KEY_WITHOUT_MOVEMENT',
          details: {
            decisionCode: 'DEC-009',
            sourceRow: selected.record.legacyRowNumber,
            resolution: 'IMPORT_INVENTORY_BALANCE',
          },
          entityType: 'InventoryBalance',
        }),
      );
    } else if (movement.balance !== selected.quantity) {
      differing += 1;
      businessIssues.push(
        issue(importBatchId, {
          legacyRecordId: selected.record.id,
          code: 'INVENTORY_MOVEMENT_BALANCE_DIFFERENCE',
          severity: 'WARNING',
          status: 'OPEN',
          requiresHumanApproval: false,
          message: 'INVENTORY_AUTHORITY_BALANCE_DIFFERS_FROM_MOVEMENT',
          details: {
            decisionCode: 'DEC-009',
            inventorySourceRow: selected.record.legacyRowNumber,
            movementSourceRow: movement.record.legacyRowNumber,
            resolution: 'IMPORT_INVENTORY_BALANCE',
          },
          entityType: 'InventoryBalance',
        }),
      );
    }
  }
  let movementOnly = 0;
  for (const [key, movement] of movementBalances) {
    if (inventoryGroups.has(key)) continue;
    movementOnly += 1;
    businessIssues.push(
      issue(importBatchId, {
        legacyRecordId: movement.record.id,
        code: 'MOVEMENT_ONLY_BALANCE_KEY',
        severity: 'INFO',
        status: 'OPEN',
        requiresHumanApproval: false,
        message: 'MOVEMENT_RAW_PRESERVED_WITHOUT_SYNTHETIC_BALANCE',
        details: {
          decisionCode: 'DEC-009',
          sourceRow: movement.record.legacyRowNumber,
          resolution: 'PRESERVE_RAW_ONLY',
        },
        entityType: 'InventoryBalance',
      }),
    );
  }
  if (differing !== 157 || inventoryOnly !== 2 || movementOnly !== 2) {
    throw new LegacyImporterError(
      'INVENTORY_RECONCILIATION_INVARIANT_FAILED',
      6,
    );
  }

  const inventoryProductIds = new Set(
    inventoryBalances.map(({ productId }) => productId),
  );
  const productsWithoutInventory = products.filter(
    ({ id }) => !inventoryProductIds.has(id),
  );
  if (productsWithoutInventory.length !== 1) {
    throw new LegacyImporterError(
      'PRODUCT_WITHOUT_INVENTORY_INVARIANT_FAILED',
      6,
    );
  }
  const productWithoutInventory = productsWithoutInventory[0]!;
  businessIssues.push(
    issue(importBatchId, {
      legacyRecordId: productWithoutInventory.canonicalSourceRecordId,
      code: 'PRODUCT_WITHOUT_INVENTORY_BALANCE',
      severity: 'INFO',
      status: 'OPEN',
      requiresHumanApproval: false,
      message: 'PRODUCT_IMPORTED_WITHOUT_SYNTHETIC_BALANCE',
      details: {
        sourceRecordId: productWithoutInventory.canonicalSourceRecordId,
        resolution: 'PRODUCT_ONLY',
      },
      entityType: 'Product',
    }),
  );

  return {
    units: units.sort((left, right) => left.code.localeCompare(right.code)),
    products: products.sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
    inventoryBalances: inventoryBalances.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    productWarehouseValuations: valuations.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    recordLinks: [...links.values()].sort((left, right) =>
      left.recordId.localeCompare(right.recordId),
    ),
    reconciliationIssues: businessIssues.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
