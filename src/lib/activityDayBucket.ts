// ─────────────────────────────────────────────────────────────────
// activityDayBucket.ts — client-side day grouping for activity feeds.
//
// Day grouping is the single biggest scannability win at volume: the eye
// jumps by date. Buckets the recent past relatively (Today / Yesterday /
// This week) and falls back to a per-calendar-day absolute label for older
// events. Shared by the per-WO activity rail and the location-scoped feed
// so both group identically.
// ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface DayBucket {
  /** Stable key for grouping (e.g. "today", "yesterday", "older-2026-3-15"). */
  key: string;
  /** Human-readable label rendered in the day header. */
  label: string;
}

export function getDayBucket(iso: string, t: (key: string) => string): DayBucket {
  const eventDate = new Date(iso);
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = startOfDay(new Date());
  const eventStart = startOfDay(eventDate);
  const diff = todayStart - eventStart;

  if (diff === 0) return { key: 'today', label: t('workOrders.activity.day.today') };
  if (diff === DAY_MS) {
    return { key: 'yesterday', label: t('workOrders.activity.day.yesterday') };
  }
  if (diff > 0 && diff < WEEK_MS) {
    return { key: 'thisWeek', label: t('workOrders.activity.day.thisWeek') };
  }
  // Older — bucket per calendar day; label is the formatted date.
  const key = `older-${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
  const label = eventDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return { key, label };
}
