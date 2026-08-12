import type { DatabaseClient } from '@sgi/database';

import { LegacyImporterError } from '../domain/errors.js';
import { validatedDatabaseIdentifier } from './temporary-database-guard.js';

const NONCE = /^[a-f0-9]{32}$/u;
const PREFIX = 'sgi-phase4c1-persistent-simulation:';

export interface PersistentSimulationFingerprint {
  databaseName: string;
  nonce: string;
}

export async function installPersistentSimulationFingerprint(
  administrator: Pick<DatabaseClient, '$executeRawUnsafe'>,
  fingerprint: PersistentSimulationFingerprint,
): Promise<void> {
  if (!NONCE.test(fingerprint.nonce)) {
    throw new LegacyImporterError('COMMIT_SIMULATION_NONCE_INVALID', 5);
  }
  const databaseName = validatedDatabaseIdentifier(fingerprint.databaseName);
  await administrator.$executeRawUnsafe(
    `COMMENT ON DATABASE ${databaseName} IS '${PREFIX}${fingerprint.nonce}'`,
  );
}

export async function assertPersistentSimulationTarget(
  client: Pick<DatabaseClient, '$queryRawUnsafe'>,
  expected: PersistentSimulationFingerprint,
): Promise<void> {
  if (!NONCE.test(expected.nonce)) {
    throw new LegacyImporterError('COMMIT_SIMULATION_NONCE_INVALID', 5);
  }
  const rows = await client.$queryRawUnsafe<
    Array<{ database_name: string; marker: string | null }>
  >(
    `SELECT current_database() AS database_name,
            shobj_description(oid, 'pg_database') AS marker
       FROM pg_database
      WHERE datname = current_database()`,
  );
  if (
    rows[0]?.database_name !== expected.databaseName ||
    rows[0]?.marker !== `${PREFIX}${expected.nonce}`
  ) {
    throw new LegacyImporterError('COMMIT_SIMULATION_GUARD_REJECTED', 5);
  }
}
