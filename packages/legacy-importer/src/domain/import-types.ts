import type {
  Finding,
  NeutralWorkbook,
  ProfileEvidence,
  ProfileManifest,
} from '@sgi/legacy-profiler';

export const IMPORT_PLAN_SCHEMA_VERSION = 1 as const;
export const IMPORTER_VERSION = '1.0.0';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TransformPolicy = 'APPLY' | 'OBSERVE_ONLY' | 'FORBIDDEN';
export type SheetImportScope =
  | 'IMPORT_NOW'
  | 'PRESERVE_RAW_ONLY'
  | 'DEFER_TO_LATER_PHASE'
  | 'BLOCKED_PENDING_DECISION';
export type MappingResolution = 'APPROVED' | 'UNRESOLVED';
export type PlannedRecordStatus =
  'STAGED' | 'IMPORTED' | 'REJECTED' | 'REQUIRES_HUMAN_APPROVAL';

export interface SheetMappingRule {
  name: string;
  scope: SheetImportScope;
  decisionCodes: string[];
}

export interface ApprovedMapping {
  sourceValue: string;
  targetCode: string;
  decisionCode: string;
}

export interface MappingRegistry {
  schemaVersion: 1;
  mappingVersion: string;
  sourceCode: string;
  sourceSha256: string;
  defaultMappingStatus: 'UNRESOLVED';
  transformPolicies: Record<TransformPolicy, string[]>;
  sheets: SheetMappingRule[];
  approvedMappings: {
    units: ApprovedMapping[];
    warehouses: ApprovedMapping[];
    businessEntityWrites: string[];
  };
}

export interface VerifiedProfileEvidence {
  profileDirectory: string;
  manifest: ProfileManifest;
  manifestSha256: string;
  evidence: ProfileEvidence;
}

export interface RawCellEnvelope {
  address: string;
  column: number;
  physicalType: string;
  value: JsonValue;
  formattedText?: string;
  numberFormat?: string;
  formula?: string;
  cachedValue?: JsonValue;
}

export interface RawRowEnvelope {
  schemaVersion: 1;
  sourceCode: string;
  sourceSha256: string;
  sheet: string;
  sheetIndex: number;
  physicalRow: number;
  parseStatus: 'PARSED_RAW';
  mappingStatus: MappingResolution;
  errorCodes: string[];
  cells: RawCellEnvelope[];
}

export interface PlannedLegacyRecord {
  id: string;
  legacySourceId: string;
  importBatchId: string;
  sourceEntity: string;
  legacyId: string | null;
  legacyRowNumber: number;
  rawData: RawRowEnvelope;
  rawHash: string;
  status: PlannedRecordStatus;
}

export interface SheetImportPlan {
  name: string;
  index: number;
  sourceRows: number;
  scope: SheetImportScope;
  decisionCodes: string[];
  approvedBusinessWrites: number;
}

export interface ImportPlan {
  schemaVersion: typeof IMPORT_PLAN_SCHEMA_VERSION;
  importerVersion: string;
  sourceCode: string;
  sourceSha256: string;
  manifestSha256: string;
  mappingVersion: string;
  mappingSha256: string;
  batchKey: string;
  legacySourceId: string;
  importBatchId: string;
  totalSourceRows: number;
  businessWritesEnabled: false;
  sheets: SheetImportPlan[];
  records: PlannedLegacyRecord[];
  phase3cFindings: Finding[];
}

export type ReconciliationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface PlannedReconciliationIssue {
  id: string;
  importBatchId: string;
  legacyRecordId: string | null;
  code: string;
  severity: ReconciliationSeverity;
  status: 'OPEN' | 'REQUIRES_HUMAN_APPROVAL';
  requiresHumanApproval: boolean;
  message: string;
  details: JsonValue;
  entityType: string | null;
}

export interface ReconciliationResult {
  schemaVersion: 1;
  sourceCode: string;
  sourceSha256: string;
  totalSourceRows: number;
  rawPreservedRows: number;
  droppedRows: number;
  phase3cFindingsExpected: number;
  phase3cFindingsAccounted: number;
  issues: PlannedReconciliationIssue[];
}

export interface ImportExecutionSummary {
  schemaVersion: 1;
  mode: 'DRY_RUN';
  result: 'DRY_RUN_COMMITTED_IN_DISPOSABLE_DATABASE';
  sourceCode: string;
  sourceSha256: string;
  batchKey: string;
  importBatchId: string;
  totalSourceRows: number;
  rawPreservedRows: number;
  droppedRows: number;
  reconciliationIssueCount: number;
  businessEntityWriteCount: 0;
  persistentImportAuthorized: false;
  artifactChecksums?: Record<string, string>;
}

export interface PreparedImport {
  workbook: NeutralWorkbook;
  verifiedEvidence: VerifiedProfileEvidence;
  mapping: MappingRegistry;
  mappingSha256: string;
  plan: ImportPlan;
  reconciliation: ReconciliationResult;
}
