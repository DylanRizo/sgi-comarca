import 'dotenv/config';

import { createDatabaseClient } from '../client.js';
import { runBootstrap } from './run-bootstrap.js';

const developmentUrl =
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';

const client = createDatabaseClient(process.env.DATABASE_URL ?? developmentUrl);

try {
  const result = await runBootstrap(client);
  process.stdout.write(
    JSON.stringify({ event: 'phase_3a_bootstrap', ...result }) + '\n',
  );
} finally {
  await client.$disconnect();
}
