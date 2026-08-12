import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyBackupRestoreEvidence } from '../src/guards/backup-evidence.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'sgi-backup-evidence-'));
  temporaryDirectories.push(directory);
  const backupPath = path.join(directory, 'backup.dump');
  const backupBytes = Buffer.from('PGDMPsynthetic-safe-archive', 'ascii');
  await writeFile(backupPath, backupBytes);
  const backupSha256 = createHash('sha256').update(backupBytes).digest('hex');
  const evidencePath = path.join(directory, 'restore.json');
  const now = new Date('2026-08-09T12:00:00.000Z');
  const evidence = {
    schemaVersion: 1,
    backupSha256,
    sourceDatabaseFingerprint: 'a'.repeat(64),
    restoredDatabaseFingerprint: 'b'.repeat(64),
    restoredContext: 'DISPOSABLE_RESTORE_TEST',
    backupCreatedAt: '2026-08-09T10:00:00.000Z',
    restoreTestedAt: '2026-08-09T11:00:00.000Z',
    result: 'PASS',
    migrationStateSha256: 'c'.repeat(64),
    sanityCounts: { units: 0, products: 0 },
  };
  await writeFile(evidencePath, JSON.stringify(evidence));
  const restoreEvidenceSha256 = createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  return {
    backupPath,
    backupSha256,
    evidencePath,
    evidence,
    restoreEvidenceSha256,
    now,
  };
}

describe('verified backup and restore evidence', () => {
  it('accepts a pinned custom archive with structured recent restore proof', async () => {
    const value = await fixture();
    await expect(
      verifyBackupRestoreEvidence({
        backupPath: value.backupPath,
        expectedBackupSha256: value.backupSha256,
        restoreEvidencePath: value.evidencePath,
        expectedRestoreEvidenceSha256: value.restoreEvidenceSha256,
        expectedTargetFingerprint: value.evidence.sourceDatabaseFingerprint,
        expectedMigrationStateSha256: value.evidence.migrationStateSha256,
        expectedSanityCounts: value.evidence.sanityCounts,
        now: value.now,
        inspector: { list: async () => '; synthetic pg_restore list' },
      }),
    ).resolves.toMatchObject({ backupSha256: value.backupSha256 });
  });

  it('rejects a checksum mismatch before trusting restore evidence', async () => {
    const value = await fixture();
    await expect(
      verifyBackupRestoreEvidence({
        backupPath: value.backupPath,
        expectedBackupSha256: 'd'.repeat(64),
        restoreEvidencePath: value.evidencePath,
        expectedRestoreEvidenceSha256: value.restoreEvidenceSha256,
        expectedTargetFingerprint: value.evidence.sourceDatabaseFingerprint,
        expectedMigrationStateSha256: value.evidence.migrationStateSha256,
        expectedSanityCounts: value.evidence.sanityCounts,
        now: value.now,
        inspector: { list: async () => '; synthetic pg_restore list' },
      }),
    ).rejects.toThrow('BACKUP_SHA256_MISMATCH');
  });

  it('rejects missing backup and missing restore evidence', async () => {
    const value = await fixture();
    await expect(
      verifyBackupRestoreEvidence({
        backupPath: path.join(path.dirname(value.backupPath), 'missing.dump'),
        expectedBackupSha256: value.backupSha256,
        restoreEvidencePath: value.evidencePath,
        expectedRestoreEvidenceSha256: value.restoreEvidenceSha256,
        expectedTargetFingerprint: value.evidence.sourceDatabaseFingerprint,
        expectedMigrationStateSha256: value.evidence.migrationStateSha256,
        expectedSanityCounts: value.evidence.sanityCounts,
        now: value.now,
        inspector: { list: async () => '; synthetic pg_restore list' },
      }),
    ).rejects.toThrow('BACKUP_FILE_MISSING');
    await expect(
      verifyBackupRestoreEvidence({
        backupPath: value.backupPath,
        expectedBackupSha256: value.backupSha256,
        restoreEvidencePath: path.join(
          path.dirname(value.evidencePath),
          'missing.json',
        ),
        expectedRestoreEvidenceSha256: value.restoreEvidenceSha256,
        expectedTargetFingerprint: value.evidence.sourceDatabaseFingerprint,
        expectedMigrationStateSha256: value.evidence.migrationStateSha256,
        expectedSanityCounts: value.evidence.sanityCounts,
        now: value.now,
        inspector: { list: async () => '; synthetic pg_restore list' },
      }),
    ).rejects.toThrow('RESTORE_EVIDENCE_MISSING');
  });
});
