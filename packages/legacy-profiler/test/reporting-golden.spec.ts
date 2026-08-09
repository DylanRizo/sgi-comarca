import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../src/domain/canonical-json.js';
import { buildProfileEvidence } from '../src/index.js';
import {
  verifyManifestChecksums,
  writePrivateReports,
} from '../src/reporting/private-report-writer.js';
import { readWorkbookBytes } from '../src/xlsx/sheetjs-workbook-reader.js';
import { createSyntheticWorkbookBytes } from './fixtures/synthetic-workbooks.js';

describe('minimal profile golden', () => {
  it('is canonical, synthetic and free of execution metadata', async () => {
    const golden = await readFile(
      new URL('./golden/minimal-profile.json', import.meta.url),
      'utf8',
    );
    const parsed = JSON.parse(golden) as Record<string, unknown>;
    expect(canonicalJson(parsed)).toBe(golden);
    expect(golden).not.toMatch(/startedAt|completedAt|duration|:\\/u);
  });

  it('writes byte-identical deterministic evidence and excludes run metadata from the manifest', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sgi-reports-'));
    try {
      const evidence = buildProfileEvidence(
        readWorkbookBytes(createSyntheticWorkbookBytes(), 'synthetic-source'),
      );
      const first = await writePrivateReports(directory, evidence, {
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:01.000Z',
        durationMs: 1000,
        nodeVersion: 'v24.0.0',
        profilerVersion: '1.0.0',
      });
      const firstBytes = await Promise.all(
        first.manifest.artifacts.map((artifact) =>
          readFile(path.join(first.outputDirectory, artifact.name), 'utf8'),
        ),
      );
      const second = await writePrivateReports(directory, evidence, {
        startedAt: '2026-01-02T00:00:00.000Z',
        completedAt: '2026-01-02T00:00:02.000Z',
        durationMs: 2000,
        nodeVersion: 'v24.0.0',
        profilerVersion: '1.0.0',
      });
      const secondBytes = await Promise.all(
        second.manifest.artifacts.map((artifact) =>
          readFile(path.join(second.outputDirectory, artifact.name), 'utf8'),
        ),
      );
      expect(secondBytes).toEqual(firstBytes);
      expect(
        second.manifest.artifacts.map((artifact) => artifact.name),
      ).not.toContain('run.json');
      expect(
        await verifyManifestChecksums(second.outputDirectory, second.manifest),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
