import type { FindingSeverity } from '@sgi/legacy-profiler';

import { deterministicUuid } from '../domain/identity.js';
import type {
  ImportPlan,
  PlannedLegacyRecord,
  PlannedReconciliationIssue,
  ReconciliationResult,
  ReconciliationSeverity,
} from '../domain/import-types.js';

function severity(value: FindingSeverity): ReconciliationSeverity {
  return value === 'BLOCKER' ? 'CRITICAL' : value;
}

function phase3cIssues(plan: ImportPlan): PlannedReconciliationIssue[] {
  return plan.phase3cFindings.map((finding) => ({
    id: deterministicUuid('reconciliation-issue', {
      importBatchId: plan.importBatchId,
      findingId: finding.findingId,
    }),
    importBatchId: plan.importBatchId,
    legacyRecordId: null,
    code: finding.ruleCode,
    severity: severity(finding.severity),
    status: finding.requiresHumanDecision ? 'REQUIRES_HUMAN_APPROVAL' : 'OPEN',
    requiresHumanApproval: finding.requiresHumanDecision,
    message: `PHASE_3C_FINDING:${finding.ruleCode}`,
    details: {
      origin: 'PHASE_3C',
      findingId: finding.findingId,
      sourceLocation: finding.location,
      blocksPhase4: finding.blocksPhase4,
      resolutionRequired: finding.requiresHumanDecision,
    },
    entityType: finding.sheet,
  }));
}

function rowIssue(
  plan: ImportPlan,
  record: PlannedLegacyRecord,
  code: string,
): PlannedReconciliationIssue {
  return {
    id: deterministicUuid('reconciliation-issue', {
      importBatchId: plan.importBatchId,
      legacyRecordId: record.id,
      code,
    }),
    importBatchId: plan.importBatchId,
    legacyRecordId: record.id,
    code,
    severity: 'WARNING',
    status: 'REQUIRES_HUMAN_APPROVAL',
    requiresHumanApproval: true,
    message: `MAPPING_UNRESOLVED:${code}`,
    details: {
      origin: 'PHASE_4A',
      sourceSheet: record.sourceEntity,
      sourceRow: record.legacyRowNumber,
      mappingStatus: 'UNRESOLVED',
    },
    entityType: record.sourceEntity,
  };
}

export function reconcileImportPlan(plan: ImportPlan): ReconciliationResult {
  const unitIssues = plan.records
    .filter(({ sourceEntity }) => sourceEntity === 'Unidades')
    .map((record) => rowIssue(plan, record, 'UNIT_MAPPING_UNRESOLVED'));
  const warehouseIssues = plan.sheets
    .filter(({ name }) => name === 'Inventario' || name === 'Movimientos')
    .map((sheet): PlannedReconciliationIssue => ({
      id: deterministicUuid('reconciliation-issue', {
        importBatchId: plan.importBatchId,
        sheet: sheet.name,
        code: 'WAREHOUSE_MAPPING_UNRESOLVED',
      }),
      importBatchId: plan.importBatchId,
      legacyRecordId: null,
      code: 'WAREHOUSE_MAPPING_UNRESOLVED',
      severity: 'WARNING',
      status: 'REQUIRES_HUMAN_APPROVAL',
      requiresHumanApproval: true,
      message: 'MAPPING_UNRESOLVED:WAREHOUSE_MAPPING_UNRESOLVED',
      details: {
        origin: 'PHASE_4A',
        sourceSheet: sheet.name,
        sourceRows: sheet.sourceRows,
        mappingStatus: 'UNRESOLVED',
      },
      entityType: sheet.name,
    }));
  const issues = [
    ...phase3cIssues(plan),
    ...unitIssues,
    ...warehouseIssues,
  ].sort((left, right) => left.id.localeCompare(right.id));
  const rawPreservedRows = plan.records.length;
  return {
    schemaVersion: 1,
    sourceCode: plan.sourceCode,
    sourceSha256: plan.sourceSha256,
    totalSourceRows: plan.totalSourceRows,
    rawPreservedRows,
    droppedRows: plan.totalSourceRows - rawPreservedRows,
    phase3cFindingsExpected: plan.phase3cFindings.length,
    phase3cFindingsAccounted: issues.filter(
      ({ details }) =>
        details !== null &&
        typeof details === 'object' &&
        !Array.isArray(details) &&
        details.origin === 'PHASE_3C',
    ).length,
    issues,
  };
}
