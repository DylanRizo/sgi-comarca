import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { LegacyImporterError } from '../domain/errors.js';

export const APPROVED_ARTIFACT_NAMES = [
  'import-plan.json',
  'dry-run-summary.json',
  'reconciliation.json',
  'row-results.json',
  'commit-preview.md',
] as const;

export type ApprovedArtifactName = (typeof APPROVED_ARTIFACT_NAMES)[number];
export type ApprovedArtifactChecksums = Record<ApprovedArtifactName, string>;

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

export async function verifyApprovedDryRunArtifacts(
  reportDirectory: string,
  expected: ApprovedArtifactChecksums,
): Promise<ApprovedArtifactChecksums> {
  const verified = {} as ApprovedArtifactChecksums;
  for (const name of APPROVED_ARTIFACT_NAMES) {
    const expectedSha = expected[name];
    if (!/^[a-f0-9]{64}$/u.test(expectedSha)) {
      throw new LegacyImporterError('APPROVED_ARTIFACT_SHA_INVALID', 2);
    }
    const filePath = path.join(reportDirectory, name);
    await access(filePath).catch(() => {
      throw new LegacyImporterError('APPROVED_ARTIFACT_MISSING', 4);
    });
    const actual = await sha256File(filePath);
    if (actual !== expectedSha) {
      throw new LegacyImporterError(
        `APPROVED_ARTIFACT_MISMATCH:${name.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '_')}`,
        4,
      );
    }
    verified[name] = actual;
  }
  return verified;
}
