import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const developmentUrl =
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? developmentUrl,
  },
});
