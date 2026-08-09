import * as XLSX from 'xlsx';

import type {
  ColumnProfile,
  NeutralCell,
  NeutralSheet,
} from '../domain/profile-types.js';

const NUMERIC_TEXT = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u;
const BOOLEAN_TEXT = /^(?:true|false|sí|si|no|yes)$/iu;
const SUSPICIOUS_UNICODE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/u;

export function normalizeComparable(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('es-NI')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

export function normalizeHeaderCandidate(value: string): string {
  return normalizeComparable(value).replaceAll(' ', '_');
}

function isBlank(cell: NeutralCell | undefined): boolean {
  return (
    cell === undefined ||
    cell.value === null ||
    cell.value === undefined ||
    (typeof cell.value === 'string' && cell.value.length === 0)
  );
}

function stableValueKey(cell: NeutralCell): string {
  const value = cell.value;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  return `${cell.physicalType}:${String(value)}`;
}

function apparentType(cell: NeutralCell): string {
  if (cell.value instanceof Date || cell.physicalType === 'date') return 'date';
  if (cell.physicalType === 'number') return 'number';
  if (cell.physicalType === 'boolean') return 'boolean';
  if (cell.physicalType === 'error') return 'excel_error';
  if (typeof cell.value === 'string') {
    if (NUMERIC_TEXT.test(cell.value)) return 'numeric_text';
    if (BOOLEAN_TEXT.test(cell.value)) return 'boolean_text';
    if (!Number.isNaN(Date.parse(cell.value)) && /[-/]/u.test(cell.value)) {
      return 'date_text';
    }
    return 'text';
  }
  return 'unknown';
}

function decimalPlaces(value: number): number {
  const text = value.toString();
  const exponent = /e-(\d+)$/iu.exec(text)?.[1];
  if (exponent !== undefined) return Number(exponent);
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

function hasSuspiciousUnicode(value: string): boolean {
  return (
    SUSPICIOUS_UNICODE.test(value) ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code === 0x7f ||
        (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      );
    })
  );
}

function earlierIso(current: string | null, candidate: string): string {
  return current === null || candidate.localeCompare(current, 'en') < 0
    ? candidate
    : current;
}

function laterIso(current: string | null, candidate: string): string {
  return current === null || candidate.localeCompare(current, 'en') > 0
    ? candidate
    : current;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function profileColumn(
  sheet: NeutralSheet,
  column: number,
  headerRow: number,
  lastDataRow: number,
): ColumnProfile {
  const headerCell = sheet.cells.find(
    (cell) => cell.row === headerRow && cell.column === column,
  );
  const headerOriginal =
    headerCell?.value === undefined || headerCell.value === null
      ? null
      : String(headerCell.value);
  const cellsByRow = new Map(
    sheet.cells
      .filter(
        (cell) =>
          cell.column === column &&
          cell.row > headerRow &&
          cell.row <= lastDataRow,
      )
      .map((cell) => [cell.row, cell]),
  );
  const rowCount = Math.max(0, lastDataRow - headerRow);
  let nullCount = 0;
  let blankCount = 0;
  let minLength: number | null = null;
  let maxLength: number | null = null;
  let numericMin: number | null = null;
  let numericMax: number | null = null;
  let decimalScale: number | null = null;
  let negativeCount = 0;
  let dateMin: string | null = null;
  let dateMax: string | null = null;
  let booleanLikeCount = 0;
  let excelErrorCount = 0;
  let formulaCount = 0;
  let cachedFormulaValueCount = 0;
  let leadingWhitespaceCount = 0;
  let trailingWhitespaceCount = 0;
  let nonNfcCount = 0;
  let suspiciousUnicodeCount = 0;
  let numericStoredAsTextCount = 0;
  let textStoredAsNumberCandidateCount = 0;
  const distinct = new Set<string>();
  const physicalTypes: Record<string, number> = {};
  const apparentTypes: Record<string, number> = {};
  const casing = new Map<string, Set<string>>();

  for (let row = headerRow + 1; row <= lastDataRow; row += 1) {
    const cell = cellsByRow.get(row);
    if (cell === undefined || cell.value === null || cell.value === undefined) {
      nullCount += 1;
      continue;
    }
    if (typeof cell.value === 'string' && cell.value.length === 0) {
      blankCount += 1;
      continue;
    }
    distinct.add(stableValueKey(cell));
    increment(physicalTypes, cell.physicalType);
    const inferred = apparentType(cell);
    increment(apparentTypes, inferred);
    if (cell.formula !== undefined) {
      formulaCount += 1;
      if (cell.cachedValue !== undefined) cachedFormulaValueCount += 1;
    }
    if (cell.physicalType === 'error') excelErrorCount += 1;
    if (cell.value instanceof Date) {
      const iso = cell.value.toISOString();
      dateMin = earlierIso(dateMin, iso);
      dateMax = laterIso(dateMax, iso);
    } else if (typeof cell.value === 'number') {
      numericMin =
        numericMin === null ? cell.value : Math.min(numericMin, cell.value);
      numericMax =
        numericMax === null ? cell.value : Math.max(numericMax, cell.value);
      decimalScale = Math.max(decimalScale ?? 0, decimalPlaces(cell.value));
      if (cell.value < 0) negativeCount += 1;
      if (
        /^(?:id|c[oó]digo|nombre|descripci[oó]n|unidad|grupo)/iu.test(
          headerOriginal ?? '',
        )
      ) {
        textStoredAsNumberCandidateCount += 1;
      }
    } else if (typeof cell.value === 'string') {
      const length = Array.from(cell.value).length;
      minLength = minLength === null ? length : Math.min(minLength, length);
      maxLength = maxLength === null ? length : Math.max(maxLength, length);
      if (cell.value !== cell.value.trimStart()) leadingWhitespaceCount += 1;
      if (cell.value !== cell.value.trimEnd()) trailingWhitespaceCount += 1;
      if (cell.value !== cell.value.normalize('NFC')) nonNfcCount += 1;
      if (hasSuspiciousUnicode(cell.value)) suspiciousUnicodeCount += 1;
      if (NUMERIC_TEXT.test(cell.value)) numericStoredAsTextCount += 1;
      if (BOOLEAN_TEXT.test(cell.value)) booleanLikeCount += 1;
      const comparable = normalizeComparable(cell.value);
      const variants = casing.get(comparable) ?? new Set<string>();
      variants.add(cell.value.normalize('NFC'));
      casing.set(comparable, variants);
    } else if (typeof cell.value === 'boolean') {
      booleanLikeCount += 1;
    }
  }

  const populatedCount = rowCount - nullCount - blankCount;
  const duplicateCount = Math.max(0, populatedCount - distinct.size);
  const casingVariantCount = Array.from(casing.values()).reduce(
    (sum, variants) => sum + Math.max(0, variants.size - 1),
    0,
  );
  const identifierSignals: string[] = [];
  if (/\b(?:id|c[oó]digo|code)\b/iu.test(headerOriginal ?? '')) {
    identifierSignals.push('HEADER_IDENTIFIER_LIKE');
  }
  if (populatedCount > 0 && distinct.size / populatedCount >= 0.98) {
    identifierSignals.push('HIGH_CARDINALITY');
  }
  if (numericStoredAsTextCount > 0)
    identifierSignals.push('TEXT_NUMERIC_PATTERN');

  return {
    columnIndex: column,
    columnLetter: XLSX.utils.encode_col(column - 1),
    headerOriginal,
    headerNormalizedCandidate:
      headerOriginal === null ? null : normalizeHeaderCandidate(headerOriginal),
    rowCount,
    nullCount,
    blankCount,
    completionRate:
      rowCount === 0 ? 0 : Number((populatedCount / rowCount).toFixed(6)),
    distinctCount: distinct.size,
    duplicateCount,
    physicalTypes,
    apparentTypes,
    mixedType: Object.keys(apparentTypes).length > 1,
    minLength,
    maxLength,
    numericMin,
    numericMax,
    decimalScale,
    negativeCount,
    dateMin,
    dateMax,
    booleanLikeCount,
    excelErrorCount,
    formulaCount,
    cachedFormulaValueCount,
    leadingWhitespaceCount,
    trailingWhitespaceCount,
    casingVariantCount,
    nonNfcCount,
    suspiciousUnicodeCount,
    numericStoredAsTextCount,
    textStoredAsNumberCandidateCount,
    candidateIdentifierSignals: identifierSignals.sort(),
  };
}

export function profileColumns(
  sheet: NeutralSheet,
  headerRow: number,
  lastDataRow: number,
  columnCount: number,
): ColumnProfile[] {
  return Array.from({ length: columnCount }, (_, index) =>
    profileColumn(sheet, index + 1, headerRow, lastDataRow),
  );
}

export function cellHasData(cell: NeutralCell | undefined): boolean {
  return !isBlank(cell) || cell?.formula !== undefined;
}
