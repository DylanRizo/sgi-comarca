import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { promisify } from 'node:util';

import { createDatabaseClient, type DatabaseClient } from '@sgi/database';

import { LegacyImporterError } from '../domain/errors.js';
import {
  assertTemporaryDatabase,
  installTemporaryDatabaseFingerprint,
  validatedDatabaseIdentifier,
  type TemporaryDatabaseFingerprint,
} from './temporary-database-guard.js';

const execFileAsync = promisify(execFile);

export interface ManagedTemporaryDatabase {
  client: DatabaseClient;
  databaseUrl: string;
  fingerprint: TemporaryDatabaseFingerprint;
  dispose(): Promise<void>;
}

function pnpmInvocation(arguments_: string[]): {
  executable: string;
  arguments: string[];
} {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript !== undefined) {
    return {
      executable: process.execPath,
      arguments: [pnpmScript, ...arguments_],
    };
  }
  return {
    executable: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    arguments: arguments_,
  };
}

async function runDatabaseCommand(
  repositoryRoot: string,
  databaseUrl: string,
  arguments_: string[],
  failureCode: string,
): Promise<void> {
  const invocation = pnpmInvocation(arguments_);
  try {
    await execFileAsync(invocation.executable, invocation.arguments, {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, CI: 'true' },
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    throw new LegacyImporterError(failureCode, 5);
  }
}

export async function createManagedTemporaryDatabase(
  repositoryRoot: string,
): Promise<ManagedTemporaryDatabase> {
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  if (configuredDatabaseUrl === undefined || configuredDatabaseUrl === '') {
    throw new LegacyImporterError('DATABASE_URL_REQUIRED', 2);
  }
  let source: URL;
  try {
    source = new URL(configuredDatabaseUrl);
  } catch {
    throw new LegacyImporterError('DATABASE_URL_INVALID', 2);
  }
  const administratorUrl = new URL(source);
  administratorUrl.pathname = '/postgres';
  administratorUrl.searchParams.delete('schema');
  const databaseName =
    `sgi_import_dry_run_${process.pid}_` +
    randomUUID().replaceAll('-', '').slice(0, 12);
  const fingerprint = {
    databaseName,
    nonce: randomBytes(16).toString('hex'),
  };
  const quotedName = validatedDatabaseIdentifier(databaseName);
  const databaseUrl = new URL(source);
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.searchParams.set('schema', 'public');
  const administrator = createDatabaseClient(administratorUrl.toString());
  let target: DatabaseClient | null = null;
  let created = false;
  try {
    await administrator.$executeRawUnsafe(`CREATE DATABASE ${quotedName}`);
    created = true;
    await installTemporaryDatabaseFingerprint(administrator, fingerprint);
    await runDatabaseCommand(
      repositoryRoot,
      databaseUrl.toString(),
      [
        '--filter',
        '@sgi/database',
        'exec',
        'prisma',
        'migrate',
        'deploy',
        '--config',
        'prisma.config.ts',
      ],
      'TEMP_DATABASE_MIGRATION_FAILED',
    );
    await runDatabaseCommand(
      repositoryRoot,
      databaseUrl.toString(),
      ['--filter', '@sgi/database', 'db:bootstrap'],
      'TEMP_DATABASE_BOOTSTRAP_FAILED',
    );
    target = createDatabaseClient(databaseUrl.toString());
    await assertTemporaryDatabase(target, fingerprint);
    const [warehouseCount, userCount, roleCount, permissionCount] =
      await Promise.all([
        target.warehouse.count(),
        target.user.count(),
        target.role.count(),
        target.permission.count(),
      ]);
    if (
      warehouseCount !== 3 ||
      userCount !== 4 ||
      roleCount !== 6 ||
      permissionCount !== 16
    ) {
      throw new LegacyImporterError('TEMP_DATABASE_BOOTSTRAP_INCOMPATIBLE', 5);
    }
    return {
      client: target,
      databaseUrl: databaseUrl.toString(),
      fingerprint,
      dispose: async () => {
        await target?.$disconnect();
        target = null;
        await administrator.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE)`,
        );
        await administrator.$disconnect();
      },
    };
  } catch (error) {
    await target?.$disconnect().catch(() => undefined);
    if (created) {
      await administrator
        .$executeRawUnsafe(`DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE)`)
        .catch(() => undefined);
    }
    await administrator.$disconnect().catch(() => undefined);
    if (error instanceof LegacyImporterError) throw error;
    throw new LegacyImporterError('TEMP_DATABASE_CREATION_FAILED', 5);
  }
}
