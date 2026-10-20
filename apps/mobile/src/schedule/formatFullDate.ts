const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/** "Tuesday, Oct 20" — the Today screen's header eyebrow. */
export function formatFullDate(now: Date = new Date()): string {
  return WEEKDAY_MONTH_DAY.format(now);
}
