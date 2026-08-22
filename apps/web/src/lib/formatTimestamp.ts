// One shared timestamp formatter for the whole app.
//
// Hybrid rule: relative at the recent end (where "3h ago" beats a date), then
// an absolute date once it's old enough that relative just forces the reader to
// do subtraction ("46 days ago" → when was that, exactly?).
//
//   < 60s            → just now
//   < 60m            → {n}m ago
//   < 24h            → {n}h ago
//   < 48h            → yesterday
//   < 7 days         → {n} days ago
//   ≥ 7d, same year  → Apr 14
//   ≥ 7d, prior year → Apr 14, 2025
//
// Future timestamps (elapsed < 0) skip the relative band entirely and render as
// an absolute date — this helper never says "in 3 days". Deliberate relative-
// future copy (e.g. an agreement "renews in 18d") is built separately and must
// NOT route through here.
//
// The exact date+time is always available via formatExactTimestamp() — wire it
// into a title attribute (the <TimeAgo> wrapper does this for free) so hover
// reveals the precise value without cluttering the line.

// The single relative/absolute boundary. Change it here and every surface
// follows.
export const RELATIVE_CUTOFF_DAYS = 7;

// Only en-US ships today. Month names come from Intl (not a hand-rolled array),
// so this is locale-correct by construction — point it at the active i18n
// language when the app goes multi-locale.
const LOCALE = 'en-US';

const MONTH_DAY = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
const MONTH_DAY_TIME = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const MONTH_DAY_YEAR_TIME = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const EXACT = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Hybrid relative/absolute timestamp for display. See file header for the rule.
 * Returns '' for null/empty/invalid input.
 *
 * @param opts.withTime append the time of day to the absolute date branch
 *   (e.g. "Apr 14, 3:42 PM"). Has no effect on the relative band.
 */
export function formatTimestamp(iso: string | null | undefined, opts?: { withTime?: boolean }): string {
  if (!iso) return '';
  const date = new Date(iso);
  const then = date.getTime();
  if (Number.isNaN(then)) return '';

  const now = Date.now();
  const elapsed = now - then;

  // Relative band — recent past only. Future (elapsed < 0) falls through to an
  // absolute date.
  if (elapsed >= 0 && elapsed < RELATIVE_CUTOFF_DAYS * DAY) {
    if (elapsed < MINUTE) return 'just now';
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
    if (elapsed < 2 * DAY) return 'yesterday';
    return `${Math.floor(elapsed / DAY)} days ago`;
  }

  // Absolute — same calendar year drops the year.
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  if (opts?.withTime) {
    return (sameYear ? MONTH_DAY_TIME : MONTH_DAY_YEAR_TIME).format(date);
  }
  return (sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(date);
}

/** Full, unambiguous date + time for a title/hover (always includes the year). */
export function formatExactTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return EXACT.format(date);
}
