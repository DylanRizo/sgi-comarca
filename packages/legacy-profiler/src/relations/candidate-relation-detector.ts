import { SGI_RELATIONS } from '../config/sgi-legacy-inventory-profile.js';
import type {
  CandidateRelation,
  NeutralCell,
  NeutralWorkbook,
} from '../domain/profile-types.js';
import {
  normalizeComparable,
  normalizeHeaderCandidate,
} from '../profiling/column-profiler.js';

function valuesFor(
  workbook: NeutralWorkbook,
  sheetName: string,
  header: string,
): string[] {
  const sheet = workbook.sheets.find(
    (candidate) => candidate.name === sheetName,
  );
  if (sheet === undefined) return [];
  const headerRow = sheetName === 'Entrada de Productos' ? 14 : 1;
  const headerCell = sheet.cells.find(
    (cell) =>
      cell.row === headerRow &&
      cell.value !== null &&
      cell.value !== undefined &&
      normalizeHeaderCandidate(String(cell.value)) ===
        normalizeHeaderCandidate(header),
  );
  if (headerCell === undefined) return [];
  return sheet.cells
    .filter(
      (cell: NeutralCell) =>
        cell.column === headerCell.column &&
        cell.row > headerRow &&
        cell.value !== null &&
        cell.value !== undefined &&
        String(cell.value).length > 0,
    )
    .map((cell) => normalizeComparable(String(cell.value)));
}

function headerSimilarity(left: string, right: string): number {
  const a = new Set(normalizeComparable(left).split(' ').filter(Boolean));
  const b = new Set(normalizeComparable(right).split(' ').filter(Boolean));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : Number((intersection / union).toFixed(6));
}

export function detectCandidateRelations(
  workbook: NeutralWorkbook,
): CandidateRelation[] {
  return SGI_RELATIONS.map((relation) => {
    const sourceValues = valuesFor(
      workbook,
      relation.sourceSheet,
      relation.sourceColumn,
    );
    const targetValues = valuesFor(
      workbook,
      relation.targetSheet,
      relation.targetColumn,
    );
    const source = new Set(sourceValues);
    const target = new Set(targetValues);
    const conceptualTarget = relation.targetSheet === 'TARGET_MODEL';
    const intersectionCount = [...source].filter((value) =>
      target.has(value),
    ).length;
    const sourceCoverage =
      source.size === 0 ? 0 : intersectionCount / source.size;
    const targetCoverage =
      target.size === 0 ? 0 : intersectionCount / target.size;
    const duplicateSource = sourceValues.length > source.size;
    const duplicateTarget = targetValues.length > target.size;
    const cardinality =
      relation.sourceSheet === relation.targetSheet
        ? 'GROUPING_ONE_TO_MANY'
        : duplicateSource && duplicateTarget
          ? 'MANY_TO_MANY_CANDIDATE'
          : duplicateSource
            ? 'MANY_TO_ONE_CANDIDATE'
            : duplicateTarget
              ? 'ONE_TO_MANY_CANDIDATE'
              : 'ONE_TO_ONE_CANDIDATE';
    const confidenceScore = conceptualTarget ? 0.7 : sourceCoverage;
    const confidence: CandidateRelation['confidence'] =
      confidenceScore >= 0.95
        ? 'HIGH'
        : confidenceScore >= 0.7
          ? 'MEDIUM'
          : 'LOW';
    return {
      relationType: 'CANDIDATE_RELATION' as const,
      sourceSheet: relation.sourceSheet,
      sourceColumn: relation.sourceColumn,
      targetSheet: relation.targetSheet,
      targetColumn: relation.targetColumn,
      normalizedHeaderSimilarity: headerSimilarity(
        relation.sourceColumn,
        relation.targetColumn,
      ),
      sourceDistinct: source.size,
      targetDistinct: target.size,
      intersectionCount,
      sourceCoverage: Number(sourceCoverage.toFixed(6)),
      targetCoverage: Number(targetCoverage.toFixed(6)),
      orphanCount: conceptualTarget
        ? 0
        : Math.max(0, source.size - intersectionCount),
      cardinalityCandidate: conceptualTarget
        ? 'CONCEPTUAL_MAPPING_CANDIDATE'
        : cardinality,
      confidence,
      evidenceCodes: [...relation.evidenceCodes].sort(),
    };
  }).sort((left, right) =>
    `${left.sourceSheet}\u0000${left.sourceColumn}\u0000${left.targetSheet}\u0000${left.targetColumn}`.localeCompare(
      `${right.sourceSheet}\u0000${right.sourceColumn}\u0000${right.targetSheet}\u0000${right.targetColumn}`,
      'en',
    ),
  );
}
