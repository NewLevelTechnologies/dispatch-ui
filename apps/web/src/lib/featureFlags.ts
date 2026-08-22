// Lightweight feature-flag registry.
//
// Flags are static `const` values today — flip them to `true` once the
// matching backend ships. If runtime/per-tenant gating is needed later,
// swap the values for env-driven lookups without changing call sites.
//
// Convention: flags name the FEATURE, not the absence of it. A `true`
// value means "the feature is visible/active".
export const flags = {
  // BE PR-2: GET /notification-templates/{id}/samples. While false, the
  // editor hides the sample picker and uses a hardcoded fallback per
  // notificationTypeKey from templateSamples.ts.
  notificationSamples: false,

  // BE PR-2: POST /notification-templates/{id}/send-test. While false,
  // the Send test button is suppressed entirely from the editor header.
  notificationTestSend: true,
} as const;

export type FeatureFlag = keyof typeof flags;
