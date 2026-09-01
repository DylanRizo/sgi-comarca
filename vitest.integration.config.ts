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
    globalSetup: fileURLToPath(
      new URL(
        './packages/database/test/integration-global-setup.ts',
        import.meta.url,
      ),
    ),
    include: [
      'apps/**/*.integration.spec.ts',
      'packages/**/*.integration.spec.ts',
    ],
    setupFiles: fileURLToPath(
      new URL('./packages/database/test/integration-setup.ts', import.meta.url),
    ),
    // The integration suite runs against a single shared PostgreSQL instance
    // (one database from integration-global-setup, plus per-file isolated
    // databases like the sales-concurrency spec's). Running files in parallel
    // starves that instance and the host CPU, which exhausts the optimistic-lock
    // retry budget in the concurrency tests and surfaces spurious
    // SALE_CONCURRENCY_CONFLICT rejections. Serializing files removes the
    // cross-file starvation so the only concurrency left is the one each test
    // deliberately exercises. Integration tests are I/O-bound, so determinism is
    // worth the wall-clock cost.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
