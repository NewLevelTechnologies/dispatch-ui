// Single source of truth for the repo's coverage minimums.
//
// Every app and package imports this, so the standard is defined once and
// raising it is a one-line change that applies everywhere. Deliberately a
// plain module with no imports of its own: it is loaded by each project's
// vitest config, which resolves dependencies from that project's own
// node_modules under pnpm's strict layout.
export const COVERAGE_THRESHOLDS = {
  lines: 80,
  branches: 80,
  statements: 80,
  // Lower than the rest by history, not by intent — originally dropped for
  // CustomerDetailPage's inline functions. Raise toward 80 as that is paid down.
  functions: 75,
};
