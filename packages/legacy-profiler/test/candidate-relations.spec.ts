import { describe, expect, it } from 'vitest';

import { DEFAULT_SECURITY_LIMITS } from '../src/config/sgi-legacy-inventory-profile.js';
import type {
  NeutralSheet,
  NeutralWorkbook,
} from '../src/domain/profile-types.js';
import { detectCandidateRelations } from '../src/relations/candidate-relation-detector.js';

function sheet(
  name: string,
  header: string,
  values: string[],
  index: number,
): NeutralSheet {
  return {
    name,
    index,
    visibility: 'VISIBLE',
    physicalRange: `A1:A${values.length + 1}`,
    merges: [],
    ooxml: {
      dimension: `A1:A${values.length + 1}`,
      dimensionMissing: false,
      formulas: [],
      sharedFormulaDefinitionCount: 0,
      tablePartCount: 0,
      tableNames: [],
      relationships: [],
    },
    cells: [
      {
        address: 'A1',
        row: 1,
        column: 1,
        physicalType: 'string',
        value: header,
      },
      ...values.map((value, row) => ({
        address: `A${row + 2}`,
        row: row + 2,
        column: 1,
        physicalType: 'string' as const,
        value,
      })),
    ],
  };
}

describe('candidate relation detector', () => {
  it('quantifies overlap without declaring a foreign key', () => {
    const workbook: NeutralWorkbook = {
      sourceCode: 'synthetic-source',
      sourceSha256: 'c'.repeat(64),
      sizeBytes: 1,
      fileType: 'xlsx',
      dateSystem: '1900',
      definedNames: 0,
      hasMacros: false,
      hasConnections: false,
      hasExternalLinks: false,
      hasPivotMetadata: false,
      securityLimits: DEFAULT_SECURITY_LIMITS,
      sheets: [
        sheet('Productos', 'Código', ['A', 'B'], 0),
        sheet('Inventario', 'codigo unico del producto', ['A', 'A', 'C'], 1),
      ],
    };
    const relation = detectCandidateRelations(workbook).find(
      (candidate) =>
        candidate.sourceSheet === 'Productos' &&
        candidate.targetSheet === 'Inventario',
    );
    expect(relation).toMatchObject({
      relationType: 'CANDIDATE_RELATION',
      intersectionCount: 1,
      orphanCount: 1,
    });
  });
});
