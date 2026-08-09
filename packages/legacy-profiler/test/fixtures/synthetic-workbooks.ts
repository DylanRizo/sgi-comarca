import * as XLSX from 'xlsx';

export function createSyntheticWorkbookBytes(options?: {
  date1904?: boolean;
}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const primary = XLSX.utils.aoa_to_sheet(
    [
      ['ID', 'Texto', 'Número', 'Booleano', 'Fecha', 'Fórmula'],
      [
        'A-001',
        '  Alfa',
        12.5,
        true,
        new Date('2025-01-02T00:00:00.000Z'),
        null,
      ],
      ['A-002', 'Alfa ', 0, false, new Date('2025-01-03T00:00:00.000Z'), null],
      [
        'A-002',
        'A\u0301rbol',
        -3,
        true,
        new Date('2025-01-04T00:00:00.000Z'),
        null,
      ],
    ],
    { cellDates: true },
  );
  primary.F2 = { t: 'n', f: 'C2+C3', v: 12.5, z: '0.00' };
  primary.F3 = { t: 'e', v: 0x17, w: '#REF!' };
  primary['!ref'] = 'A1:H20';
  primary['!merges'] = [XLSX.utils.decode_range('A10:B10')];
  primary['!autofilter'] = { ref: 'A1:F4' };
  XLSX.utils.book_append_sheet(workbook, primary, 'Principal');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Catálogo'], ['Uno'], ['Dos']]),
    'Catálogo',
  );
  workbook.Workbook = {
    WBProps: { date1904: options?.date1904 ?? false },
  };
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    cellDates: true,
    compression: true,
  });
}
