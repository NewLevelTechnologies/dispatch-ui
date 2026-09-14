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
export interface SiteAddressOptions {
  /**
   * What separates the STREET from the city/state/zip group. Defaults to the
   * canonical comma.
   *
   * The dispatch rail passes `' · '`: at 262px the address wraps to a second
   * line, and an interpunct marks where the street ends so a wrapped address
   * still parses as street-then-place rather than one run-on string. The
   * comma form stays on surfaces with room for the whole line on one row,
   * where matching the customer's notification verbatim is the point.
   *
   * City, state and zip always join the same way regardless — they are one
   * place, and splitting them would be a different address, not a restyled one.
   */
  separator?: string;
}

export function formatSiteAddress(
  parts: SiteAddressParts,
  options: SiteAddressOptions = {},
): string {
  const stateAndZip = [parts.state, parts.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  const place = [titleCaseAddress(parts.city), stateAndZip]
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ');

  return [titleCaseAddress(parts.street).trim(), place]
    .filter(Boolean)
    .join(options.separator ?? ', ');
}
