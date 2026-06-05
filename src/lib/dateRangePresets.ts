// Shared date-range presets for list toolbars (consumed by DateRangeChip and
// by legacy `?date=<preset>` URL resolution). Pure helpers — no React.
// Resolves a preset id to inclusive `from`/`to` ISO day strings (yyyy-mm-dd)
// that map to day-column params like scheduledDateFrom / scheduledDateTo.

export type DatePreset =
  | ''
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'last30'
  | 'custom';

// The value model for DateRangeChip: inclusive yyyy-mm-dd day strings, either
// side '' for an open-ended range.
export interface DateRange {
  from: string;
  to: string;
}

export const EMPTY_DATE_RANGE: DateRange = { from: '', to: '' };

const DAY_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_YEAR_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Hybrid display for a single day: the year shows only when it isn't the
// current one. Reads the clock internally so render-scope callers stay clear
// of the react-hooks/purity rule.
function formatDay(day: string): string {
  const d = parseDay(day);
  return (d.getFullYear() === new Date().getFullYear() ? DAY_FMT : DAY_YEAR_FMT).format(d);
}

// "May 1 – May 31" / "After May 1" / "Before May 31" — shared by the chip's
// closed state and any host echoing the range (active-filter pill rows).
export function formatDateRange(range: DateRange): string {
  if (range.from && range.to) return `${formatDay(range.from)} – ${formatDay(range.to)}`;
  if (range.from) return `After ${formatDay(range.from)}`;
  return `Before ${formatDay(range.to)}`;
}

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Inclusive day strings (yyyy-mm-dd, either side optional for an open-ended
// range) → a half-open ISO instant pair ([from, to)) for endpoints that
// filter on a timestamp column rather than a day column (e.g. the location
// dispatch list's arrivalWindowStart). Boundaries are LOCAL day starts — the
// CSR thinks in wall-clock days — and the exclusive end is the midnight AFTER
// the inclusive last day. Built via the Date(y, m, d) constructor (not
// start + 24h) so DST transitions can't skew the boundary.
export function instantRangeForDays(
  fromDay?: string,
  toDay?: string,
): { from?: string; to?: string } {
  const localMidnight = (day: string, plusDays = 0) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d + plusDays).toISOString(); // overflow rolls the month
  };
  return {
    from: fromDay ? localMidnight(fromDay) : undefined,
    to: toDay ? localMidnight(toDay, 1) : undefined,
  };
}

export function rangeForPreset(
  preset: Exclude<DatePreset, '' | 'custom'>,
  today = new Date(),
): { from: string; to: string } {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'today':
      return { from: isoDay(t), to: isoDay(t) };
    case 'yesterday': {
      const y = new Date(t.getTime() - dayMs);
      return { from: isoDay(y), to: isoDay(y) };
    }
    case 'thisWeek': {
      const dow = t.getDay(); // 0 = Sunday
      const start = new Date(t.getTime() - dow * dayMs);
      const end = new Date(start.getTime() + 6 * dayMs);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'last7': {
      const start = new Date(t.getTime() - 6 * dayMs);
      return { from: isoDay(start), to: isoDay(t) };
    }
    case 'thisMonth': {
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'lastMonth': {
      const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const end = new Date(t.getFullYear(), t.getMonth(), 0);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'thisYear': {
      const start = new Date(t.getFullYear(), 0, 1);
      const end = new Date(t.getFullYear(), 11, 31);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'last30': {
      const start = new Date(t.getTime() - 29 * dayMs);
      return { from: isoDay(start), to: isoDay(t) };
    }
  }
}
