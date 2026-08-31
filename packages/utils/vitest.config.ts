import { defineConfig } from 'vitest/config';
import { COVERAGE_THRESHOLDS } from '../../coverage-thresholds.mjs';

export default defineConfig({
  test: {
    // Platform-agnostic package: no DOM, no global setup file. Anything that
    // needs a browser environment or React belongs in the consuming app's
    // suite, not here.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
