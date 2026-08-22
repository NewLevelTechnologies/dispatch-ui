import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Platform-agnostic package: no DOM, no global setup file. The api tests
    // mock the axios client and assert on request shape, so they need no
    // browser environment — File and FormData are Node globals (>=20).
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
