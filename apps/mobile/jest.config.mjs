import { COVERAGE_THRESHOLDS } from '../../coverage-thresholds.mjs';

/**
 * Jest rather than vitest, unlike the rest of the monorepo.
 *
 * That asymmetry is deliberate: the runner should match the platform's bundler.
 * Web is Vite, so vitest reuses its transform pipeline, aliases and CSS handling
 * for free. Mobile is Metro, and the jest-expo preset is what makes Metro's
 * resolution rules work under test — platform extensions (.ios.tsx, .native.ts),
 * transforming React Native's untranspiled ESM inside node_modules, and mocking
 * native modules.
 *
 * It is also not really optional: @testing-library/react-native declares
 * `jest: >=29` as a peer dependency, and the only vitest alternative
 * (vitest-react-native) is at 0.1.5 and unpublished since January 2024.
 *
 * jest-expo is versioned in lockstep with the SDK — 57.x here for SDK 57 — so it
 * moves with `expo` rather than drifting.
 *
 * `.mjs` so the shared COVERAGE_THRESHOLDS can be imported: the standard stays
 * defined once at the repo root, exactly as the vitest projects consume it.
 */
export default {
  preset: 'jest-expo',

  // Narrower than the other projects on purpose. Mobile's screens need render
  // tests that do not exist yet; including them would drag coverage below the
  // shared threshold and force either a red build or a weakened standard.
  // A directory joins this list when it gains a suite, so untested code stays
  // *unmeasured* rather than silently counted as covered.
  collectCoverageFrom: ['src/storage/**/*.ts'],
  coveragePathIgnorePatterns: ['\\.test\\.ts$'],

  // Same repo-wide minimums as every other project; Jest's threshold keys match
  // the shared module's shape exactly.
  coverageThreshold: { global: COVERAGE_THRESHOLDS },
};
