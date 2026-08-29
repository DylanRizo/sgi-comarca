import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';

// Spec files are numbered (01-, 02-, ...) because execution order matters:
// with fullyParallel/workers below, Playwright runs them alphabetically on
// one shared ephemeral database whose sale/movement history is immutable
// (FASE 7A/8A triggers forbid deleting it). 02-inventory.e2e.ts asserts an
// exact global product count, so it must run before any suite (sales,
// finances) creates a product a sale references — that product, and its
// count, can never be removed for the rest of the run. Do not remove the
// prefixes or add an unordered new spec without checking this constraint.
export default defineConfig({
  expect: { timeout: 20_000 },
  fullyParallel: false,
  outputDir: 'node_modules/.cache/sgi-playwright-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: 'list',
  retries: 0,
  testDir: './e2e',
  testIgnore: ['**/support/**'],
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  use: {
    baseURL,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  workers: 1,
});
