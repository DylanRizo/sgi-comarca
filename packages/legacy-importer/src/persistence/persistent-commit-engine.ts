import { deterministicUuid } from '../domain/identity.js';
import { LegacyImporterError } from '../domain/errors.js';
import type {
  JsonValue,
  PersistentImportExecutionSummary,
  PreparedImport,
} from '../domain/import-types.js';
import type { DatabaseClient } from '@sgi/database';

import type { ApprovedArtifactChecksums } from '../guards/approved-artifact-verifier.js';
import type { VerifiedBackupEvidence } from '../guards/backup-evidence.js';
import {
  acquirePersistentImportLocks,
  assertActiveAdminOperator,
  assertCommitEvidence,
  assertEmptyFirstImportTarget,
  lockPersistentImportTables,
  type CommitEvidenceExpectations,
} from '../guards/commit-guard.js';
import {
  assertExpectedTargetFingerprint,
  readTargetDatabaseIdentity,
} from '../guards/target-fingerprint.js';
import {
  assertPersistentSimulationTarget,
  type PersistentSimulationFingerprint,
} from './persistent-simulation-guard.js';
import {
  persistImportPlan,
  preparePersistencePayload,
  type PersistenceFailurePoint,
} from './import-persistence.js';

export interface CommitPhaseTiming {
  phase: string;
  durationMs: number;
}

export interface CriticalEvidenceIdentity {
  sourceSha256: string;
  manifestSha256: string;
  mappingSha256: string;
  importerVersion: string;
}

export interface PersistentCommitHooks {
  afterLocks?: () => Promise<void>;
  failurePoint?: PersistenceFailurePoint;
  onPhaseTiming?: (timing: CommitPhaseTiming) => void;
}

export interface PersistentCommitOptions {
  prepared: PreparedImport;
  expectedEvidence: CommitEvidenceExpectations;
  approvedArtifactChecksums: ApprovedArtifactChecksums;
  targetEnvironment: string;
  expectedTargetFingerprint: string;
  operatorUserId: string;
  backup: VerifiedBackupEvidence;
  maintenanceWindowAcknowledged: true;
  revalidateEvidence(): Promise<PreparedImport>;
  revalidateCriticalEvidence(): Promise<CriticalEvidenceIdentity>;
  revalidateApprovedArtifacts(): Promise<ApprovedArtifactChecksums>;
  revalidateBackup(): Promise<VerifiedBackupEvidence>;
  revalidateBackupIdentity(): Promise<{
    backupSha256: string;
    restoreEvidenceSha256: string;
  }>;
  sourceSha256BeforeFinalCommit(): Promise<string>;
  hooks?: PersistentCommitHooks;
}

function sameRecord(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && left[key] === right[rightKeys[index]!],
    )
  );
}

function summary(
  options: PersistentCommitOptions,
  executionId: string,
): PersistentImportExecutionSummary {
  const { plan, reconciliation } = options.prepared;
  const businessEntityCounts = {
    units: plan.businessPlan!.units.length,
    products: plan.businessPlan!.products.length,
    inventoryBalances: plan.businessPlan!.inventoryBalances.length,
    productWarehouseValuations:
      plan.businessPlan!.productWarehouseValuations.length,
  };
  const reconciliationStatusCounts: Record<string, number> = {};
  const reconciliationSeverityCounts: Record<string, number> = {};
  for (const issue of reconciliation.issues) {
    reconciliationStatusCounts[issue.status] =
      (reconciliationStatusCounts[issue.status] ?? 0) + 1;
    reconciliationSeverityCounts[issue.severity] =
      (reconciliationSeverityCounts[issue.severity] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    executionMode: 'COMMIT',
    result: 'PERSISTENT_IMPORT_COMMITTED',
    sourceCode: plan.sourceCode,
    sourceSha256: plan.sourceSha256,
    approvedPlanKey: plan.approvedPlanKey,
    executionId,
    importBatchId: plan.importBatchId,
    operatorUserId: options.operatorUserId,
    targetFingerprint: options.expectedTargetFingerprint,
    backupSha256: options.backup.backupSha256,
    totalSourceRows: plan.totalSourceRows,
    rawPreservedRows: reconciliation.rawPreservedRows,
    droppedRows: reconciliation.droppedRows,
    reconciliationIssueCount: reconciliation.issues.length,
    reconciliationStatusCounts,
    reconciliationSeverityCounts,
    businessEntityWriteCount: Object.values(businessEntityCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    businessEntityCounts,
  };
}

export async function executePersistentCommit(
  client: DatabaseClient,
  options: PersistentCommitOptions,
): Promise<PersistentImportExecutionSummary> {
  if (options.maintenanceWindowAcknowledged !== true) {
    throw new LegacyImporterError('COMMIT_MAINTENANCE_WINDOW_ACK_REQUIRED', 2);
  }
  assertCommitEvidence(options.prepared, options.expectedEvidence);
  const pretransactionEvidence = await options.revalidateEvidence();
  assertCommitEvidence(pretransactionEvidence, options.expectedEvidence);
  if (
    pretransactionEvidence.plan.approvedPlanKey !==
      options.prepared.plan.approvedPlanKey ||
    pretransactionEvidence.plan.importBatchId !==
      options.prepared.plan.importBatchId
  ) {
    throw new LegacyImporterError('COMMIT_TOCTOU_PLAN_CHANGED', 4);
  }
  const pretransactionArtifacts = await options.revalidateApprovedArtifacts();
  if (!sameRecord(pretransactionArtifacts, options.approvedArtifactChecksums)) {
    throw new LegacyImporterError('COMMIT_TOCTOU_ARTIFACT_CHANGED', 4);
  }
  const pretransactionBackup = await options.revalidateBackup();
  if (
    pretransactionBackup.backupSha256 !== options.backup.backupSha256 ||
    pretransactionBackup.restoreEvidenceSha256 !==
      options.backup.restoreEvidenceSha256
  ) {
    throw new LegacyImporterError('COMMIT_TOCTOU_BACKUP_CHANGED', 4);
  }
  const identity = await readTargetDatabaseIdentity(
    client,
    options.targetEnvironment,
  );
  assertExpectedTargetFingerprint(identity, options.expectedTargetFingerprint);
  const executionId = deterministicUuid('legacy-import-execution', {
    approvedPlanKey: options.prepared.plan.approvedPlanKey,
    executionMode: 'COMMIT',
    targetFingerprint: options.expectedTargetFingerprint,
    operatorUserId: options.operatorUserId,
    backupSha256: options.backup.backupSha256,
  });
  const result = summary(options, executionId);
  const auditMetadata: JsonValue = {
    sourceSha256: options.prepared.plan.sourceSha256,
    approvedPlanKey: options.prepared.plan.approvedPlanKey,
    mappingSha256: options.prepared.plan.mappingSha256,
    mappingVersion: options.prepared.plan.mappingVersion,
    importerVersion: options.prepared.plan.importerVersion,
    businessCounts: result.businessEntityCounts,
    rawCount: result.rawPreservedRows,
    issueCounts: {
      statuses: result.reconciliationStatusCounts,
      severities: result.reconciliationSeverityCounts,
    },
    targetFingerprint: options.expectedTargetFingerprint,
    backupSha256: options.backup.backupSha256,
    backupReference: options.backup.backupReference,
    restoreEvidenceSha256: options.backup.restoreEvidenceSha256,
    executionId,
  };
  const audit = {
    id: deterministicUuid('legacy-import-audit', { executionId }),
    actorUserId: options.operatorUserId,
    action: 'legacy_import.committed' as const,
    entityType: 'ImportBatch' as const,
    entityId: options.prepared.plan.importBatchId,
    metadata: auditMetadata,
  };
  const payload = preparePersistencePayload(
    options.prepared.plan,
    options.prepared.reconciliation,
  );
  const notify = (phase: string, durationMs: number): void =>
    options.hooks?.onPhaseTiming?.({ phase, durationMs });
  const measured = async <T>(
    phase: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      notify(phase, performance.now() - startedAt);
    }
  };
  const transactionStartedAt = performance.now();
  try {
    return await client.$transaction(
      async (transaction) => {
        await measured('locks', () =>
          acquirePersistentImportLocks(
            transaction,
            options.prepared.plan.sourceCode,
            options.prepared.plan.approvedPlanKey,
          ),
        );
        await options.hooks?.afterLocks?.();
        await measured('table-locks', () =>
          lockPersistentImportTables(transaction),
        );
        const lockedIdentity = await measured('target-fingerprint', () =>
          readTargetDatabaseIdentity(transaction, options.targetEnvironment),
        );
        assertExpectedTargetFingerprint(
          lockedIdentity,
          options.expectedTargetFingerprint,
        );
        await measured('empty-target', () =>
          assertEmptyFirstImportTarget(transaction),
        );
        await measured('operator', () =>
          assertActiveAdminOperator(transaction, options.operatorUserId),
        );

        const revalidated = await measured('evidence-revalidation', () =>
          options.revalidateCriticalEvidence(),
        );
        if (
          revalidated.sourceSha256 !== options.expectedEvidence.sourceSha256 ||
          revalidated.manifestSha256 !==
            options.expectedEvidence.manifestSha256 ||
          revalidated.mappingSha256 !==
            options.expectedEvidence.mappingSha256 ||
          revalidated.importerVersion !==
            options.expectedEvidence.importerVersion
        ) {
          throw new LegacyImporterError('COMMIT_TOCTOU_EVIDENCE_CHANGED', 4);
        }
        const artifacts = await measured('artifact-revalidation', () =>
          options.revalidateApprovedArtifacts(),
        );
        if (!sameRecord(artifacts, options.approvedArtifactChecksums)) {
          throw new LegacyImporterError('COMMIT_TOCTOU_ARTIFACT_CHANGED', 4);
        }
        const backup = await measured('backup-revalidation', () =>
          options.revalidateBackupIdentity(),
        );
        if (
          backup.backupSha256 !== options.backup.backupSha256 ||
          backup.restoreEvidenceSha256 !== options.backup.restoreEvidenceSha256
        ) {
          throw new LegacyImporterError('COMMIT_TOCTOU_BACKUP_CHANGED', 4);
        }

        await persistImportPlan(
          transaction,
          options.prepared.plan,
          options.prepared.reconciliation,
          {
            mode: 'COMMIT',
            finalSummary: result,
            payload,
            ...(options.hooks?.failurePoint === undefined
              ? {}
              : { failurePoint: options.hooks.failurePoint }),
            audit,
            onPhaseTiming: notify,
            beforeFinalCommit: async () => {
              const finalSourceSha =
                await options.sourceSha256BeforeFinalCommit();
              if (finalSourceSha !== options.expectedEvidence.sourceSha256) {
                throw new LegacyImporterError(
                  'COMMIT_TOCTOU_SOURCE_CHANGED',
                  4,
                );
              }
            },
          },
        );
        return result;
      },
      { isolationLevel: 'Serializable', timeout: 10_000 },
    );
  } finally {
    notify('transaction-total', performance.now() - transactionStartedAt);
  }
}

export async function executePersistentCommitSimulation(
  client: DatabaseClient,
  simulationFingerprint: PersistentSimulationFingerprint,
  options: PersistentCommitOptions,
): Promise<PersistentImportExecutionSummary> {
  await assertPersistentSimulationTarget(client, simulationFingerprint);
  return executePersistentCommit(client, options);
}
