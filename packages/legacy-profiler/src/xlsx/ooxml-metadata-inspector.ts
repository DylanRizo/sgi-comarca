import { Buffer } from 'node:buffer';
import path from 'node:path';

import type { OoxmlSheetMetadata } from '../domain/profile-types.js';

export const OOXML_ARCHIVE_LIMITS = Object.freeze({
  maximumArchiveBytes: 32 * 1024 * 1024,
  maximumEntries: 4096,
  maximumPartBytes: 16 * 1024 * 1024,
  maximumTotalUncompressedBytes: 256 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlBytes: 8 * 1024 * 1024,
});

const ALLOWED_ROOTS = new Set(['_rels', 'customXml', 'docProps', 'xl']);
const EXTERNAL_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;

export interface BookFileEntry {
  content?: string | Uint8Array;
}

export interface BookFilesWorkbook {
  files?: Record<string, BookFileEntry | string | Uint8Array>;
}

interface ArchiveEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
}

function assertSafePartName(name: string): void {
  if (name === '[Content_Types].xml') return;
  if (
    name.length === 0 ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/u.test(name)
  ) {
    throw new Error('OOXML_UNSAFE_PART_PATH');
  }
  const segments = name.split('/');
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('OOXML_UNSAFE_PART_PATH');
  }
  if (!ALLOWED_ROOTS.has(segments[0] ?? '')) {
    throw new Error('OOXML_UNEXPECTED_PART_PATH');
  }
}

function validateArchiveEntries(entries: ArchiveEntry[]): void {
  if (entries.length > OOXML_ARCHIVE_LIMITS.maximumEntries) {
    throw new Error('OOXML_TOO_MANY_PARTS');
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    assertSafePartName(entry.name);
    if ((entry.flags & 0x1) !== 0) throw new Error('OOXML_ENCRYPTED_PART');
    if (entry.method !== 0 && entry.method !== 8) {
      throw new Error('OOXML_UNSUPPORTED_COMPRESSION');
    }
    if (entry.uncompressedSize > OOXML_ARCHIVE_LIMITS.maximumPartBytes) {
      throw new Error('OOXML_PART_TOO_LARGE');
    }
    const ratio =
      entry.compressedSize === 0
        ? entry.uncompressedSize === 0
          ? 1
          : Number.POSITIVE_INFINITY
        : entry.uncompressedSize / entry.compressedSize;
    if (ratio > OOXML_ARCHIVE_LIMITS.maximumCompressionRatio) {
      throw new Error('OOXML_COMPRESSION_RATIO_EXCEEDED');
    }
    totalUncompressed += entry.uncompressedSize;
  }
  if (totalUncompressed > OOXML_ARCHIVE_LIMITS.maximumTotalUncompressedBytes) {
    throw new Error('OOXML_TOTAL_SIZE_EXCEEDED');
  }
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const earliest = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('OOXML_INVALID_ZIP_END');
}

export function validateOoxmlArchive(input: Uint8Array): ArchiveEntry[] {
  const bytes = Buffer.from(input);
  if (bytes.length > OOXML_ARCHIVE_LIMITS.maximumArchiveBytes) {
    throw new Error('OOXML_ARCHIVE_TOO_LARGE');
  }
  const endOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('OOXML_MULTIDISK_NOT_SUPPORTED');
  }
  if (centralOffset + centralSize > endOffset) {
    throw new Error('OOXML_INVALID_CENTRAL_DIRECTORY');
  }
  const entries: ArchiveEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > bytes.length ||
      bytes.readUInt32LE(cursor) !== 0x02014b50
    ) {
      throw new Error('OOXML_INVALID_CENTRAL_ENTRY');
    }
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length || localOffset + 30 > bytes.length) {
      throw new Error('OOXML_INVALID_ENTRY_BOUNDS');
    }
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('OOXML_INVALID_LOCAL_ENTRY');
    }
    entries.push({
      name: bytes.subarray(nameStart, nameEnd).toString('utf8'),
      flags: bytes.readUInt16LE(cursor + 8),
      method: bytes.readUInt16LE(cursor + 10),
      compressedSize: bytes.readUInt32LE(cursor + 20),
      uncompressedSize: bytes.readUInt32LE(cursor + 24),
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw new Error('OOXML_CENTRAL_SIZE_MISMATCH');
  }
  validateArchiveEntries(entries);
  return entries;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9A-Fa-f]+);/gu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function parseAttributes(fragment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const match of fragment.matchAll(pattern)) {
    const key = match[1];
    if (key !== undefined) {
      attributes[key] = decodeXml(match[2] ?? match[3] ?? '');
    }
  }
  return attributes;
}

function scanOpenTags(
  xml: string,
  localName: string,
): Array<Record<string, string>> {
  const pattern = new RegExp(
    `<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\b([^>]*)>`,
    'gu',
  );
  return Array.from(xml.matchAll(pattern), (match) =>
    parseAttributes(match[1] ?? ''),
  );
}

function validateXml(xml: string): void {
  if (Buffer.byteLength(xml, 'utf8') > OOXML_ARCHIVE_LIMITS.maximumXmlBytes) {
    throw new Error('OOXML_XML_TOO_LARGE');
  }
  if (EXTERNAL_DECLARATION.test(xml)) {
    throw new Error('OOXML_EXTERNAL_DECLARATION_REJECTED');
  }
  if (xml.includes('\0')) throw new Error('OOXML_INVALID_XML_CONTENT');
}

function getBookFileText(
  workbook: BookFilesWorkbook,
  partName: string,
): string {
  assertSafePartName(partName);
  const files = workbook.files;
  if (files === undefined) throw new Error('OOXML_BOOK_FILES_UNAVAILABLE');
  const entry = files[partName] ?? files[`/${partName}`];
  if (entry === undefined) throw new Error(`OOXML_PART_NOT_FOUND:${partName}`);
  const content =
    typeof entry === 'object' &&
    entry !== null &&
    !ArrayBuffer.isView(entry) &&
    'content' in entry
      ? entry.content
      : entry;
  if (content === undefined) throw new Error('OOXML_PART_CONTENT_MISSING');
  const xml =
    typeof content === 'string'
      ? content
      : Buffer.from(content as Uint8Array).toString('utf8');
  validateXml(xml);
  return xml;
}

function relationshipsFor(
  workbook: BookFilesWorkbook,
  ownerPart: string,
  optional = false,
): Array<Record<string, string>> {
  const relationshipPart = path.posix.join(
    path.posix.dirname(ownerPart),
    '_rels',
    `${path.posix.basename(ownerPart)}.rels`,
  );
  const files = workbook.files;
  if (
    optional &&
    files !== undefined &&
    files[relationshipPart] === undefined &&
    files[`/${relationshipPart}`] === undefined
  ) {
    return [];
  }
  return scanOpenTags(
    getBookFileText(workbook, relationshipPart),
    'Relationship',
  );
}

function resolveTarget(ownerPart: string, target: string | undefined): string {
  if (target === undefined || target.startsWith('/') || target.includes('\\')) {
    throw new Error('OOXML_UNSAFE_RELATIONSHIP_TARGET');
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(ownerPart), target),
  );
  assertSafePartName(resolved);
  return resolved;
}

function worksheetPart(workbook: BookFilesWorkbook, sheetName: string): string {
  const workbookPart = 'xl/workbook.xml';
  const sheet = scanOpenTags(
    getBookFileText(workbook, workbookPart),
    'sheet',
  ).find((attributes) => attributes.name === sheetName);
  const relation = relationshipsFor(workbook, workbookPart).find(
    (item) => item.Id === sheet?.['r:id'],
  );
  if (sheet === undefined || relation?.TargetMode === 'External') {
    throw new Error('OOXML_WORKSHEET_RELATIONSHIP_INVALID');
  }
  return resolveTarget(workbookPart, relation?.Target);
}

export function inspectOoxmlSheet(
  workbook: BookFilesWorkbook,
  sheetName: string,
): OoxmlSheetMetadata {
  const part = worksheetPart(workbook, sheetName);
  const xml = getBookFileText(workbook, part);
  const dimension = scanOpenTags(xml, 'dimension')[0]?.ref;
  const formulas: OoxmlSheetMetadata['formulas'] = [];
  const cellPattern =
    /<(?:(?:[A-Za-z_][\w.-]*):)?c\b([^>]*)>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?c\s*>/gu;
  const formulaPattern =
    /<(?:(?:[A-Za-z_][\w.-]*):)?f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?f\s*>)/u;
  const cachedPattern = /<(?:(?:[A-Za-z_][\w.-]*):)?v(?:\s[^>]*)?>/u;
  for (const cellMatch of xml.matchAll(cellPattern)) {
    const formulaMatch = (cellMatch[2] ?? '').match(formulaPattern);
    if (formulaMatch === null) continue;
    const cellAttributes = parseAttributes(cellMatch[1] ?? '');
    const formulaAttributes = parseAttributes(formulaMatch[1] ?? '');
    formulas.push({
      address: cellAttributes.r ?? '',
      type: formulaAttributes.t,
      reference: formulaAttributes.ref,
      sharedIndex: formulaAttributes.si,
      hasCachedValue: cachedPattern.test(cellMatch[2] ?? ''),
    });
  }
  const tableRelationIds = scanOpenTags(xml, 'tablePart')
    .map((attributes) => attributes['r:id'])
    .filter((id): id is string => id !== undefined);
  const relations = relationshipsFor(workbook, part, true);
  const tableNames = tableRelationIds.map((id) => {
    const relation = relations.find((item) => item.Id === id);
    if (
      relation === undefined ||
      relation.TargetMode === 'External' ||
      !relation.Type?.endsWith('/table')
    ) {
      throw new Error('OOXML_TABLE_RELATIONSHIP_INVALID');
    }
    const table = scanOpenTags(
      getBookFileText(workbook, resolveTarget(part, relation.Target)),
      'table',
    )[0];
    if (table === undefined) throw new Error('OOXML_TABLE_DEFINITION_MISSING');
    return table.displayName ?? table.name ?? 'unnamed-table';
  });
  return {
    dimension,
    dimensionMissing: dimension === undefined,
    formulas,
    sharedFormulaDefinitionCount: formulas.filter(
      (formula) => formula.type === 'shared' && formula.reference !== undefined,
    ).length,
    tablePartCount: tableRelationIds.length,
    tableNames: tableNames.sort((left, right) =>
      left.localeCompare(right, 'en'),
    ),
    relationships: relations
      .map((relation) => relation.Type ?? '')
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'en')),
  };
}
