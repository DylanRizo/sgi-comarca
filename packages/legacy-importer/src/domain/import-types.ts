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
  approvedDecisions?: ApprovedDecisionRegistry;
}

export interface ApprovedDecisionRegistry {
  productCanonicalization: Array<{
    sourceCode: string;
    canonicalRow: number;
    evidenceOnlyRows: number[];
    decisionCode: string;
  }>;
  inventorySnapshotSelection: {
    strategy: 'LATEST_SOURCE_TIMESTAMP';
    decisionCodes: string[];
  };
  zeroCostPolicy: 'PRESERVE_ZERO_AND_REVIEW';
  valuationPolicy: 'PER_WAREHOUSE';
  missingValuationObservedAtPolicy: {
    sourceSheet: 'Inventario';
    physicalRows: number[];
    action: 'PRESERVE_RAW_AND_BALANCE_WITHOUT_VALUATION';
    issueCode: 'VALUATION_OBSERVED_AT_MISSING';
  };
  inventoryAuthority: 'INVENTORY_SHEET';
  semanticTextPolicy: 'PRESERVE_PHYSICAL_TEXT';
  deferredScopes: Record<string, string>;
  resolvedPhase3cRuleCodes: string[];
  deferredPhase3cRuleCodes: string[];
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

export interface PlannedUnit {
  id: string;
  code: string;
  name: string;
  sourceRecordId: string;
}

export interface PlannedProduct {
  id: string;
  code: string;
  name: string;
  unitId: string;
  minimumStock: string;
  createdAt: string;
  canonicalSourceRecordId: string;
  evidenceSourceRecordIds: string[];
}

export interface PlannedInventoryBalance {
  id: string;
  productId: string;
  warehouseCode: string;
  quantity: string;
  currentUnitPrice: string;
  currentUnitCost: string;
  priceReviewRequired: boolean;
  costReviewRequired: boolean;
  sourceRecordIds: string[];
  selectedSourceRecordId: string;
}

export interface PlannedProductWarehouseValuation {
  id: string;
  productId: string;
  warehouseCode: string;
  unitPrice: string;
  unitCost: string;
  observedAt: string;
  effectiveAt: string;
  legacyRecordId: string;
  requiresHumanReview: boolean;
  reviewReason: string | null;
}

export interface PlannedRecordLink {
  recordId: string;
  targetUnitId: string | null;
  targetProductId: string | null;
  targetWarehouseCode: string | null;
  targetInventoryBalanceId: string | null;
  mappingStatus: MappingResolution;
  errorCodes: string[];
}

export interface Wave12BusinessPlan {
  units: PlannedUnit[];
  products: PlannedProduct[];
  inventoryBalances: PlannedInventoryBalance[];
  productWarehouseValuations: PlannedProductWarehouseValuation[];
  recordLinks: PlannedRecordLink[];
  reconciliationIssues: PlannedReconciliationIssue[];
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
  approvedPlanKey: string;
  /** Historical FASE 4B dry-run execution identity. */
  batchKey: string;
  legacySourceId: string;
  importBatchId: string;
  totalSourceRows: number;
  businessWritesEnabled: boolean;
  sheets: SheetImportPlan[];
  records: PlannedLegacyRecord[];
  phase3cFindings: Finding[];
  resolvedPhase3cRuleCodes?: string[];
  deferredPhase3cRuleCodes?: string[];
  businessPlan?: Wave12BusinessPlan;
}

export type ReconciliationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface PlannedReconciliationIssue {
  id: string;
  importBatchId: string;
  legacyRecordId: string | null;
  code: string;
  severity: ReconciliationSeverity;
  status: 'OPEN' | 'REQUIRES_HUMAN_APPROVAL' | 'RESOLVED';
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
  reconciliationIssueCountsByCode: Record<string, number>;
  businessEntityWriteCount: number;
  businessEntityCounts: {
    units: number;
    products: number;
    inventoryBalances: number;
    productWarehouseValuations: number;
  };
  persistentImportAuthorized: false;
  artifactChecksums?: Record<string, string>;
}

export interface PersistentImportExecutionSummary {
  schemaVersion: 1;
  executionMode: 'COMMIT';
  result: 'PERSISTENT_IMPORT_COMMITTED';
  sourceCode: string;
  sourceSha256: string;
  approvedPlanKey: string;
  executionId: string;
  importBatchId: string;
  operatorUserId: string;
  targetFingerprint: string;
  backupSha256: string;
  totalSourceRows: number;
  rawPreservedRows: number;
  droppedRows: number;
  reconciliationIssueCount: number;
  reconciliationStatusCounts: Record<string, number>;
  reconciliationSeverityCounts: Record<string, number>;
  businessEntityWriteCount: number;
  businessEntityCounts: {
    units: number;
    products: number;
    inventoryBalances: number;
    productWarehouseValuations: number;
  };
}

export interface PreparedImport {
  workbook: NeutralWorkbook;
  verifiedEvidence: VerifiedProfileEvidence;
  mapping: MappingRegistry;
  mappingSha256: string;
  plan: ImportPlan;
  reconciliation: ReconciliationResult;
}
