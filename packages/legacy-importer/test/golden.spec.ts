import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

async function golden(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      fileURLToPath(new URL(`./golden/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as unknown;
}

describe('small synthetic importer golden evidence', () => {
  it('keeps the approved plan, reconciliation and dry-run envelopes stable', async () => {
    expect(await golden('import-plan.json')).toEqual({
      businessWritesEnabled: false,
      schemaVersion: 1,
      scope: 'PRESERVE_RAW_ONLY',
      sourceCode: 'synthetic-source',
      totalSourceRows: 8,
    });
    expect(await golden('reconciliation.json')).toEqual({
      droppedRows: 0,
      phase3cFindingsAccounted: 24,
      rawPreservedRows: 8,
      schemaVersion: 1,
      totalSourceRows: 8,
    });
    expect(await golden('dry-run-summary.json')).toEqual({
      businessEntityWriteCount: 0,
      mode: 'DRY_RUN',
      persistentImportAuthorized: false,
      result: 'DRY_RUN_COMMITTED_IN_DISPOSABLE_DATABASE',
      schemaVersion: 1,
    });
  });
});
