import { createDatabaseClient } from '@sgi/database';

import {
  FinancialCatalogError,
  prepareFinancialCatalogs,
} from './prepare-financial-catalogs.js';

// Never load .env or fall back to the development database for this command.
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('An explicit DATABASE_URL is required.');
let target: URL;
try {
  target = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(target.protocol))
    throw new Error();
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}
const argument = (name: string) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const database = decodeURIComponent(target.pathname.slice(1));
if (!database || argument('confirm-database') !== database) {
  throw new Error(
    'Verify the target and supply --confirm-database=<database-name>.',
  );
}
const actor = argument('actor');
if (!actor) throw new Error('Supply --actor=<active-finance-user-identifier>.');
console.log(
  JSON.stringify({
    event: 'financial_catalogs_target',
    host: target.hostname,
    database,
  }),
);
const client = createDatabaseClient(connection);
try {
  const result = await prepareFinancialCatalogs(
    client,
    actor,
    process.argv.includes('--commit'),
  );
  console.log(
    JSON.stringify({ event: 'financial_catalogs_prepared', ...result }),
  );
} catch (error) {
  // Unexpected driver exceptions can contain connection details. Never log them.
  console.error(
    JSON.stringify({
      event: 'financial_catalogs_failed',
      code:
        error instanceof FinancialCatalogError
          ? error.code
          : 'DATABASE_OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
