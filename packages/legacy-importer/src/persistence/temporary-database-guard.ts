import type { DatabaseClient } from '@sgi/database';

import { LegacyImporterError } from '../domain/errors.js';

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const MARKER_PREFIX = 'sgi-phase4a-dry-run:';

export interface TemporaryDatabaseFingerprint {
  databaseName: string;
  nonce: string;
}

function quoteIdentifier(value: string): string {
  if (!DATABASE_NAME.test(value)) {
    throw new LegacyImporterError('TEMP_DATABASE_NAME_INVALID', 5);
  }
  return `"${value}"`;
}

function marker(nonce: string): string {
  if (!NONCE.test(nonce)) {
    throw new LegacyImporterError('TEMP_DATABASE_NONCE_INVALID', 5);
  }
  return `${MARKER_PREFIX}${nonce}`;
}

export async function installTemporaryDatabaseFingerprint(
  administrator: DatabaseClient,
  fingerprint: TemporaryDatabaseFingerprint,
): Promise<void> {
  const name = quoteIdentifier(fingerprint.databaseName);
  const comment = marker(fingerprint.nonce);
  await administrator.$executeRawUnsafe(
    `COMMENT ON DATABASE ${name} IS '${comment}'`,
  );
}

export async function assertTemporaryDatabase(
  client: DatabaseClient,
  expected: TemporaryDatabaseFingerprint,
): Promise<void> {
  const rows = await client.$queryRawUnsafe<
    Array<{ database_name: string; marker: string | null }>
  >(
    "SELECT current_database() AS database_name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
  );
  const actual = rows[0];
  if (
    actual?.database_name !== expected.databaseName ||
    actual.marker !== marker(expected.nonce)
  ) {
    throw new LegacyImporterError('TEMP_DATABASE_GUARD_REJECTED', 5);
  }
}

export function validatedDatabaseIdentifier(value: string): string {
  return quoteIdentifier(value);
}
