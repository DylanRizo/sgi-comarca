import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson, sha256Text } from '@sgi/legacy-profiler';

import type {
  ImportExecutionSummary,
  ImportPlan,
  ReconciliationResult,
} from '../domain/import-types.js';

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'w' });
  await rename(temporaryPath, filePath);
}

function sanitizedPlan(plan: ImportPlan) {
  return {
    schemaVersion: plan.schemaVersion,
    importerVersion: plan.importerVersion,
    sourceCode: plan.sourceCode,
    sourceSha256: plan.sourceSha256,
    manifestSha256: plan.manifestSha256,
    mappingVersion: plan.mappingVersion,
    mappingSha256: plan.mappingSha256,
    batchKey: plan.batchKey,
    importBatchId: plan.importBatchId,
    totalSourceRows: plan.totalSourceRows,
    businessWritesEnabled: plan.businessWritesEnabled,
    businessEntityCounts: {
      units: plan.businessPlan?.units.length ?? 0,
      products: plan.businessPlan?.products.length ?? 0,
      inventoryBalances: plan.businessPlan?.inventoryBalances.length ?? 0,
      productWarehouseValuations:
        plan.businessPlan?.productWarehouseValuations.length ?? 0,
    },
    sheets: plan.sheets,
    phase3cFindings: plan.phase3cFindings.map((finding) => ({
      findingId: finding.findingId,
      ruleCode: finding.ruleCode,
      severity: finding.severity,
      sheet: finding.sheet,
      location: finding.location,
      requiresHumanDecision: finding.requiresHumanDecision,
    })),
  };
}

function commitPreview(plan: ImportPlan, reconciliation: ReconciliationResult) {
  const humanDecisions = reconciliation.issues.filter(
    ({ requiresHumanApproval }) => requiresHumanApproval,
  ).length;
  return [
    '# Vista previa privada de una importación futura',
    '',
    '**PERSISTENT IMPORT NOT AUTHORIZED**',
    '',
    `- Fuente: ${plan.sourceCode}`,
    `- SHA-256: ${plan.sourceSha256}`,
    `- Filas raw preservadas: ${reconciliation.rawPreservedRows}`,
    `- Filas descartadas: ${reconciliation.droppedRows}`,
    `- Issues que requieren aprobación humana: ${humanDecisions}`,
    `- Escrituras simuladas de entidades de negocio: ${
      (plan.businessPlan?.units.length ?? 0) +
      (plan.businessPlan?.products.length ?? 0) +
      (plan.businessPlan?.inventoryBalances.length ?? 0) +
      (plan.businessPlan?.productWarehouseValuations.length ?? 0)
    }`,
    '- Destino: PostgreSQL temporal verificado y descartable',
    '',
    'Este archivo describe una simulación en base descartable; no autoriza `--commit` ni escritura persistente.',
    '',
  ].join('\n');
}

export interface WrittenImportReports {
  outputDirectory: string;
  checksums: Record<string, string>;
}

export async function writePrivateImportReports(
  outputRoot: string,
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
  execution: ImportExecutionSummary,
): Promise<WrittenImportReports> {
  const outputDirectory = path.join(
    outputRoot,
    plan.sourceCode,
    plan.sourceSha256,
    plan.batchKey,
  );
  await mkdir(outputDirectory, { recursive: true });
  const files: Record<string, string> = {
    'import-plan.json': canonicalJson(sanitizedPlan(plan)),
    'reconciliation.json': canonicalJson(reconciliation),
    'row-results.json': canonicalJson({
      schemaVersion: 1,
      sourceCode: plan.sourceCode,
      sourceSha256: plan.sourceSha256,
      rows: plan.records.map((record) => ({
        recordId: record.id,
        sourceEntity: record.sourceEntity,
        sourceRow: record.legacyRowNumber,
        rawHash: record.rawHash,
        status: record.status,
      })),
    }),
    'commit-preview.md': commitPreview(plan, reconciliation),
  };
  const checksums = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, sha256Text(content)]),
  );
  files['dry-run-summary.json'] = canonicalJson({
    ...execution,
    artifactChecksums: checksums,
  });
  for (const [name, content] of Object.entries(files)) {
    await writeAtomic(path.join(outputDirectory, name), content);
  }
  return { outputDirectory, checksums };
}
