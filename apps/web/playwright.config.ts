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
//
// FASE 10C adds tablet and mobile projects. They run ONLY 90-responsive, which
// seeds nothing and asserts no counts: every project shares the same ephemeral
// database, so a suite that seeded would collide with itself on the second
// project. The functional suites stay on desktop alone for the same reason —
// re-running 02-inventory's exact product count after 03/04 have created
// sale-linked products would fail by construction.
//
// Viewports are explicit rather than device presets so the three projects
// differ only in width, which is what the gate is actually about.
const responsiveSuite = '**/90-responsive.e2e.ts';

export default defineConfig({
  expect: { timeout: 20_000 },
  fullyParallel: false,
  outputDir: 'node_modules/.cache/sgi-playwright-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      testMatch: responsiveSuite,
      use: { ...devices['Desktop Chrome'], viewport: { height: 1024, width: 768 } },
    },
    {
      name: 'mobile',
      testMatch: responsiveSuite,
      use: { ...devices['Desktop Chrome'], viewport: { height: 844, width: 390 } },
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
