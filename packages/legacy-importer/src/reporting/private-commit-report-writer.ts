import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson } from '@sgi/legacy-profiler';

import type {
  PersistentImportExecutionSummary,
  PreparedImport,
} from '../domain/import-types.js';
import type { VerifiedBackupEvidence } from '../guards/backup-evidence.js';

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
  await rename(temporaryPath, filePath);
}

export async function writePrivateCommitReports(options: {
  outputRoot: string;
  prepared: PreparedImport;
  summary: PersistentImportExecutionSummary;
  backup: VerifiedBackupEvidence;
  startedAt: string;
  completedAt: string;
}): Promise<string> {
  const directory = path.join(
    options.outputRoot,
    options.prepared.plan.sourceCode,
    options.prepared.plan.sourceSha256,
    options.summary.executionId,
  );
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  const files: Record<string, string> = {
    'commit-run.json': canonicalJson({
      schemaVersion: 1,
      executionId: options.summary.executionId,
      startedAt: options.startedAt,
      completedAt: options.completedAt,
      nodeVersion: process.version,
      importerVersion: options.prepared.plan.importerVersion,
    }),
    'commit-summary.json': canonicalJson(options.summary),
    'reconciliation.json': canonicalJson(options.prepared.reconciliation),
    'row-results.json': canonicalJson({
      schemaVersion: 1,
      executionId: options.summary.executionId,
      rows: options.prepared.plan.records.map((record) => ({
        recordId: record.id,
        sourceEntity: record.sourceEntity,
        sourceRow: record.legacyRowNumber,
        rawHash: record.rawHash,
        status: record.status,
      })),
    }),
    'audit-receipt.json': canonicalJson({
      schemaVersion: 1,
      action: 'legacy_import.committed',
      importBatchId: options.summary.importBatchId,
      executionId: options.summary.executionId,
      operatorUserId: options.summary.operatorUserId,
      targetFingerprint: options.summary.targetFingerprint,
      backupSha256: options.backup.backupSha256,
      restoreEvidenceSha256: options.backup.restoreEvidenceSha256,
    }),
  };
  for (const [name, content] of Object.entries(files)) {
    await writeAtomic(path.join(directory, name), content);
  }
  return directory;
}

export async function writePrivateCommitFailureReport(options: {
  outputRoot: string;
  failureId: string;
  errorCode: string;
  occurredAt: string;
}): Promise<string> {
  const directory = path.join(
    options.outputRoot,
    'failures',
    options.failureId,
  );
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'failure-report.json');
  await writeAtomic(
    filePath,
    canonicalJson({
      schemaVersion: 1,
      result: 'ABORTED_BEFORE_COMMIT',
      failureId: options.failureId,
      errorCode: options.errorCode,
      occurredAt: options.occurredAt,
    }),
  );
  return filePath;
}
