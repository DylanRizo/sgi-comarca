import type {
  NeutralWorkbook,
  ProfileEvidence,
} from './domain/profile-types.js';
import { compareTargetModels } from './mapping/target-model-comparator.js';
import { profileWorkbook } from './profiling/workbook-profiler.js';
import { evaluateQualityRules } from './quality/quality-rules.js';
import { detectCandidateRelations } from './relations/candidate-relation-detector.js';

export * from './domain/canonical-json.js';
export * from './domain/profile-types.js';
export * from './domain/source-identity.js';
export * from './profiling/column-profiler.js';
export * from './profiling/workbook-profiler.js';
export * from './quality/quality-rules.js';
export * from './relations/candidate-relation-detector.js';
export * from './mapping/target-model-comparator.js';
export * from './reporting/private-report-writer.js';
export * from './xlsx/ooxml-metadata-inspector.js';
export * from './xlsx/sheetjs-workbook-reader.js';

export function buildProfileEvidence(
  workbook: NeutralWorkbook,
): ProfileEvidence {
  const workbookProfile = profileWorkbook(workbook);
  return {
    workbookProfile,
    findings: evaluateQualityRules(workbook, workbookProfile),
    candidateRelations: detectCandidateRelations(workbook),
    targetMappings: compareTargetModels(),
  };
}
