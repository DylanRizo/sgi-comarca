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
  const resolved = new Set(plan.resolvedPhase3cRuleCodes ?? []);
  const deferred = new Set(plan.deferredPhase3cRuleCodes ?? []);
  return plan.phase3cFindings.map((finding) => {
    const isResolved = resolved.has(finding.ruleCode);
    const isDeferred = deferred.has(finding.ruleCode);
    return {
      id: deterministicUuid('reconciliation-issue', {
        importBatchId: plan.importBatchId,
        findingId: finding.findingId,
      }),
      importBatchId: plan.importBatchId,
      legacyRecordId: null,
      code: finding.ruleCode,
      severity: severity(finding.severity),
      status: isResolved
        ? ('RESOLVED' as const)
        : isDeferred
          ? ('OPEN' as const)
          : finding.requiresHumanDecision
            ? ('REQUIRES_HUMAN_APPROVAL' as const)
            : ('OPEN' as const),
      requiresHumanApproval:
        !isResolved && !isDeferred && finding.requiresHumanDecision,
      message: isResolved
        ? `PHASE_4B_DECISION_APPLIED:${finding.ruleCode}`
        : isDeferred
          ? `DEFERRED_BY_PHASE_4B:${finding.ruleCode}`
          : `PHASE_3C_FINDING:${finding.ruleCode}`,
      details: {
        origin: 'PHASE_3C',
        findingId: finding.findingId,
        sourceLocation: finding.location,
        blocksPhase4: finding.blocksPhase4,
        resolutionRequired:
          !isResolved && !isDeferred && finding.requiresHumanDecision,
        disposition: isResolved
          ? 'RESOLVED_IN_PHASE_4B'
          : isDeferred
            ? 'DEFERRED_TO_LATER_PHASE'
            : 'OPEN',
      },
      entityType: finding.sheet,
    };
  });
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
  const unitIssues = plan.businessWritesEnabled
    ? []
    : plan.records
        .filter(({ sourceEntity }) => sourceEntity === 'Unidades')
        .map((record) => rowIssue(plan, record, 'UNIT_MAPPING_UNRESOLVED'));
  const warehouseIssues = plan.businessWritesEnabled
    ? []
    : plan.sheets
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
    ...(plan.businessPlan?.reconciliationIssues ?? []),
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
