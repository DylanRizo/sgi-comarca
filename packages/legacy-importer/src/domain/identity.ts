import { createHash } from 'node:crypto';

import { canonicalFingerprint } from '@sgi/legacy-profiler';

import type { RawRowEnvelope } from './import-types.js';

function uuidFromHex(hex: string): string {
  const characters = hex.slice(0, 32).split('');
  characters[12] = '8';
  const variant = Number.parseInt(characters[16] ?? '0', 16);
  characters[16] = ((variant & 0x3) | 0x8).toString(16);
  const compact = characters.join('');
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20, 32),
  ].join('-');
}

export function deterministicUuid(namespace: string, value: unknown): string {
  const hash = createHash('sha256')
    .update(namespace, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalFingerprint(value), 'utf8')
    .digest('hex');
  return uuidFromHex(hash);
}

export function rowFingerprint(row: RawRowEnvelope): string {
  return canonicalFingerprint({
    profileSchemaVersion: row.schemaVersion,
    sourceCode: row.sourceCode,
    sourceSha256: row.sourceSha256,
    sheet: row.sheet,
    sheetIndex: row.sheetIndex,
    physicalRow: row.physicalRow,
    cells: row.cells,
  });
}

export function advisoryLockKey(batchKey: string): bigint {
  const unsigned = BigInt(`0x${batchKey.slice(0, 16)}`);
  const maxSigned = 0x7fffffffffffffffn;
  return unsigned > maxSigned ? unsigned - 0x10000000000000000n : unsigned;
}
