import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Platform-agnostic package: no DOM, no global setup file. The api tests
    // mock the axios client and assert on request shape, so they need no
    // browser environment — File and FormData are Node globals (>=20).
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Pure re-export barrel — no logic to cover, and 500 lines of
        // re-exports would otherwise dominate the denominator.
        'src/index.ts',
      ],
      // TODO: enable `thresholds: COVERAGE_THRESHOLDS` once this package
      // clears the standard. Tracked at 35.5% statements today; tests are
      // landing module by module, biggest gap first.
    },
  },
});
