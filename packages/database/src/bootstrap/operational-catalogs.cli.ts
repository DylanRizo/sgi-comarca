import { createDatabaseClient } from '../client.js';
import { prepareOperationalCatalogs } from './operational-catalogs.js';

// Deliberately does not load .env or assume a destination. Operators must first
// verify the environment/checkpoint and explicitly identify this process target.
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('An explicit DATABASE_URL is required.');
const target = new URL(connection);
const databaseName = decodeURIComponent(target.pathname.slice(1));
const confirmation = process.argv
  .find((value) => value.startsWith('--confirm-database='))
  ?.slice('--confirm-database='.length);
if (!confirmation || confirmation !== databaseName)
  throw new Error(
    'Verify the target and supply --confirm-database=<database-name>.',
  );
const client = createDatabaseClient(connection);
try {
  const result = await prepareOperationalCatalogs(client);
  process.stdout.write(
    JSON.stringify({ event: 'operational_catalogs_prepared', ...result }) +
      '\n',
  );
} finally {
  await client.$disconnect();
}
