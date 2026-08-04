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
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
