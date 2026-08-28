import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from './generated/prisma/client.js';

export type DatabaseClient = PrismaClient;
export { Prisma };

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export async function checkDatabaseConnection(
  client: DatabaseClient,
): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}
