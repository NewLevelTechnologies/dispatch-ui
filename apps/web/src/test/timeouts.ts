/**
 * Shared test timeout for the form-heavy suites.
 *
 * Most tests need nothing beyond `testTimeout` in vitest.config.ts (15s). This
 * is for the handful that drive long userEvent sequences — filling entire
 * addresses a keystroke at a time, each with a React re-render — and measure
 * over ~4s locally *under coverage*:
 *
 *   WorkOrderIntakePage  routes the bill-to name ....... 7617ms
 *   CustomerFormDialog   all form fields ............... 4770ms
 *   WorkOrderIntakePage  adds a new property ........... 4108ms
 *   WorkOrderIntakePage  creates the customer first .... 4044ms
 *   WorkOrderIntakePage  one contact channel ........... 4027ms
 *   WorkOrderIntakePage  standardized address .......... 3926ms
 *
 * CI roughly doubles those — 171 files share a couple of runner cores and
 * coverage adds its own overhead, so the full run takes ~800s of test time there
 * versus ~50s locally.
 *
 * Exists as one constant because the alternative already failed: ad-hoc numbers
 * (10000, 15000, 20000) were scattered across seven files, each added when a
 * different test failed, and several sat *below* the global default — so they
 * made those tests more fragile, not less. #385 raised one file's; CustomerFormDialog
 * failed next.
 *
 * If more tests need this, prefer trimming their typed fixtures over raising the
 * number. `userEvent.setup({ delay: null })` was measured and bought only ~15%,
 * so the cost is the re-renders, not the keystroke delay.
 */
export const HEAVY_FORM_TIMEOUT = 30_000;
