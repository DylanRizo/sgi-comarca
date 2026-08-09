import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PROFILE_SCHEMA_VERSION,
  canonicalJson,
  sha256Text,
  type CandidateRelation,
  type Finding,
  type ProfileEvidence,
  type ProfileManifest,
  type TargetMapping,
  type WorkbookProfile,
} from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import type { VerifiedProfileEvidence } from '../domain/import-types.js';

interface FindingsEnvelope {
  findings: Finding[];
}

interface RelationsEnvelope {
  relations: CandidateRelation[];
}

interface MappingsEnvelope {
  mappings: TargetMapping[];
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    throw new LegacyImporterError('PROFILE_EVIDENCE_INVALID', 3);
  }
}

export async function loadAndVerifyProfileEvidence(
  profileDirectory: string,
  expectedSourceCode: string,
  expectedSourceSha256: string,
): Promise<VerifiedProfileEvidence> {
  const manifestPath = path.join(profileDirectory, 'manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8').catch(() => {
    throw new LegacyImporterError('PROFILE_MANIFEST_MISSING', 3);
  });
  let manifest: ProfileManifest;
  try {
    manifest = JSON.parse(manifestText) as ProfileManifest;
  } catch {
    throw new LegacyImporterError('PROFILE_MANIFEST_INVALID', 3);
  }
  if (
    manifest.schemaVersion !== PROFILE_SCHEMA_VERSION ||
    manifest.sourceCode !== expectedSourceCode ||
    manifest.sourceSha256 !== expectedSourceSha256
  ) {
    throw new LegacyImporterError('PROFILE_MANIFEST_IDENTITY_MISMATCH', 3);
  }
  const artifactNames = new Set(manifest.artifacts.map(({ name }) => name));
  const requiredArtifacts = [
    'workbook-profile.json',
    'findings.json',
    'candidate-relations.json',
    'target-mappings.json',
    'summary.md',
  ];
  if (requiredArtifacts.some((name) => !artifactNames.has(name))) {
    throw new LegacyImporterError('PROFILE_MANIFEST_ARTIFACT_MISSING', 3);
  }
  for (const artifact of manifest.artifacts) {
    const content = await readFile(
      path.join(profileDirectory, artifact.name),
      'utf8',
    ).catch(() => {
      throw new LegacyImporterError('PROFILE_ARTIFACT_MISSING', 3);
    });
    if (sha256Text(content) !== artifact.sha256) {
      throw new LegacyImporterError('PROFILE_ARTIFACT_CHECKSUM_MISMATCH', 3);
    }
  }
  const workbookProfile = await readJson<WorkbookProfile>(
    path.join(profileDirectory, 'workbook-profile.json'),
  );
  const findingsEnvelope = await readJson<FindingsEnvelope>(
    path.join(profileDirectory, 'findings.json'),
  );
  const relationsEnvelope = await readJson<RelationsEnvelope>(
    path.join(profileDirectory, 'candidate-relations.json'),
  );
  const mappingsEnvelope = await readJson<MappingsEnvelope>(
    path.join(profileDirectory, 'target-mappings.json'),
  );
  if (
    workbookProfile.profileSchemaVersion !== PROFILE_SCHEMA_VERSION ||
    workbookProfile.sourceCode !== expectedSourceCode ||
    workbookProfile.sourceSha256 !== expectedSourceSha256
  ) {
    throw new LegacyImporterError('PROFILE_EVIDENCE_IDENTITY_MISMATCH', 3);
  }
  const evidence: ProfileEvidence = {
    workbookProfile,
    findings: findingsEnvelope.findings,
    candidateRelations: relationsEnvelope.relations,
    targetMappings: mappingsEnvelope.mappings,
  };
  return {
    profileDirectory,
    manifest,
    manifestSha256: sha256Text(canonicalJson(manifest)),
    evidence,
  };
}
