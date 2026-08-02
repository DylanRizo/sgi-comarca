import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export async function checkDatabaseConnection(
  client: DatabaseClient,
): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}
