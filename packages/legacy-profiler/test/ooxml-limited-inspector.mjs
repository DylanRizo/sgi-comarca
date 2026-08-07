import { Buffer } from 'node:buffer';
import path from 'node:path';

export const ARCHIVE_LIMITS = Object.freeze({
  maximumArchiveBytes: 32 * 1024 * 1024,
  maximumEntries: 4096,
  maximumPartBytes: 16 * 1024 * 1024,
  maximumTotalUncompressedBytes: 256 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlBytes: 8 * 1024 * 1024,
});

const ALLOWED_ROOTS = new Set(['_rels', 'customXml', 'docProps', 'xl']);
const XML_DECLARATION_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;

function assertSafePartName(name) {
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
  if (!ALLOWED_ROOTS.has(segments[0])) {
    throw new Error('OOXML_UNEXPECTED_PART_PATH');
  }
}

export function validateArchiveEntryPolicy(entries) {
  if (entries.length > ARCHIVE_LIMITS.maximumEntries) {
    throw new Error('OOXML_TOO_MANY_PARTS');
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    assertSafePartName(entry.name);
    if ((entry.flags & 0x1) !== 0) throw new Error('OOXML_ENCRYPTED_PART');
    if (entry.method !== 0 && entry.method !== 8)
      throw new Error('OOXML_UNSUPPORTED_COMPRESSION');
    if (entry.uncompressedSize > ARCHIVE_LIMITS.maximumPartBytes) {
      throw new Error('OOXML_PART_TOO_LARGE');
    }

    const ratio =
      entry.compressedSize === 0
        ? entry.uncompressedSize === 0
          ? 1
          : Infinity
        : entry.uncompressedSize / entry.compressedSize;
    if (ratio > ARCHIVE_LIMITS.maximumCompressionRatio) {
      throw new Error('OOXML_COMPRESSION_RATIO_EXCEEDED');
    }
    totalUncompressed += entry.uncompressedSize;
  }

  if (totalUncompressed > ARCHIVE_LIMITS.maximumTotalUncompressedBytes) {
    throw new Error('OOXML_TOTAL_SIZE_EXCEEDED');
  }
}

function findEndOfCentralDirectory(bytes) {
  const earliest = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('OOXML_INVALID_ZIP_END');
}

export function validateOoxmlArchive(input) {
  const bytes = Buffer.from(input);
  if (bytes.length > ARCHIVE_LIMITS.maximumArchiveBytes) {
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
  if (centralOffset + centralSize > endOffset)
    throw new Error('OOXML_INVALID_CENTRAL_DIRECTORY');

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > bytes.length ||
      bytes.readUInt32LE(cursor) !== 0x02014b50
    ) {
      throw new Error('OOXML_INVALID_CENTRAL_ENTRY');
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
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
    const name = bytes.subarray(nameStart, nameEnd).toString('utf8');
    entries.push({ name, flags, method, compressedSize, uncompressedSize });
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize)
    throw new Error('OOXML_CENTRAL_SIZE_MISMATCH');

  validateArchiveEntryPolicy(entries);
  return entries;
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9A-Fa-f]+);/gu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function parseAttributes(fragment) {
  const attributes = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const match of fragment.matchAll(pattern)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function scanOpenTags(xml, localName) {
  const pattern = new RegExp(
    `<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\b([^>]*)>`,
    'gu',
  );
  return Array.from(xml.matchAll(pattern), (match) =>
    parseAttributes(match[1]),
  );
}

export function validateXmlPart(xml) {
  if (Buffer.byteLength(xml, 'utf8') > ARCHIVE_LIMITS.maximumXmlBytes) {
    throw new Error('OOXML_XML_TOO_LARGE');
  }
  if (XML_DECLARATION_PATTERN.test(xml))
    throw new Error('OOXML_EXTERNAL_DECLARATION_REJECTED');
  if (xml.includes('\0')) throw new Error('OOXML_INVALID_XML_CONTENT');
}

export function getBookFileText(workbook, partName) {
  assertSafePartName(partName);
  const files = workbook.files;
  if (files === null || typeof files !== 'object')
    throw new Error('OOXML_BOOK_FILES_UNAVAILABLE');
  const entry = files[partName] ?? files[`/${partName}`];
  if (entry === undefined) throw new Error(`OOXML_PART_NOT_FOUND:${partName}`);
  const content =
    typeof entry === 'object' && entry !== null && 'content' in entry
      ? entry.content
      : entry;
  const xml =
    typeof content === 'string'
      ? content
      : Buffer.from(content).toString('utf8');
  validateXmlPart(xml);
  return xml;
}

export function inspectWorksheetXml(xml) {
  validateXmlPart(xml);
  const dimension = scanOpenTags(xml, 'dimension')[0]?.ref ?? null;

  const formulas = [];
  const cellPattern =
    /<(?:(?:[A-Za-z_][\w.-]*):)?c\b([^>]*)>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?c\s*>/gu;
  const formulaPattern =
    /<(?:(?:[A-Za-z_][\w.-]*):)?f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?f\s*>)/u;
  const cachedValuePattern = /<(?:(?:[A-Za-z_][\w.-]*):)?v(?:\s[^>]*)?>/u;
  for (const cellMatch of xml.matchAll(cellPattern)) {
    const formulaMatch = cellMatch[2].match(formulaPattern);
    if (formulaMatch === null) continue;
    const cellAttributes = parseAttributes(cellMatch[1]);
    formulas.push({
      cell: cellAttributes.r,
      attributes: parseAttributes(formulaMatch[1]),
      hasCachedValue: cachedValuePattern.test(cellMatch[2]),
    });
  }

  const tableParts = scanOpenTags(xml, 'tablePart').map(
    (attributes) => attributes['r:id'],
  );
  return { dimension, formulas, tableParts };
}

function relationshipsFor(workbook, ownerPart) {
  const relationshipPart = path.posix.join(
    path.posix.dirname(ownerPart),
    '_rels',
    `${path.posix.basename(ownerPart)}.rels`,
  );
  const xml = getBookFileText(workbook, relationshipPart);
  return scanOpenTags(xml, 'Relationship').map((attributes) => ({
    id: attributes.Id,
    target: attributes.Target,
    targetMode: attributes.TargetMode,
    type: attributes.Type,
  }));
}

function resolveRelationshipTarget(ownerPart, target) {
  if (target === undefined || target.startsWith('/') || target.includes('\\')) {
    throw new Error('OOXML_UNSAFE_RELATIONSHIP_TARGET');
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(ownerPart), target),
  );
  assertSafePartName(resolved);
  return resolved;
}

export function resolveWorksheetPart(workbook, sheetName) {
  const workbookPart = 'xl/workbook.xml';
  const workbookXml = getBookFileText(workbook, workbookPart);
  const sheet = scanOpenTags(workbookXml, 'sheet').find(
    (attributes) => attributes.name === sheetName,
  );
  if (sheet === undefined) throw new Error('OOXML_SHEET_NOT_FOUND');
  const relationship = relationshipsFor(workbook, workbookPart).find(
    (item) => item.id === sheet['r:id'],
  );
  if (relationship === undefined || relationship.targetMode === 'External') {
    throw new Error('OOXML_WORKSHEET_RELATIONSHIP_INVALID');
  }
  return resolveRelationshipTarget(workbookPart, relationship.target);
}

export function inspectWorksheetBookPart(workbook, sheetName) {
  const sheetPart = resolveWorksheetPart(workbook, sheetName);
  const worksheet = inspectWorksheetXml(getBookFileText(workbook, sheetPart));
  const relationships = relationshipsFor(workbook, sheetPart);
  const tables = worksheet.tableParts.map((relationshipId) => {
    const relationship = relationships.find(
      (item) => item.id === relationshipId,
    );
    if (
      relationship === undefined ||
      relationship.targetMode === 'External' ||
      !relationship.type?.endsWith('/table')
    ) {
      throw new Error('OOXML_TABLE_RELATIONSHIP_INVALID');
    }
    const tablePart = resolveRelationshipTarget(sheetPart, relationship.target);
    const tableXml = getBookFileText(workbook, tablePart);
    const table = scanOpenTags(tableXml, 'table')[0];
    const autoFilter = scanOpenTags(tableXml, 'autoFilter')[0];
    const tableColumns = scanOpenTags(tableXml, 'tableColumn');
    if (table === undefined) throw new Error('OOXML_TABLE_DEFINITION_MISSING');
    return {
      part: tablePart,
      name: table.name,
      displayName: table.displayName,
      ref: table.ref,
      autoFilterRef: autoFilter?.ref,
      columnCount: tableColumns.length,
    };
  });
  return { sheetPart, ...worksheet, tables };
}

export function validateBookFiles(workbook) {
  const files = workbook.files;
  if (files === null || typeof files !== 'object')
    throw new Error('OOXML_BOOK_FILES_UNAVAILABLE');
  const parts = Object.keys(files).filter(
    (name) => name !== '' && !name.startsWith('\u0001') && !name.endsWith('/'),
  );
  if (parts.length > ARCHIVE_LIMITS.maximumEntries)
    throw new Error('OOXML_TOO_MANY_PARTS');
  for (const name of parts)
    assertSafePartName(name.startsWith('/') ? name.slice(1) : name);
  return parts.length;
}
