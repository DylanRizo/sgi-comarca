import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readWorkbookBytes,
  readWorkbookFile,
} from '../src/xlsx/sheetjs-workbook-reader.js';
import { createSyntheticWorkbookBytes } from './fixtures/synthetic-workbooks.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('SheetJS workbook reader', () => {
  it('reads a multi-sheet workbook with public metadata and OOXML files', () => {
    const workbook = readWorkbookBytes(
      createSyntheticWorkbookBytes(),
      'synthetic-source',
    );
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'Principal',
      'Catálogo',
    ]);
    expect(workbook.sheets[0]).toMatchObject({
      physicalRange: 'A1:H20',
      autoFilter: 'A1:F4',
    });
    expect(workbook.sheets[0]?.merges).toContain('A10:B10');
    expect(
      workbook.sheets[0]?.cells.find((cell) => cell.address === 'F2'),
    ).toMatchObject({
      formula: 'C2+C3',
      cachedValue: 12.5,
      numberFormat: '0.00',
    });
  });

  it('preserves the workbook date system', () => {
    expect(
      readWorkbookBytes(
        createSyntheticWorkbookBytes({ date1904: true }),
        'synthetic-source',
      ).dateSystem,
    ).toBe('1904');
  });

  it('fails safely for corrupt input and cleans temporary workbooks', async () => {
    expect(() =>
      readWorkbookBytes(new Uint8Array([1, 2, 3]), 'synthetic-source'),
    ).toThrow(/OOXML_/u);
    const directory = await mkdtemp(path.join(tmpdir(), 'sgi-profiler-'));
    temporaryDirectories.push(directory);
    const input = path.join(directory, 'synthetic.xlsx');
    await writeFile(input, createSyntheticWorkbookBytes());
    const read = await readWorkbookFile(input, 'synthetic-source');
    expect(read.workbook.sheets).toHaveLength(2);
  });

  it('enforces configured workbook security limits', () => {
    const bytes = createSyntheticWorkbookBytes();
    expect(() =>
      readWorkbookBytes(bytes, 'synthetic-source', {
        maxWorkbookBytes: bytes.byteLength - 1,
        maxSheets: 64,
        maxRowsPerSheet: 100,
        maxColumnsPerSheet: 20,
        maxCells: 1000,
        maxArchiveParts: 4096,
        maxPartBytes: 16 * 1024 * 1024,
        maxXmlBytes: 8 * 1024 * 1024,
        maxTotalUncompressedBytes: 256 * 1024 * 1024,
        maxCompressionRatio: 200,
        maxFindings: 100,
      }),
    ).toThrow('WORKBOOK_SIZE_LIMIT_EXCEEDED');
  });
});
