import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sgi/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@sgi/database': fileURLToPath(
        new URL('./packages/database/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['apps/**/*.integration.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
