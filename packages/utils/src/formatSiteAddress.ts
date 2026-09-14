import { titleCaseAddress } from './titleCaseAddress';

export interface SiteAddressParts {
  street?: string | null;
  city?: string | null;
  /** Two-letter code. Deliberately NOT run through `titleCaseAddress`, which
   *  would render "GA" as "Ga" — see that helper's own note. */
  state?: string | null;
  zip?: string | null;
}

/**
 * The platform's canonical full-address line, matching the string customer
 * notification templates send verbatim:
 *
 *     1847 Peachtree Rd NE, Atlanta, GA 30309
 *
 * Street, city, then state and zip space-joined into one segment, the three
 * comma-joined. A dispatcher reading this on the board sees the same string
 * the customer got, which is the point of matching rather than inventing a
 * board-local format.
 *
 * Any missing part is omitted ENTIRELY — no stray comma, no double space, no
 * "N/A" placeholder. Null here means the site has no street (or no zip) on
 * file, not that a lookup failed, so there is nothing to apologise for.
 *
 * Parts arrive separately rather than pre-formatted because different
 * surfaces want different amounts of it: a tooltip wants the whole line, a
 * 262px rail card wants the street alone.
 */
export function formatSiteAddress(parts: SiteAddressParts): string {
  const stateAndZip = [parts.state, parts.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return [titleCaseAddress(parts.street), titleCaseAddress(parts.city), stateAndZip]
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ');
}
