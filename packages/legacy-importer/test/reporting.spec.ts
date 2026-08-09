import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writePrivateImportReports } from '../src/reporting/private-import-report-writer.js';
import { databasePlan } from './fixtures/synthetic-import.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('private deterministic import reports', () => {
  it('writes byte-identical evidence without raw cell values', async () => {
    const firstRoot = await mkdtemp(path.join(tmpdir(), 'sgi-import-report-'));
    const secondRoot = await mkdtemp(path.join(tmpdir(), 'sgi-import-report-'));
    directories.push(firstRoot, secondRoot);
    const { plan, reconciliation } = databasePlan(3);
    const execution = {
      schemaVersion: 1 as const,
      mode: 'DRY_RUN' as const,
      result: 'DRY_RUN_COMMITTED_IN_DISPOSABLE_DATABASE' as const,
      sourceCode: plan.sourceCode,
      sourceSha256: plan.sourceSha256,
      batchKey: plan.batchKey,
      importBatchId: plan.importBatchId,
      totalSourceRows: 3,
      rawPreservedRows: 3,
      droppedRows: 0,
      reconciliationIssueCount: 24,
      businessEntityWriteCount: 0 as const,
      persistentImportAuthorized: false as const,
    };
    const first = await writePrivateImportReports(
      firstRoot,
      plan,
      reconciliation,
      execution,
    );
    const second = await writePrivateImportReports(
      secondRoot,
      plan,
      reconciliation,
      execution,
    );
    for (const file of [
      'import-plan.json',
      'dry-run-summary.json',
      'reconciliation.json',
      'row-results.json',
      'commit-preview.md',
    ]) {
      expect(
        await readFile(path.join(first.outputDirectory, file), 'utf8'),
      ).toBe(await readFile(path.join(second.outputDirectory, file), 'utf8'));
    }
    expect(
      await readFile(
        path.join(first.outputDirectory, 'commit-preview.md'),
        'utf8',
      ),
    ).toContain('PERSISTENT IMPORT NOT AUTHORIZED');
  });
});
