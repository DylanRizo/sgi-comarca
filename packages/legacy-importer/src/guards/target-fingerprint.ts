import { canonicalFingerprint } from '@sgi/legacy-profiler';
import type { DatabaseClient } from '@sgi/database';

import { LegacyImporterError } from '../domain/errors.js';

const ENVIRONMENT_NAME = /^[a-z][a-z0-9_-]{1,63}$/u;

export interface TargetDatabaseIdentity {
  targetEnvironment: string;
  databaseName: string;
  serverAddress: string;
  serverPort: number;
  serverVersion: string;
  migrationStateSha256: string;
  warehouseIdentitySha256: string;
  fingerprint: string;
}

export async function readTargetDatabaseIdentity(
  client: Pick<DatabaseClient, '$queryRawUnsafe' | 'warehouse'>,
  targetEnvironment: string,
): Promise<TargetDatabaseIdentity> {
  if (!ENVIRONMENT_NAME.test(targetEnvironment)) {
    throw new LegacyImporterError('TARGET_ENVIRONMENT_INVALID', 2);
  }
  const databaseRows = await client.$queryRawUnsafe<
    Array<{
      database_name: string;
      server_address: string;
      server_port: number;
      server_version: string;
    }>
  >(`SELECT current_database() AS database_name,
            COALESCE(inet_server_addr()::text, 'local') AS server_address,
            inet_server_port() AS server_port,
            current_setting('server_version_num') AS server_version`);
  const database = databaseRows[0];
  if (database === undefined) {
    throw new LegacyImporterError('TARGET_FINGERPRINT_UNAVAILABLE', 4);
  }
  const migrations = await client.$queryRawUnsafe<
    Array<{ migration_name: string; checksum: string }>
  >(`SELECT migration_name, checksum
       FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name`);
  const warehouses = await client.warehouse.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, active: true },
  });
  const migrationStateSha256 = canonicalFingerprint(migrations);
  const warehouseIdentitySha256 = canonicalFingerprint(warehouses);
  const stableIdentity = {
    targetEnvironment,
    databaseName: database.database_name,
    serverAddress: database.server_address,
    serverPort: database.server_port,
    serverVersion: database.server_version,
    migrationStateSha256,
    warehouseIdentitySha256,
  };
  return {
    ...stableIdentity,
    fingerprint: canonicalFingerprint(stableIdentity),
  };
}

export function assertExpectedTargetFingerprint(
  actual: TargetDatabaseIdentity,
  expected: string,
): void {
  if (!/^[a-f0-9]{64}$/u.test(expected) || actual.fingerprint !== expected) {
    throw new LegacyImporterError('TARGET_FINGERPRINT_MISMATCH', 4);
  }
}
