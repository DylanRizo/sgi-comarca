import type {
  Finding,
  NeutralWorkbook,
  ProfileEvidence,
  ProfileManifest,
  SheetProfile,
} from '@sgi/legacy-profiler';

import type {
  ImportPlan,
  MappingRegistry,
  ReconciliationResult,
  VerifiedProfileEvidence,
} from '../../src/domain/import-types.js';
import { deterministicUuid } from '../../src/domain/identity.js';

const SHA = 'a'.repeat(64);

function emptyColumn() {
  return {
    columnIndex: 1,
    columnLetter: 'A',
    headerOriginal: 'Unidad',
    headerNormalizedCandidate: 'unidad',
    rowCount: 2,
    nullCount: 0,
    blankCount: 0,
    completionRate: 1,
    distinctCount: 2,
    duplicateCount: 0,
    physicalTypes: { string: 2 },
    apparentTypes: { TEXT: 2 },
    mixedType: false,
    minLength: 3,
    maxLength: 8,
    numericMin: null,
    numericMax: null,
    decimalScale: null,
    negativeCount: 0,
    dateMin: null,
    dateMax: null,
    booleanLikeCount: 0,
    excelErrorCount: 0,
    formulaCount: 0,
    cachedFormulaValueCount: 0,
    leadingWhitespaceCount: 0,
    trailingWhitespaceCount: 0,
    casingVariantCount: 0,
    nonNfcCount: 0,
    suspiciousUnicodeCount: 0,
    numericStoredAsTextCount: 0,
    textStoredAsNumberCandidateCount: 0,
    candidateIdentifierSignals: [],
  };
}

function sheetProfile(): SheetProfile {
  return {
    name: 'Unidades',
    index: 0,
    visibility: 'VISIBLE',
    physicalRange: 'A1:A3',
    logicalDataRange: 'A1:A3',
    physicalRows: 3,
    dataRows: 2,
    formattedEmptyRows: 0,
    physicalColumns: 1,
    dataColumns: 1,
    contiguousBands: ['A1:A3'],
    headerDetected: true,
    headerRow: 1,
    emptyHeaderCount: 0,
    duplicateHeaders: [],
    autoFilter: null,
    tableCount: 0,
    tableNames: [],
    mergeCount: 0,
    formulaCellCount: 0,
    formulaDefinitionCount: 0,
    sharedFormulaDefinitionCount: 0,
    cachedFormulaValueCount: 0,
    fullyEmptyColumns: [],
    columns: [emptyColumn()],
  };
}

export function syntheticWorkbook(): NeutralWorkbook {
  return {
    sourceCode: 'synthetic-source',
    sourceSha256: SHA,
    sizeBytes: 100,
    fileType: 'xlsx',
    dateSystem: '1900',
    sheets: [
      {
        name: 'Unidades',
        index: 0,
        visibility: 'VISIBLE',
        physicalRange: 'A1:A3',
        cells: [
          {
            address: 'A1',
            row: 1,
            column: 1,
            physicalType: 'string',
            value: 'Unidad',
          },
          {
            address: 'A2',
            row: 2,
            column: 1,
            physicalType: 'string',
            value: 'Ficticia A',
          },
          {
            address: 'A3',
            row: 3,
            column: 1,
            physicalType: 'string',
            value: 'Ficticia B',
          },
        ],
        merges: [],
        ooxml: {
          dimension: 'A1:A3',
          dimensionMissing: false,
          formulas: [],
          sharedFormulaDefinitionCount: 0,
          tablePartCount: 0,
          tableNames: [],
          relationships: [],
        },
      },
    ],
    definedNames: 0,
    hasMacros: false,
    hasConnections: false,
    hasExternalLinks: false,
    hasPivotMetadata: false,
    securityLimits: {
      maxWorkbookBytes: 1000,
      maxSheets: 10,
      maxRowsPerSheet: 100,
      maxColumnsPerSheet: 20,
      maxCells: 1000,
      maxArchiveParts: 100,
      maxPartBytes: 1000,
      maxXmlBytes: 1000,
      maxTotalUncompressedBytes: 10000,
      maxCompressionRatio: 20,
      maxFindings: 100,
    },
  };
}

export function syntheticFindings(count = 24): Finding[] {
  const ruleCodes = [
    'LEGACY_DGGR_X_DUPLICATE',
    'LEGACY_CCWH_L_DUPLICATE',
    'SALE_GROUPING_UNRESOLVED',
    'EXACT_DUPLICATE_ROW',
    'LEGACY_MOVEMENT_WITHOUT_SALE',
    'LEGACY_SALES_WITHOUT_MOVEMENT',
    'ORPHAN_RELATION',
  ];
  return Array.from({ length: count }, (_, index) => ({
    findingId: `finding-${index.toString().padStart(2, '0')}`,
    ruleCode: ruleCodes[index % ruleCodes.length] ?? 'SYNTHETIC_FINDING',
    severity: index < 5 ? 'ERROR' : 'WARNING',
    sheet: 'Unidades',
    location: `row:${index + 2}`,
    blocksProfiling: false,
    blocksPhase4: true,
    requiresHumanDecision: true,
    evidence: { synthetic: true },
  }));
}

export function syntheticEvidence(): VerifiedProfileEvidence {
  const workbook = syntheticWorkbook();
  const findings = syntheticFindings();
  const evidence: ProfileEvidence = {
    workbookProfile: {
      profileSchemaVersion: 1,
      profilerVersion: 'test',
      sourceCode: workbook.sourceCode,
      sourceSha256: workbook.sourceSha256,
      sizeBytes: workbook.sizeBytes,
      fileType: 'xlsx',
      dateSystem: '1900',
      sheetCount: 1,
      visibleSheetCount: 1,
      hiddenSheetCount: 0,
      definedNameCount: 0,
      hasMacros: false,
      hasConnections: false,
      hasExternalLinks: false,
      hasPivotMetadata: false,
      securityLimits: workbook.securityLimits,
      sheets: [sheetProfile()],
    },
    findings,
    candidateRelations: [],
    targetMappings: [],
  };
  const manifest: ProfileManifest = {
    schemaVersion: 1,
    sourceCode: workbook.sourceCode,
    sourceSha256: workbook.sourceSha256,
    artifacts: [],
  };
  return {
    profileDirectory: 'synthetic',
    manifest,
    manifestSha256: 'b'.repeat(64),
    evidence,
  };
}

export function syntheticMapping(): MappingRegistry {
  return {
    schemaVersion: 1,
    mappingVersion: 'synthetic.1',
    sourceCode: 'synthetic-source',
    sourceSha256: SHA,
    defaultMappingStatus: 'UNRESOLVED',
    transformPolicies: {
      APPLY: ['UNAMBIGUOUS_DECIMAL'],
      OBSERVE_ONLY: ['TRIM'],
      FORBIDDEN: ['AUTOMATIC_DEDUPE'],
    },
    sheets: [
      {
        name: 'Unidades',
        scope: 'BLOCKED_PENDING_DECISION',
        decisionCodes: ['DEC-011'],
      },
    ],
    approvedMappings: {
      units: [
        {
          sourceValue: 'Ficticia A',
          targetCode: 'UNIT_A',
          decisionCode: 'TEST-APPROVED',
        },
      ],
      warehouses: [],
      businessEntityWrites: [],
    },
  };
}

export function databasePlan(
  rowCount = 2_064,
  suffix = 'default',
): { plan: ImportPlan; reconciliation: ReconciliationResult } {
  const sourceCode = 'synthetic-source';
  const sourceSha256 = 'c'.repeat(64);
  const batchKey = `${suffix.charCodeAt(0).toString(16).padStart(2, '0')}${'d'.repeat(62)}`;
  const legacySourceId = deterministicUuid('legacy-source', { sourceCode });
  const importBatchId = deterministicUuid('import-batch', { batchKey });
  const records = Array.from({ length: rowCount }, (_, index) => {
    const rawData = {
      schemaVersion: 1 as const,
      sourceCode,
      sourceSha256,
      sheet: 'Synthetic',
      sheetIndex: 0,
      physicalRow: index + 2,
      parseStatus: 'PARSED_RAW' as const,
      mappingStatus: 'UNRESOLVED' as const,
      errorCodes: [],
      cells: [],
    };
    return {
      id: deterministicUuid('legacy-record', { importBatchId, index }),
      legacySourceId,
      importBatchId,
      sourceEntity: 'Synthetic',
      legacyId: null,
      legacyRowNumber: index + 2,
      rawData,
      rawHash: `raw-${index}`,
      status: 'STAGED' as const,
    };
  });
  const plan: ImportPlan = {
    schemaVersion: 1,
    importerVersion: 'test',
    sourceCode,
    sourceSha256,
    manifestSha256: 'e'.repeat(64),
    mappingVersion: 'synthetic.1',
    mappingSha256: 'f'.repeat(64),
    batchKey,
    legacySourceId,
    importBatchId,
    totalSourceRows: rowCount,
    businessWritesEnabled: false,
    sheets: [
      {
        name: 'Synthetic',
        index: 0,
        sourceRows: rowCount,
        scope: 'PRESERVE_RAW_ONLY',
        decisionCodes: [],
        approvedBusinessWrites: 0,
      },
    ],
    records,
    phase3cFindings: syntheticFindings(),
  };
  const issues = syntheticFindings().map((finding) => ({
    id: deterministicUuid('issue', { importBatchId, id: finding.findingId }),
    importBatchId,
    legacyRecordId: null,
    code: finding.ruleCode,
    severity: finding.severity as 'ERROR' | 'WARNING',
    status: 'REQUIRES_HUMAN_APPROVAL' as const,
    requiresHumanApproval: true,
    message: `SYNTHETIC:${finding.ruleCode}`,
    details: { findingId: finding.findingId },
    entityType: 'Synthetic',
  }));
  return {
    plan,
    reconciliation: {
      schemaVersion: 1,
      sourceCode,
      sourceSha256,
      totalSourceRows: rowCount,
      rawPreservedRows: rowCount,
      droppedRows: 0,
      phase3cFindingsExpected: 24,
      phase3cFindingsAccounted: 24,
      issues,
    },
  };
}
