import { describe, expect, it } from 'vitest';

import { csvCell, csvDocument, csvFilename } from './report-csv.js';
import { stockValueCents } from './report-stock-value.js';

describe('FASE 9B.2 CSV serialization', () => {
  it('leaves a plain value untouched', () => {
    expect(csvCell('Café molido')).toBe('Café molido');
  });

  it('renders null and undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes a value containing the delimiter so later columns cannot shift', () => {
    expect(csvCell('Arroz, blanco')).toBe('"Arroz, blanco"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('Bolsa "grande"')).toBe('"Bolsa ""grande"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });

  it('neutralises a value a spreadsheet would evaluate as a formula', () => {
    // Product names and entry descriptions are operator-supplied text, so an
    // exported report opened in Excel must not execute them.
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+A1')).toBe("'+A1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('quotes a neutralised formula that also contains a delimiter', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
  });

  it('does not mistake a negative number for a formula it must quote', () => {
    // A leading minus is still guarded, because Excel treats it as a formula.
    expect(csvCell('-12.50')).toBe("'-12.50");
  });

  it('builds a document with CRLF endings and a trailing newline', () => {
    expect(csvDocument(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('builds a header-only document when there are no rows', () => {
    expect(csvDocument(['a', 'b'], [])).toBe('a,b\r\n');
  });

  it('names the download deterministically and without user input', () => {
    const name = csvFilename('ventas', new Date('2026-08-30T18:04:05.000Z'));
    expect(name).toBe('sgi-ventas-20260830T180405.csv');
  });
});

describe('FASE 9B.2 stock value arithmetic', () => {
  it('multiplies quantity by unit cost exactly', () => {
    expect(stockValueCents('3', '10.50')).toBe(3150n);
  });

  it('keeps four-decimal quantities exact', () => {
    expect(stockValueCents('1.5000', '2.00')).toBe(300n);
  });

  it('rounds half up on the exact scaled integer', () => {
    // 0.5 * 0.01 = 0.005, exactly half a cent, so it rounds up to one.
    expect(stockValueCents('0.5', '0.01')).toBe(1n);
  });

  it('avoids the drift a float multiplication would introduce', () => {
    // 0.1 * 0.2 is 0.020000000000000004 in binary floating point.
    expect(stockValueCents('0.1', '0.20')).toBe(2n);
  });

  it('returns null for a malformed quantity or cost', () => {
    expect(stockValueCents('abc', '1.00')).toBeNull();
    expect(stockValueCents('1', 'abc')).toBeNull();
  });

  it('returns null rather than overflowing the money range', () => {
    expect(stockValueCents('999999999999999', '99999999999999.99')).toBeNull();
  });
});
