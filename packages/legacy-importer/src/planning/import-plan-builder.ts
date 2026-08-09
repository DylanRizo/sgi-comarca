import {
  PROFILE_SCHEMA_VERSION,
  canonicalFingerprint,
  type NeutralCell,
  type NeutralWorkbook,
} from '@sgi/legacy-profiler';

import { deterministicUuid, rowFingerprint } from '../domain/identity.js';
import {
  IMPORTER_VERSION,
  IMPORT_PLAN_SCHEMA_VERSION,
  type ImportPlan,
  type JsonValue,
  type MappingRegistry,
  type RawCellEnvelope,
  type RawRowEnvelope,
  type VerifiedProfileEvidence,
} from '../domain/import-types.js';
import { findSheetMapping } from '../mapping/mapping-registry.js';

function jsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('RAW_NON_FINITE_NUMBER');
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonValue(child)]),
    );
  }
  throw new Error('RAW_VALUE_UNSUPPORTED');
}

function rawCell(cell: NeutralCell): RawCellEnvelope {
  return {
    address: cell.address,
    column: cell.column,
    physicalType: cell.physicalType,
    value: jsonValue(cell.value),
    ...(cell.formattedText === undefined
      ? {}
      : { formattedText: cell.formattedText }),
    ...(cell.numberFormat === undefined
      ? {}
      : { numberFormat: cell.numberFormat }),
    ...(cell.formula === undefined ? {} : { formula: cell.formula }),
    ...(cell.cachedValue === undefined
      ? {}
      : { cachedValue: jsonValue(cell.cachedValue) }),
  };
}

export function buildImportPlan(
  workbook: NeutralWorkbook,
  verifiedEvidence: VerifiedProfileEvidence,
  mapping: MappingRegistry,
  mappingSha256: string,
): ImportPlan {
  const batchKey = canonicalFingerprint({
    sourceCode: workbook.sourceCode,
    sourceSha256: workbook.sourceSha256,
    manifestSha256: verifiedEvidence.manifestSha256,
    mappingSha256,
    importerVersion: IMPORTER_VERSION,
    mode: 'DRY_RUN',
  });
  const legacySourceId = deterministicUuid('legacy-source', {
    sourceCode: workbook.sourceCode,
  });
  const importBatchId = deterministicUuid('import-batch', { batchKey });
  const records = workbook.sheets.flatMap((sheet) => {
    const profile = verifiedEvidence.evidence.workbookProfile.sheets.find(
      ({ index }) => index === sheet.index,
    );
    if (profile === undefined || profile.headerRow === null) {
      throw new Error('SHEET_PROFILE_MISSING');
    }
    const headerRow = profile.headerRow;
    const sheetMapping = findSheetMapping(mapping, sheet.name);
    return Array.from({ length: profile.dataRows }, (_, offset) => {
      const physicalRow = headerRow + offset + 1;
      const envelope: RawRowEnvelope = {
        schemaVersion: PROFILE_SCHEMA_VERSION,
        sourceCode: workbook.sourceCode,
        sourceSha256: workbook.sourceSha256,
        sheet: sheet.name,
        sheetIndex: sheet.index,
        physicalRow,
        parseStatus: 'PARSED_RAW',
        mappingStatus: 'UNRESOLVED',
        errorCodes: [],
        cells: sheet.cells
          .filter((cell) => cell.row === physicalRow)
          .sort((left, right) => left.column - right.column)
          .map(rawCell),
      };
      const rawHash = rowFingerprint(envelope);
      return {
        id: deterministicUuid('legacy-record', {
          importBatchId,
          sheetIndex: sheet.index,
          physicalRow,
          rawHash,
        }),
        legacySourceId,
        importBatchId,
        sourceEntity: sheet.name,
        legacyId: null,
        legacyRowNumber: physicalRow,
        rawData: envelope,
        rawHash,
        status:
          sheetMapping.scope === 'BLOCKED_PENDING_DECISION'
            ? ('REQUIRES_HUMAN_APPROVAL' as const)
            : ('STAGED' as const),
      };
    });
  });
  const sheets = verifiedEvidence.evidence.workbookProfile.sheets.map(
    (profile) => {
      const sheetMapping = findSheetMapping(mapping, profile.name);
      return {
        name: profile.name,
        index: profile.index,
        sourceRows: profile.dataRows,
        scope: sheetMapping.scope,
        decisionCodes: [...sheetMapping.decisionCodes].sort(),
        approvedBusinessWrites: 0,
      };
    },
  );
  return {
    schemaVersion: IMPORT_PLAN_SCHEMA_VERSION,
    importerVersion: IMPORTER_VERSION,
    sourceCode: workbook.sourceCode,
    sourceSha256: workbook.sourceSha256,
    manifestSha256: verifiedEvidence.manifestSha256,
    mappingVersion: mapping.mappingVersion,
    mappingSha256,
    batchKey,
    legacySourceId,
    importBatchId,
    totalSourceRows: records.length,
    businessWritesEnabled: false,
    sheets,
    records,
    phase3cFindings: verifiedEvidence.evidence.findings
      .filter(({ blocksPhase4 }) => blocksPhase4)
      .sort((left, right) => left.findingId.localeCompare(right.findingId)),
  };
}
