import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';

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
