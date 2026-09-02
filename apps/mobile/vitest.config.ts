import { defineConfig } from 'vitest/config';
import { COVERAGE_THRESHOLDS } from '../../coverage-thresholds.mjs';

export default defineConfig({
  test: {
    // Node, not jsdom: these suites cover platform-agnostic logic. React Native
    // components need a Metro/RN runtime that vitest does not provide, so
    // screen-level tests are not attempted here — see the coverage note below.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],

      // Deliberately narrower than the other packages, which measure all of
      // src. Mobile's screens, navigation and Amplify wiring cannot run under
      // vitest, so including them would drag coverage far below the shared
      // threshold and force either a red build or a weakened standard — both
      // worse than measuring less and saying so.
      //
      // The rule: a directory joins this list when it gains a suite. Untested
      // code is therefore *unmeasured*, not silently counted as covered, and
      // the gap stays visible here rather than hiding inside a percentage.
      include: ['src/storage/**/*.ts'],
      exclude: ['src/**/*.test.ts'],

      // Same repo-wide minimums as every other project. The scope above is
      // narrow; the bar applied to it is not.
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
