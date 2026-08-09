export const PROFILE_SCHEMA_VERSION = 1 as const;

export type FindingSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKER';
export type MappingStatus =
  'CONFIRMED' | 'CANDIDATE' | 'UNRESOLVED' | 'NOT_APPLICABLE';

export type CellPhysicalType =
  'blank' | 'string' | 'number' | 'boolean' | 'date' | 'error' | 'unknown';

export interface NeutralCell {
  address: string;
  row: number;
  column: number;
  physicalType: CellPhysicalType;
  value: unknown;
  formattedText?: string | undefined;
  numberFormat?: string | undefined;
  formula?: string | undefined;
  cachedValue?: unknown | undefined;
}

export interface OoxmlFormulaMetadata {
  address: string;
  type?: string | undefined;
  reference?: string | undefined;
  sharedIndex?: string | undefined;
  hasCachedValue: boolean;
}

export interface OoxmlSheetMetadata {
  dimension?: string | undefined;
  dimensionMissing: boolean;
  formulas: OoxmlFormulaMetadata[];
  sharedFormulaDefinitionCount: number;
  tablePartCount: number;
  tableNames: string[];
  relationships: string[];
}

export interface NeutralSheet {
  name: string;
  index: number;
  visibility: 'VISIBLE' | 'HIDDEN' | 'VERY_HIDDEN';
  physicalRange?: string | undefined;
  cells: NeutralCell[];
  merges: string[];
  autoFilter?: string | undefined;
  ooxml: OoxmlSheetMetadata;
}

export interface AppliedSecurityLimits {
  maxWorkbookBytes: number;
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCells: number;
  maxArchiveParts: number;
  maxPartBytes: number;
  maxXmlBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxFindings: number;
}

export interface NeutralWorkbook {
  sourceCode: string;
  sourceSha256: string;
  sizeBytes: number;
  fileType: 'xlsx';
  dateSystem: '1900' | '1904';
  sheets: NeutralSheet[];
  definedNames: number;
  hasMacros: boolean;
  hasConnections: boolean;
  hasExternalLinks: boolean;
  hasPivotMetadata: boolean;
  securityLimits: AppliedSecurityLimits;
}

export interface ColumnProfile {
  columnIndex: number;
  columnLetter: string;
  headerOriginal: string | null;
  headerNormalizedCandidate: string | null;
  rowCount: number;
  nullCount: number;
  blankCount: number;
  completionRate: number;
  distinctCount: number;
  duplicateCount: number;
  physicalTypes: Record<string, number>;
  apparentTypes: Record<string, number>;
  mixedType: boolean;
  minLength: number | null;
  maxLength: number | null;
  numericMin: number | null;
  numericMax: number | null;
  decimalScale: number | null;
  negativeCount: number;
  dateMin: string | null;
  dateMax: string | null;
  booleanLikeCount: number;
  excelErrorCount: number;
  formulaCount: number;
  cachedFormulaValueCount: number;
  leadingWhitespaceCount: number;
  trailingWhitespaceCount: number;
  casingVariantCount: number;
  nonNfcCount: number;
  suspiciousUnicodeCount: number;
  numericStoredAsTextCount: number;
  textStoredAsNumberCandidateCount: number;
  candidateIdentifierSignals: string[];
}

export interface SheetProfile {
  name: string;
  index: number;
  visibility: NeutralSheet['visibility'];
  physicalRange: string | null;
  logicalDataRange: string | null;
  physicalRows: number;
  dataRows: number;
  formattedEmptyRows: number;
  physicalColumns: number;
  dataColumns: number;
  contiguousBands: string[];
  headerDetected: boolean;
  headerRow: number | null;
  emptyHeaderCount: number;
  duplicateHeaders: string[];
  autoFilter: string | null;
  tableCount: number;
  tableNames: string[];
  mergeCount: number;
  formulaCellCount: number;
  formulaDefinitionCount: number;
  sharedFormulaDefinitionCount: number;
  cachedFormulaValueCount: number;
  fullyEmptyColumns: string[];
  columns: ColumnProfile[];
}

export interface WorkbookProfile {
  profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profilerVersion: string;
  sourceCode: string;
  sourceSha256: string;
  sizeBytes: number;
  fileType: 'xlsx';
  dateSystem: '1900' | '1904';
  sheetCount: number;
  visibleSheetCount: number;
  hiddenSheetCount: number;
  definedNameCount: number;
  hasMacros: boolean;
  hasConnections: boolean;
  hasExternalLinks: boolean;
  hasPivotMetadata: boolean;
  securityLimits: AppliedSecurityLimits;
  sheets: SheetProfile[];
}

export interface Finding {
  findingId: string;
  ruleCode: string;
  severity: FindingSeverity;
  sheet: string | null;
  location: string;
  blocksProfiling: boolean;
  blocksPhase4: boolean;
  requiresHumanDecision: boolean;
  evidence: Record<string, boolean | number | string | null | string[]>;
}

export interface CandidateRelation {
  relationType: 'CANDIDATE_RELATION';
  sourceSheet: string;
  sourceColumn: string;
  targetSheet: string;
  targetColumn: string;
  normalizedHeaderSimilarity: number;
  sourceDistinct: number;
  targetDistinct: number;
  intersectionCount: number;
  sourceCoverage: number;
  targetCoverage: number;
  orphanCount: number;
  cardinalityCandidate: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceCodes: string[];
}

export interface TargetMapping {
  targetModel: string;
  status: MappingStatus;
  sourceSheets: string[];
  rationaleCode: string;
  phase: 'PHASE_3C_OBSERVATION' | 'PHASE_4';
  requiresHumanDecision: boolean;
}

export interface ProfileEvidence {
  workbookProfile: WorkbookProfile;
  findings: Finding[];
  candidateRelations: CandidateRelation[];
  targetMappings: TargetMapping[];
}

export interface ProfileManifest {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  sourceCode: string;
  sourceSha256: string;
  artifacts: Array<{
    name: string;
    sha256: string;
  }>;
}

export interface ProfileRun {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodeVersion: string;
  profilerVersion: string;
}
