import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { canonicalJson, sha256Text } from '@sgi/legacy-profiler';
import { afterEach, describe, expect, it } from 'vitest';

import { loadAndVerifyProfileEvidence } from '../src/input/profile-evidence-loader.js';
import { loadMappingRegistry } from '../src/mapping/mapping-registry.js';
import {
  syntheticEvidence,
  syntheticMapping,
} from './fixtures/synthetic-import.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function writeSyntheticEvidence(): Promise<{
  directory: string;
  sourceCode: string;
  sourceSha256: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), 'sgi-profile-evidence-'));
  directories.push(directory);
  const verified = syntheticEvidence();
  const files: Record<string, string> = {
    'workbook-profile.json': canonicalJson(verified.evidence.workbookProfile),
    'findings.json': canonicalJson({ findings: verified.evidence.findings }),
    'candidate-relations.json': canonicalJson({ relations: [] }),
    'target-mappings.json': canonicalJson({ mappings: [] }),
    'summary.md': '# Synthetic evidence\n',
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(directory, name), content, 'utf8');
  }
  await writeFile(
    path.join(directory, 'manifest.json'),
    canonicalJson({
      schemaVersion: 1,
      sourceCode: verified.evidence.workbookProfile.sourceCode,
      sourceSha256: verified.evidence.workbookProfile.sourceSha256,
      artifacts: Object.entries(files).map(([name, content]) => ({
        name,
        sha256: sha256Text(content),
      })),
    }),
    'utf8',
  );
  return {
    directory,
    sourceCode: verified.evidence.workbookProfile.sourceCode,
    sourceSha256: verified.evidence.workbookProfile.sourceSha256,
  };
}

describe('profile evidence and mapping integrity gates', () => {
  it('accepts a matching deterministic manifest and rejects tampering', async () => {
    const evidence = await writeSyntheticEvidence();
    await expect(
      loadAndVerifyProfileEvidence(
        evidence.directory,
        evidence.sourceCode,
        evidence.sourceSha256,
      ),
    ).resolves.toMatchObject({
      evidence: {
        workbookProfile: { sourceCode: evidence.sourceCode },
      },
    });
    const profilePath = path.join(evidence.directory, 'workbook-profile.json');
    await writeFile(
      profilePath,
      `${await readFile(profilePath, 'utf8')} `,
      'utf8',
    );
    await expect(
      loadAndVerifyProfileEvidence(
        evidence.directory,
        evidence.sourceCode,
        evidence.sourceSha256,
      ),
    ).rejects.toThrow('PROFILE_ARTIFACT_CHECKSUM_MISMATCH');
  });

  it('rejects source and mapping identity mismatches', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sgi-mapping-'));
    directories.push(directory);
    const mappingPath = path.join(directory, 'mapping.json');
    const mapping = syntheticMapping();
    await writeFile(mappingPath, canonicalJson(mapping), 'utf8');
    await expect(
      loadMappingRegistry(
        mappingPath,
        mapping.sourceCode,
        mapping.sourceSha256,
      ),
    ).resolves.toMatchObject({ mapping: { mappingVersion: 'synthetic.1' } });
    await expect(
      loadMappingRegistry(
        mappingPath,
        'different-source',
        mapping.sourceSha256,
      ),
    ).rejects.toThrow('MAPPING_REGISTRY_IDENTITY_MISMATCH');
  });
});
