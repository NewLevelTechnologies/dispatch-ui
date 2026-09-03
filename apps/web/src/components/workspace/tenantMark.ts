// Monogram for a workspace tile.
//
// Derived from the company name rather than a logo: `/users/me/tenants` returns
// no branding (it runs before a tenant is selected, so there is nothing to scope
// a logo lookup to), and a workspace still needs a mark in the picker. Where a
// real logo IS available — the sidebar, once a workspace is active — prefer it
// and fall back to this.
const LEGAL_SUFFIX =
  /^(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|services|service|group|holdings|partners|associates)\.?$/i;

/**
 * Up to two letters for a company name, ignoring legal suffixes so
 * "ACME HVAC Services" reads AH rather than AS.
 *
 * Falls back to the first two characters when stripping leaves fewer than two
 * words — including the degenerate case where every word is a suffix, which
 * would otherwise produce an empty mark.
 */
export function tenantMark(name: string): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/).filter((w) => !LEGAL_SUFFIX.test(w));
  const initials =
    words.length >= 2 && words[0] && words[1]
      ? words[0][0]! + words[1][0]!
      : (words[0] ?? trimmed).slice(0, 2);

  return initials.toUpperCase();
}
