import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Platform-agnostic package: no DOM, no global setup file. Anything that
    // needs a browser environment or React belongs in the consuming app's
    // suite, not here.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
