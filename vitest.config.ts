import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**', '**/dist/**'],
    passWithNoTests: false,
  },
});
