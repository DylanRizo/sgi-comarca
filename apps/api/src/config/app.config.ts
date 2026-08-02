import { registerAs } from '@nestjs/config';

const developmentDatabaseUrl =
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3001');

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function databaseUrl(nodeEnvironment: string): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (nodeEnvironment === 'production') {
    throw new Error('DATABASE_URL is required in production.');
  }

  return developmentDatabaseUrl;
}

export const appConfig = registerAs('app', () => {
  const nodeEnvironment = process.env.NODE_ENV ?? 'development';

  return {
    apiPort: parsePort(process.env.API_PORT),
    databaseUrl: databaseUrl(nodeEnvironment),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    nodeEnvironment,
    swaggerEnabled:
      nodeEnvironment !== 'production' &&
      parseBoolean(process.env.SWAGGER_ENABLED ?? 'false'),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  };
});
