import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

const execFileAsync = promisify(execFile);
const localDevelopmentUrl =
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';

function quoteDatabaseName(databaseName: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error('Unsafe temporary database name.');
  }

  return '"' + databaseName + '"';
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(new URL('../', import.meta.url));
  const prismaCli = fileURLToPath(
    new URL('../node_modules/prisma/build/index.js', import.meta.url),
  );
  const prismaConfig = fileURLToPath(
    new URL('../prisma.config.ts', import.meta.url),
  );

  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', prismaConfig],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const sourceUrl = new URL(process.env.DATABASE_URL ?? localDevelopmentUrl);
  const databaseName =
    'sgi_integration_' +
    process.pid.toString() +
    '_' +
    randomUUID().replaceAll('-', '').slice(0, 12);
  const quotedDatabaseName = quoteDatabaseName(databaseName);

  const administratorUrl = new URL(sourceUrl);
  administratorUrl.pathname = '/postgres';
  administratorUrl.searchParams.delete('schema');

  const databaseUrl = new URL(sourceUrl);
  databaseUrl.pathname = '/' + databaseName;
  databaseUrl.searchParams.set('schema', 'public');

  const administrator = new Client({
    connectionString: administratorUrl.toString(),
  });
  await administrator.connect();

  try {
    await administrator.query('CREATE DATABASE ' + quotedDatabaseName);
    await migrateDatabase(databaseUrl.toString());
  } catch (error) {
    await administrator.query(
      'DROP DATABASE IF EXISTS ' + quotedDatabaseName + ' WITH (FORCE)',
    );
    await administrator.end();
    throw error;
  }

  project.provide('databaseUrl', databaseUrl.toString());

  return async () => {
    await administrator.query(
      'DROP DATABASE IF EXISTS ' + quotedDatabaseName + ' WITH (FORCE)',
    );
    await administrator.end();
  };
}
