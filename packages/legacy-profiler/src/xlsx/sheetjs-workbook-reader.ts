import { readFile, stat } from 'node:fs/promises';

import * as XLSX from 'xlsx';

import { DEFAULT_SECURITY_LIMITS } from '../config/sgi-legacy-inventory-profile.js';
import type {
  AppliedSecurityLimits,
  CellPhysicalType,
  NeutralCell,
  NeutralSheet,
  NeutralWorkbook,
} from '../domain/profile-types.js';
import { sha256Bytes } from '../domain/source-identity.js';
import {
  inspectOoxmlSheet,
  validateOoxmlArchive,
  type BookFilesWorkbook,
} from './ooxml-metadata-inspector.js';

type ExtendedWorkbook = XLSX.WorkBook &
  BookFilesWorkbook & {
    vbaraw?: Uint8Array;
    Workbook?: {
      WBProps?: { date1904?: boolean };
      Sheets?: Array<{ Hidden?: number }>;
      Names?: unknown[];
    };
  };

function physicalType(cell: XLSX.CellObject): CellPhysicalType {
  if (cell.v === undefined || cell.v === null) return 'blank';
  if (cell.t === 's') return 'string';
  if (cell.t === 'n') return 'number';
  if (cell.t === 'b') return 'boolean';
  if (cell.t === 'd') return 'date';
  if (cell.t === 'e') return 'error';
  return 'unknown';
}

function visibility(hidden: number | undefined): NeutralSheet['visibility'] {
  if (hidden === 2) return 'VERY_HIDDEN';
  if (hidden === 1) return 'HIDDEN';
  return 'VISIBLE';
}

function neutralCells(sheet: XLSX.WorkSheet): NeutralCell[] {
  return Object.keys(sheet)
    .filter((address) => !address.startsWith('!'))
    .map((address) => {
      const coordinates = XLSX.utils.decode_cell(address);
      const cell = sheet[address] as XLSX.CellObject;
      return {
        address,
        row: coordinates.r + 1,
        column: coordinates.c + 1,
        physicalType: physicalType(cell),
        value: cell.v,
        formattedText: cell.w,
        numberFormat: cell.z === undefined ? undefined : String(cell.z),
        formula: cell.f,
        cachedValue: cell.f === undefined ? undefined : cell.v,
      };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
}

function workbookIndicators(workbook: ExtendedWorkbook): {
  hasConnections: boolean;
  hasExternalLinks: boolean;
  hasPivotMetadata: boolean;
} {
  const names = Object.keys(workbook.files ?? {}).map((name) =>
    name.startsWith('/') ? name.slice(1) : name,
  );
  return {
    hasConnections: names.some((name) => name === 'xl/connections.xml'),
    hasExternalLinks: names.some((name) =>
      name.startsWith('xl/externalLinks/'),
    ),
    hasPivotMetadata: names.some(
      (name) =>
        name.startsWith('xl/pivotTables/') || name.startsWith('xl/pivotCache/'),
    ),
  };
}

export function readWorkbookBytes(
  bytes: Uint8Array,
  sourceCode: string,
  limits: AppliedSecurityLimits = DEFAULT_SECURITY_LIMITS,
): NeutralWorkbook {
  if (bytes.byteLength > limits.maxWorkbookBytes) {
    throw new Error('WORKBOOK_SIZE_LIMIT_EXCEEDED');
  }
  const archiveEntries = validateOoxmlArchive(bytes);
  if (archiveEntries.length > limits.maxArchiveParts) {
    throw new Error('WORKBOOK_PART_LIMIT_EXCEEDED');
  }
  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    bookFiles: true,
    bookVBA: true,
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    dense: false,
  }) as ExtendedWorkbook;
  if (workbook.SheetNames.length > limits.maxSheets) {
    throw new Error('WORKBOOK_SHEET_LIMIT_EXCEEDED');
  }
  const sheets = workbook.SheetNames.map((name, index): NeutralSheet => {
    const sheet = workbook.Sheets[name];
    if (sheet === undefined) throw new Error('WORKBOOK_SHEET_MISSING');
    const cells = neutralCells(sheet);
    if (cells.length > limits.maxCells)
      throw new Error('WORKBOOK_CELL_LIMIT_EXCEEDED');
    const maxRow = cells.at(-1)?.row ?? 0;
    const maxColumn = cells.reduce(
      (maximum, cell) => Math.max(maximum, cell.column),
      0,
    );
    if (
      maxRow > limits.maxRowsPerSheet ||
      maxColumn > limits.maxColumnsPerSheet
    ) {
      throw new Error('WORKBOOK_DIMENSION_LIMIT_EXCEEDED');
    }
    return {
      name,
      index,
      visibility: visibility(workbook.Workbook?.Sheets?.[index]?.Hidden),
      physicalRange: sheet['!ref'],
      cells,
      merges: (sheet['!merges'] ?? []).map((merge) =>
        XLSX.utils.encode_range(merge),
      ),
      autoFilter:
        typeof sheet['!autofilter']?.ref === 'string'
          ? sheet['!autofilter'].ref
          : undefined,
      ooxml: inspectOoxmlSheet(workbook, name),
    };
  });
  const totalCells = sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0);
  if (totalCells > limits.maxCells)
    throw new Error('WORKBOOK_CELL_LIMIT_EXCEEDED');
  return {
    sourceCode,
    sourceSha256: sha256Bytes(bytes),
    sizeBytes: bytes.byteLength,
    fileType: 'xlsx',
    dateSystem: workbook.Workbook?.WBProps?.date1904 === true ? '1904' : '1900',
    sheets,
    definedNames: workbook.Workbook?.Names?.length ?? 0,
    hasMacros: workbook.vbaraw !== undefined,
    ...workbookIndicators(workbook),
    securityLimits: limits,
  };
}

export async function readWorkbookFile(
  inputPath: string,
  sourceCode: string,
  limits: AppliedSecurityLimits = DEFAULT_SECURITY_LIMITS,
): Promise<{ bytes: Uint8Array; workbook: NeutralWorkbook }> {
  const metadata = await stat(inputPath);
  if (!metadata.isFile()) throw new Error('WORKBOOK_INPUT_NOT_FILE');
  const bytes = await readFile(inputPath);
  return { bytes, workbook: readWorkbookBytes(bytes, sourceCode, limits) };
}
