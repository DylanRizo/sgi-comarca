import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { canonicalFingerprint } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';

const execFileAsync = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

export interface BackupRestoreEvidence {
  schemaVersion: 1;
  backupSha256: string;
  sourceDatabaseFingerprint: string;
  restoredDatabaseFingerprint: string;
  restoredContext: 'DISPOSABLE_RESTORE_TEST';
  backupCreatedAt: string;
  restoreTestedAt: string;
  result: 'PASS';
  migrationStateSha256: string;
  sanityCounts: Record<string, number>;
}

export interface VerifiedBackupEvidence {
  backupSha256: string;
  backupReference: string;
  restoreEvidenceSha256: string;
  restoreTestedAt: string;
}

export interface BackupEvidenceIdentity {
  backupSha256: string;
  restoreEvidenceSha256: string;
}

export interface BackupArchiveInspector {
  list(backupPath: string): Promise<string>;
}

const defaultInspector: BackupArchiveInspector = {
  async list(backupPath) {
    try {
      const result = await execFileAsync('pg_restore', ['--list', backupPath], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      return result.stdout;
    } catch {
      throw new LegacyImporterError('BACKUP_ARCHIVE_LIST_FAILED', 4);
    }
  },
};

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function readBackupEvidenceIdentity(
  backupPath: string,
  restoreEvidencePath: string,
): Promise<BackupEvidenceIdentity> {
  const [backupSha256, evidenceBytes] = await Promise.all([
    sha256File(backupPath).catch(() => null),
    readFile(restoreEvidencePath).catch(() => null),
  ]);
  if (backupSha256 === null) {
    throw new LegacyImporterError('BACKUP_FILE_MISSING', 4);
  }
  if (evidenceBytes === null) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_MISSING', 4);
  }
  return {
    backupSha256,
    restoreEvidenceSha256: createHash('sha256')
      .update(evidenceBytes)
      .digest('hex'),
  };
}

function parseEvidence(value: unknown): BackupRestoreEvidence {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_INVALID', 4);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'schemaVersion',
    'backupSha256',
    'sourceDatabaseFingerprint',
    'restoredDatabaseFingerprint',
    'restoredContext',
    'backupCreatedAt',
    'restoreTestedAt',
    'result',
    'migrationStateSha256',
    'sanityCounts',
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_INVALID', 4);
  }
  const sanityCounts = record.sanityCounts;
  if (
    record.schemaVersion !== 1 ||
    typeof record.backupSha256 !== 'string' ||
    typeof record.sourceDatabaseFingerprint !== 'string' ||
    typeof record.restoredDatabaseFingerprint !== 'string' ||
    record.restoredContext !== 'DISPOSABLE_RESTORE_TEST' ||
    typeof record.backupCreatedAt !== 'string' ||
    typeof record.restoreTestedAt !== 'string' ||
    record.result !== 'PASS' ||
    typeof record.migrationStateSha256 !== 'string' ||
    sanityCounts === null ||
    typeof sanityCounts !== 'object' ||
    Array.isArray(sanityCounts) ||
    Object.values(sanityCounts).some(
      (count) => !Number.isInteger(count) || Number(count) < 0,
    )
  ) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_INVALID', 4);
  }
  return record as unknown as BackupRestoreEvidence;
}

function sameCounts(
  actual: Record<string, number>,
  expected: Record<string, number>,
): boolean {
  return canonicalFingerprint(actual) === canonicalFingerprint(expected);
}

export async function verifyBackupRestoreEvidence(options: {
  backupPath: string;
  expectedBackupSha256: string;
  restoreEvidencePath: string;
  expectedRestoreEvidenceSha256: string;
  expectedTargetFingerprint: string;
  expectedMigrationStateSha256: string;
  expectedSanityCounts: Record<string, number>;
  now?: Date;
  inspector?: BackupArchiveInspector;
}): Promise<VerifiedBackupEvidence> {
  if (!SHA256.test(options.expectedBackupSha256)) {
    throw new LegacyImporterError('BACKUP_SHA256_INVALID', 2);
  }
  if (!SHA256.test(options.expectedRestoreEvidenceSha256)) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_SHA256_INVALID', 2);
  }
  const backupInfo = await stat(options.backupPath).catch(() => null);
  if (backupInfo === null || !backupInfo.isFile() || backupInfo.size < 6) {
    throw new LegacyImporterError('BACKUP_FILE_MISSING', 4);
  }
  const handle = await open(options.backupPath, 'r');
  const magic = Buffer.alloc(5);
  try {
    await handle.read(magic, 0, magic.length, 0);
  } finally {
    await handle.close();
  }
  if (magic.toString('ascii') !== 'PGDMP') {
    throw new LegacyImporterError('BACKUP_FORMAT_INVALID', 4);
  }
  const backupSha256 = await sha256File(options.backupPath);
  if (backupSha256 !== options.expectedBackupSha256) {
    throw new LegacyImporterError('BACKUP_SHA256_MISMATCH', 4);
  }
  const listing = await (options.inspector ?? defaultInspector).list(
    options.backupPath,
  );
  if (!listing.trimStart().startsWith(';')) {
    throw new LegacyImporterError('BACKUP_ARCHIVE_LIST_INVALID', 4);
  }
  const evidenceBytes = await readFile(options.restoreEvidencePath).catch(
    () => null,
  );
  if (evidenceBytes === null) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_MISSING', 4);
  }
  const restoreEvidenceSha256 = createHash('sha256')
    .update(evidenceBytes)
    .digest('hex');
  if (restoreEvidenceSha256 !== options.expectedRestoreEvidenceSha256) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_SHA256_MISMATCH', 4);
  }
  let evidenceValue: unknown;
  try {
    evidenceValue = JSON.parse(evidenceBytes.toString('utf8'));
  } catch {
    throw new LegacyImporterError('RESTORE_EVIDENCE_INVALID', 4);
  }
  const evidence = parseEvidence(evidenceValue);
  const backupCreatedAt = new Date(evidence.backupCreatedAt);
  const restoreTestedAt = new Date(evidence.restoreTestedAt);
  const now = options.now ?? new Date();
  if (
    Number.isNaN(backupCreatedAt.getTime()) ||
    Number.isNaN(restoreTestedAt.getTime()) ||
    backupCreatedAt > restoreTestedAt ||
    restoreTestedAt > now ||
    now.getTime() - restoreTestedAt.getTime() > MAX_EVIDENCE_AGE_MS
  ) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_STALE', 4);
  }
  if (
    evidence.backupSha256 !== backupSha256 ||
    evidence.sourceDatabaseFingerprint !== options.expectedTargetFingerprint ||
    evidence.restoredDatabaseFingerprint ===
      evidence.sourceDatabaseFingerprint ||
    evidence.migrationStateSha256 !== options.expectedMigrationStateSha256 ||
    !sameCounts(evidence.sanityCounts, options.expectedSanityCounts)
  ) {
    throw new LegacyImporterError('RESTORE_EVIDENCE_MISMATCH', 4);
  }
  return {
    backupSha256,
    backupReference: `backup:${backupSha256.slice(0, 16)}`,
    restoreEvidenceSha256,
    restoreTestedAt: evidence.restoreTestedAt,
  };
}

export function backupFileName(filePath: string): string {
  return path.basename(filePath);
}
