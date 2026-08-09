import { describe, expect, it } from 'vitest';

import { DEFAULT_SECURITY_LIMITS } from '../src/config/sgi-legacy-inventory-profile.js';
import type { NeutralWorkbook } from '../src/domain/profile-types.js';
import { profileWorkbook } from '../src/profiling/workbook-profiler.js';
import { evaluateQualityRules } from '../src/quality/quality-rules.js';

function syntheticProducts(): NeutralWorkbook {
  return {
    sourceCode: 'synthetic-source',
    sourceSha256: 'b'.repeat(64),
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
      {
        name: 'Productos',
        index: 0,
        visibility: 'VISIBLE',
        physicalRange: 'A1:G10',
        merges: [],
        ooxml: {
          dimension: 'A1:G10',
          dimensionMissing: false,
          formulas: [],
          sharedFormulaDefinitionCount: 0,
          tablePartCount: 0,
          tableNames: [],
          relationships: [],
        },
        cells: [
          ...[
            'Código',
            'Nombre',
            'Unidad',
            'Grupo',
            'Stock Mínimo',
            'Precio',
            'Fecha Creación',
          ].map((value, index) => ({
            address: `${String.fromCharCode(65 + index)}1`,
            row: 1,
            column: index + 1,
            physicalType: 'string' as const,
            value,
          })),
          {
            address: 'A2',
            row: 2,
            column: 1,
            physicalType: 'string',
            value: 'DUP',
          },
          {
            address: 'B2',
            row: 2,
            column: 2,
            physicalType: 'string',
            value: ' Item',
          },
          {
            address: 'A3',
            row: 3,
            column: 1,
            physicalType: 'string',
            value: 'DUP',
          },
          {
            address: 'B3',
            row: 3,
            column: 2,
            physicalType: 'string',
            value: 'Item',
          },
        ],
      },
    ],
  };
}

describe('quality rules', () => {
  it('reports candidate-key duplicates, whitespace and pending business decisions', () => {
    const workbook = syntheticProducts();
    const findings = evaluateQualityRules(workbook, profileWorkbook(workbook));
    expect(findings.map((finding) => finding.ruleCode)).toContain(
      'LEGACY_DGGR_X_DUPLICATE',
    );
    expect(findings.map((finding) => finding.ruleCode)).toContain(
      'LEADING_WHITESPACE',
    );
    expect(
      findings.some(
        (finding) => finding.requiresHumanDecision && finding.blocksPhase4,
      ),
    ).toBe(true);
    expect(findings.every((finding) => !finding.blocksProfiling)).toBe(true);
  });
});
