import * as XLSX from 'xlsx';

import { getSheetConfig } from '../config/sgi-legacy-inventory-profile.js';
import {
  PROFILE_SCHEMA_VERSION,
  type NeutralCell,
  type NeutralSheet,
  type NeutralWorkbook,
  type SheetProfile,
  type WorkbookProfile,
} from '../domain/profile-types.js';
import {
  cellHasData,
  normalizeHeaderCandidate,
  profileColumns,
} from './column-profiler.js';

export const PROFILER_VERSION = '1.0.0';

function rangeDimensions(range: string | undefined): {
  rows: number;
  columns: number;
} {
  if (range === undefined) return { rows: 0, columns: 0 };
  const decoded = XLSX.utils.decode_range(range);
  return {
    rows: decoded.e.r - decoded.s.r + 1,
    columns: decoded.e.c - decoded.s.c + 1,
  };
}

function meaningfulCells(sheet: NeutralSheet): NeutralCell[] {
  return sheet.cells.filter((cell) => cellHasData(cell));
}

function contiguousBands(rows: number[], columnCount: number): string[] {
  if (rows.length === 0 || columnCount === 0) return [];
  const unique = [...new Set(rows)].sort((left, right) => left - right);
  const bands: string[] = [];
  let start = unique[0] ?? 1;
  let previous = start;
  for (const row of unique.slice(1)) {
    if (row !== previous + 1) {
      bands.push(
        `A${start}:${XLSX.utils.encode_col(columnCount - 1)}${previous}`,
      );
      start = row;
    }
    previous = row;
  }
  bands.push(`A${start}:${XLSX.utils.encode_col(columnCount - 1)}${previous}`);
  return bands;
}

function profileSheet(sheet: NeutralSheet): SheetProfile {
  const config = getSheetConfig(sheet.name);
  const headerRow = config?.headerRow ?? 1;
  const populated = meaningfulCells(sheet);
  const lastDataRow = populated.reduce(
    (maximum, cell) => Math.max(maximum, cell.row),
    headerRow,
  );
  const inferredColumns = populated.reduce(
    (maximum, cell) => Math.max(maximum, cell.column),
    0,
  );
  const columnCount = Math.max(
    config?.expectedHeaders.length ?? 0,
    inferredColumns,
  );
  const profileColumnsResult = profileColumns(
    sheet,
    headerRow,
    lastDataRow,
    columnCount,
  );
  const headerValues = profileColumnsResult.map(
    (column) => column.headerOriginal,
  );
  const normalizedHeaders = headerValues
    .filter((header): header is string => header !== null && header.length > 0)
    .map(normalizeHeaderCandidate);
  const duplicates = [
    ...new Set(
      normalizedHeaders.filter(
        (header, index) => normalizedHeaders.indexOf(header) !== index,
      ),
    ),
  ].sort();
  const physical = rangeDimensions(sheet.physicalRange);
  const logicalDataRange =
    columnCount === 0
      ? null
      : `A${headerRow}:${XLSX.utils.encode_col(columnCount - 1)}${lastDataRow}`;
  const formulaCellCount = sheet.cells.filter(
    (cell) => cell.formula !== undefined,
  ).length;
  const cachedFormulaValueCount = sheet.ooxml.formulas.filter(
    (formula) => formula.hasCachedValue,
  ).length;
  const formulaDefinitionCount = sheet.ooxml.formulas.filter(
    (formula) => formula.type !== 'shared' || formula.reference !== undefined,
  ).length;
  return {
    name: sheet.name,
    index: sheet.index,
    visibility: sheet.visibility,
    physicalRange: sheet.physicalRange ?? null,
    logicalDataRange,
    physicalRows: physical.rows,
    dataRows: Math.max(0, lastDataRow - headerRow),
    formattedEmptyRows: Math.max(
      0,
      physical.rows - (lastDataRow - headerRow + 1),
    ),
    physicalColumns: physical.columns,
    dataColumns: columnCount,
    contiguousBands: contiguousBands(
      populated.map((cell) => cell.row),
      columnCount,
    ),
    headerDetected: headerValues.some((header) => header !== null),
    headerRow,
    emptyHeaderCount: headerValues.filter(
      (header) => header === null || header.length === 0,
    ).length,
    duplicateHeaders: duplicates,
    autoFilter: sheet.autoFilter ?? null,
    tableCount: sheet.ooxml.tablePartCount,
    tableNames: sheet.ooxml.tableNames,
    mergeCount: sheet.merges.length,
    formulaCellCount,
    formulaDefinitionCount,
    sharedFormulaDefinitionCount: sheet.ooxml.sharedFormulaDefinitionCount,
    cachedFormulaValueCount,
    fullyEmptyColumns: profileColumnsResult
      .filter((column) => column.completionRate === 0)
      .map((column) => column.columnLetter),
    columns: profileColumnsResult,
  };
}

export function profileWorkbook(workbook: NeutralWorkbook): WorkbookProfile {
  const sheets = workbook.sheets.map(profileSheet);
  return {
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profilerVersion: PROFILER_VERSION,
    sourceCode: workbook.sourceCode,
    sourceSha256: workbook.sourceSha256,
    sizeBytes: workbook.sizeBytes,
    fileType: workbook.fileType,
    dateSystem: workbook.dateSystem,
    sheetCount: sheets.length,
    visibleSheetCount: sheets.filter((sheet) => sheet.visibility === 'VISIBLE')
      .length,
    hiddenSheetCount: sheets.filter((sheet) => sheet.visibility !== 'VISIBLE')
      .length,
    definedNameCount: workbook.definedNames,
    hasMacros: workbook.hasMacros,
    hasConnections: workbook.hasConnections,
    hasExternalLinks: workbook.hasExternalLinks,
    hasPivotMetadata: workbook.hasPivotMetadata,
    securityLimits: workbook.securityLimits,
    sheets,
  };
}
