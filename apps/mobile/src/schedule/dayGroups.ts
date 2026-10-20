const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Local calendar-day key ("2026-10-20") for a Date or an ISO instant. */
export function dayKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a dayKey back into a local Date at noon — noon avoids any DST edge landing on the wrong day. */
function dateFromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

/**
 * "Today" / "Tomorrow" / "Mon, Oct 26" — a day heading relative to `now`.
 *
 * Takes a translate function rather than importing `@dispatch/i18n` directly:
 * every other piece of user-facing copy in this app resolves through a
 * component's own `useTranslation()`, and this keeps that the single pattern
 * — plus it's what makes the "Today"/"Tomorrow" cases trivial to test without
 * initializing i18next.
 */
export function formatDayHeading(key: string, t: (k: string) => string, now: Date = new Date()): string {
  const todayKey = dayKey(now);
  if (key === todayKey) return t('mobileSchedule.today');

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === dayKey(tomorrow)) return t('mobileSchedule.tomorrow');

  return WEEKDAY_MONTH_DAY.format(dateFromDayKey(key));
}

export type DayGroup<T> = { key: string; heading: string; items: T[] };

/**
 * Groups already-sorted items into local calendar days, preserving both the
 * items' order within a day and the order groups are first encountered —
 * `dispatchesApi.getAll` sorts by arrival time server-side, so this never
 * re-sorts, just partitions.
 */
export function groupByDay<T>(
  items: T[],
  getIso: (item: T) => string,
  t: (k: string) => string,
  now: Date = new Date()
): DayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(getIso(item));
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([key, groupItems]) => ({
    key,
    heading: formatDayHeading(key, t, now),
    items: groupItems,
  }));
}
