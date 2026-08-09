import { describe, expect, it } from 'vitest';

import type { NeutralSheet } from '../src/domain/profile-types.js';
import { profileColumns } from '../src/profiling/column-profiler.js';

const sheet: NeutralSheet = {
  name: 'Synthetic',
  index: 0,
  visibility: 'VISIBLE',
  physicalRange: 'A1:A5',
  merges: [],
  ooxml: {
    dimension: 'A1:A5',
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
      value: 'Código',
    },
    { address: 'A2', row: 2, column: 1, physicalType: 'string', value: ' 001' },
    { address: 'A3', row: 3, column: 1, physicalType: 'string', value: '001 ' },
    {
      address: 'A4',
      row: 4,
      column: 1,
      physicalType: 'string',
      value: 'A\u0301',
    },
  ],
};

describe('column profiler', () => {
  it('observes whitespace, Unicode and identifier signals without transforming values', () => {
    const [profile] = profileColumns(sheet, 1, 5, 1);
    expect(profile?.rowCount).toBe(4);
    expect(profile?.nullCount).toBe(1);
    expect(profile?.leadingWhitespaceCount).toBe(1);
    expect(profile?.trailingWhitespaceCount).toBe(1);
    expect(profile?.nonNfcCount).toBe(1);
    expect(profile?.candidateIdentifierSignals).toContain(
      'HEADER_IDENTIFIER_LIKE',
    );
    expect(sheet.cells[1]?.value).toBe(' 001');
  });
});
