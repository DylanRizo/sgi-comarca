import { inject } from 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

process.env.DATABASE_URL = inject('databaseUrl');
