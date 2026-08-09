import { describe, expect, it } from 'vitest';

import { DEFAULT_SECURITY_LIMITS } from '../src/config/sgi-legacy-inventory-profile.js';
import type { NeutralWorkbook } from '../src/domain/profile-types.js';
import { profileWorkbook } from '../src/profiling/workbook-profiler.js';

const workbook: NeutralWorkbook = {
  sourceCode: 'synthetic-source',
  sourceSha256: 'a'.repeat(64),
  sizeBytes: 100,
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
      name: 'Synthetic',
      index: 0,
      visibility: 'VISIBLE',
      physicalRange: 'A1:B20',
      merges: [],
      cells: [
        {
          address: 'A1',
          row: 1,
          column: 1,
          physicalType: 'string',
          value: 'ID',
        },
        {
          address: 'B1',
          row: 1,
          column: 2,
          physicalType: 'string',
          value: 'Valor',
        },
        {
          address: 'A2',
          row: 2,
          column: 1,
          physicalType: 'string',
          value: 'X',
        },
        {
          address: 'B2',
          row: 2,
          column: 2,
          physicalType: 'number',
          value: 2,
          formula: '1+1',
          cachedValue: 2,
        },
      ],
      ooxml: {
        dimensionMissing: true,
        formulas: [
          {
            address: 'B2',
            type: 'shared',
            reference: 'B2:B2',
            sharedIndex: '0',
            hasCachedValue: true,
          },
        ],
        sharedFormulaDefinitionCount: 1,
        tablePartCount: 0,
        tableNames: [],
        relationships: [],
      },
    },
  ],
};

describe('workbook profiler', () => {
  it('separates physical and logical ranges and formula metrics', () => {
    const profile = profileWorkbook(workbook);
    expect(profile.sheets[0]).toMatchObject({
      physicalRange: 'A1:B20',
      logicalDataRange: 'A1:B2',
      dataRows: 1,
      formulaCellCount: 1,
      cachedFormulaValueCount: 1,
      sharedFormulaDefinitionCount: 1,
    });
  });
});
