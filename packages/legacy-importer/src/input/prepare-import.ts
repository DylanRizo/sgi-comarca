import { readWorkbookFile } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import type { PreparedImport } from '../domain/import-types.js';
import { loadMappingRegistry } from '../mapping/mapping-registry.js';
import { buildImportPlan } from '../planning/import-plan-builder.js';
import { reconcileImportPlan } from '../reconciliation/reconciliation-engine.js';
import { loadAndVerifyProfileEvidence } from './profile-evidence-loader.js';

export const EXPECTED_SOURCE_ROWS = 2_064;

export async function prepareImport(options: {
  inputPath: string;
  sourceCode: string;
  expectedSourceSha256: string;
  profileDirectory: string;
  mappingPath: string;
}): Promise<PreparedImport> {
  const verifiedEvidence = await loadAndVerifyProfileEvidence(
    options.profileDirectory,
    options.sourceCode,
    options.expectedSourceSha256,
  );
  const { workbook } = await readWorkbookFile(
    options.inputPath,
    options.sourceCode,
  );
  if (workbook.sourceSha256 !== options.expectedSourceSha256) {
    throw new LegacyImporterError('SOURCE_SHA256_MISMATCH', 3);
  }
  const { mapping, mappingSha256 } = await loadMappingRegistry(
    options.mappingPath,
    options.sourceCode,
    options.expectedSourceSha256,
  );
  const plan = buildImportPlan(
    workbook,
    verifiedEvidence,
    mapping,
    mappingSha256,
  );
  if (plan.totalSourceRows !== EXPECTED_SOURCE_ROWS) {
    throw new LegacyImporterError('SOURCE_ROW_COUNT_INVARIANT_FAILED', 6);
  }
  const reconciliation = reconcileImportPlan(plan);
  if (
    reconciliation.rawPreservedRows !== EXPECTED_SOURCE_ROWS ||
    reconciliation.droppedRows !== 0 ||
    reconciliation.phase3cFindingsExpected !== 24 ||
    reconciliation.phase3cFindingsAccounted !== 24
  ) {
    throw new LegacyImporterError('RECONCILIATION_INVARIANT_FAILED', 6);
  }
  return {
    workbook,
    verifiedEvidence,
    mapping,
    mappingSha256,
    plan,
    reconciliation,
  };
}
