import { describe, expect, it } from 'vitest';

import {
  excelDateToCivil,
  managuaDateTimeToUtc,
  parseCivilDate,
} from '../src/domain/date-parser.js';
import { parseUnambiguousDecimal } from '../src/domain/decimal-parser.js';

describe('strict legacy parsers', () => {
  it('parses decimals without float rounding or separator guessing', () => {
    expect(parseUnambiguousDecimal('0012.50', 2)).toEqual({
      canonical: '12.50',
      scale: 2,
    });
    expect(() => parseUnambiguousDecimal('12,50', 2)).toThrow(
      'DECIMAL_AMBIGUOUS',
    );
    expect(() => parseUnambiguousDecimal('1.234', 2)).toThrow(
      'DECIMAL_SCALE_EXCEEDED',
    );
  });

  it('keeps civil dates unshifted and converts approved Managua time to UTC', () => {
    expect(parseCivilDate('2026-08-09')).toBe('2026-08-09');
    expect(managuaDateTimeToUtc('2026-08-09 08:30:00')).toBe(
      '2026-08-09T14:30:00.000Z',
    );
    expect(excelDateToCivil(new Date('2026-08-09T00:00:00.000Z'))).toBe(
      '2026-08-09',
    );
    expect(() => managuaDateTimeToUtc('08/09/26 08:30')).toThrow(
      'DATETIME_AMBIGUOUS',
    );
  });
});
