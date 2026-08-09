import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson, sha256Text } from '../domain/canonical-json.js';
import {
  PROFILE_SCHEMA_VERSION,
  type ProfileEvidence,
  type ProfileManifest,
  type ProfileRun,
} from '../domain/profile-types.js';

const DETERMINISTIC_ARTIFACTS = [
  'workbook-profile.json',
  'findings.json',
  'candidate-relations.json',
  'target-mappings.json',
  'summary.md',
] as const;

function sanitizedSummary(evidence: ProfileEvidence): string {
  const severities = ['INFO', 'WARNING', 'ERROR', 'BLOCKER'] as const;
  const severityLines = severities.map((severity) => {
    const count = evidence.findings.filter(
      (finding) => finding.severity === severity,
    ).length;
    return `- ${severity}: ${count}`;
  });
  const phase4Blockers = evidence.findings.filter(
    (finding) => finding.blocksPhase4,
  ).length;
  const profilingBlockers = evidence.findings.filter(
    (finding) => finding.blocksProfiling,
  ).length;
  const humanDecisions = evidence.findings.filter(
    (finding) => finding.requiresHumanDecision,
  ).length;
  const sheetLines = evidence.workbookProfile.sheets.map(
    (sheet) =>
      `- ${sheet.name}: ${sheet.dataRows} filas, ${sheet.dataColumns} columnas, ` +
      `${sheet.formulaCellCount} fórmulas, ${sheet.cachedFormulaValueCount} resultados cacheados`,
  );
  return [
    '# Resumen privado sanitizado del perfil legacy',
    '',
    `- Source code: \`${evidence.workbookProfile.sourceCode}\``,
    `- SHA-256: \`${evidence.workbookProfile.sourceSha256}\``,
    `- Hojas: ${evidence.workbookProfile.sheetCount}`,
    `- Relaciones candidatas: ${evidence.candidateRelations.length}`,
    `- Mappings observacionales: ${evidence.targetMappings.length}`,
    '',
    '## Hallazgos',
    '',
    ...severityLines,
    `- Bloquean profiling: ${profilingBlockers}`,
    `- Pueden bloquear FASE 4: ${phase4Blockers}`,
    `- Requieren decisión humana: ${humanDecisions}`,
    '',
    '## Hojas',
    '',
    ...sheetLines,
    '',
    '> Este resumen omite muestras, valores de celdas y datos empresariales.',
    '',
  ].join('\n');
}

function evidenceFiles(evidence: ProfileEvidence): Record<string, string> {
  return {
    'workbook-profile.json': canonicalJson(evidence.workbookProfile),
    'findings.json': canonicalJson({
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      sourceCode: evidence.workbookProfile.sourceCode,
      sourceSha256: evidence.workbookProfile.sourceSha256,
      findings: evidence.findings,
    }),
    'candidate-relations.json': canonicalJson({
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      sourceCode: evidence.workbookProfile.sourceCode,
      sourceSha256: evidence.workbookProfile.sourceSha256,
      relations: evidence.candidateRelations,
    }),
    'target-mappings.json': canonicalJson({
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      sourceCode: evidence.workbookProfile.sourceCode,
      sourceSha256: evidence.workbookProfile.sourceSha256,
      mappings: evidence.targetMappings,
    }),
    'summary.md': sanitizedSummary(evidence),
  };
}

function requiredFile(files: Record<string, string>, name: string): string {
  const content = files[name];
  if (content === undefined) throw new Error(`REPORT_ARTIFACT_MISSING:${name}`);
  return content;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'w' });
  await rename(temporaryPath, filePath);
}

export interface WrittenProfile {
  outputDirectory: string;
  manifest: ProfileManifest;
  deterministicChecksums: Record<string, string>;
}

export async function writePrivateReports(
  outputRoot: string,
  evidence: ProfileEvidence,
  run: ProfileRun,
): Promise<WrittenProfile> {
  const outputDirectory = path.join(
    outputRoot,
    evidence.workbookProfile.sourceCode,
    evidence.workbookProfile.sourceSha256,
  );
  await mkdir(outputDirectory, { recursive: true });
  const files = evidenceFiles(evidence);
  const deterministicChecksums = Object.fromEntries(
    DETERMINISTIC_ARTIFACTS.map((name) => [
      name,
      sha256Text(requiredFile(files, name)),
    ]),
  );
  const manifest: ProfileManifest = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    sourceCode: evidence.workbookProfile.sourceCode,
    sourceSha256: evidence.workbookProfile.sourceSha256,
    artifacts: DETERMINISTIC_ARTIFACTS.map((name) => ({
      name,
      sha256: deterministicChecksums[name] ?? '',
    })),
  };
  for (const name of DETERMINISTIC_ARTIFACTS) {
    await writeAtomic(
      path.join(outputDirectory, name),
      requiredFile(files, name),
    );
  }
  await writeAtomic(
    path.join(outputDirectory, 'manifest.json'),
    canonicalJson(manifest),
  );
  await writeAtomic(path.join(outputDirectory, 'run.json'), canonicalJson(run));
  return { outputDirectory, manifest, deterministicChecksums };
}

export async function verifyManifestChecksums(
  outputDirectory: string,
  manifest: ProfileManifest,
): Promise<boolean> {
  for (const artifact of manifest.artifacts) {
    const content = await readFile(
      path.join(outputDirectory, artifact.name),
      'utf8',
    );
    if (sha256Text(content) !== artifact.sha256) return false;
  }
  return true;
}
