// ─────────────────────────────────────────────────────────────────────
// What to call the thing a truck is going to.
//
// The SITE's own name when it has one, the customer's otherwise. This is the
// rule `ServiceLocationSearchResponse` states — "the operative label on an
// address match, since that's what we route to… Falls back to the customer
// name" — and the one `ServiceLocationPicker` has always implemented.
//
// It matters most where it is least visible: "Kroger Co." on eleven rows is
// eleven different stores, and `Store #4412` is the one the truck is going
// to. Most residential sites have no name, so the customer is the correct
// fallback rather than a placeholder.
//
// Shared because the board renders this label on five surfaces — rail card,
// map pin tooltip, timeline block, block context menu, the job section — and
// each one that reimplemented it drifted back to the customer name.
// ─────────────────────────────────────────────────────────────────────

export interface SiteLabelParts {
  serviceLocationName?: string | null;
  customerName?: string | null;
}

/**
 * `||`, not `??`: an empty-string name is a data quirk, not a name, and
 * falling through to the customer beats rendering a blank label.
 *
 * Returns an empty string when neither is known, so callers can gate on it
 * rather than render an empty element holding layout.
 */
export function siteLabel(parts: SiteLabelParts): string {
  return parts.serviceLocationName || parts.customerName || '';
}
