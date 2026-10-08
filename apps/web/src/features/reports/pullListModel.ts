// The Filter Pull List's pure parts: which days it covers (from the URL),
// how sizes and stops read, and its CSV. The server does the grouping and
// the counting; nothing here adds filters up except for display totals.
import type { FilterPullList, FilterPullListSize } from '@dispatch/api';
import { formatFilterSize } from '@dispatch/utils';
import { csvLines } from './csv';

/** The server's longest range: `dateTo` at most 31 days after `date`. */
export const MAX_SPAN_DAYS = 31;

export type DayPreset = 'today' | 'tomorrow';

export interface PullDays {
  /** `today` / `tomorrow`, or `custom` for picked dates. */
  kind: DayPreset | 'custom';
  date: string;
  dateTo: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Why picked dates can't be asked for, or null. Past days are fine: reprints. */
export function customDaysProblem(date: string, dateTo: string): 'order' | 'tooLong' | null {
  if (dateTo < date) return 'order';
  if (daysBetween(date, dateTo) > MAX_SPAN_DAYS) return 'tooLong';
  return null;
}

/** URL id for picked dates: one day, or `from..to`. */
export const customDaysId = (date: string, dateTo: string) => (date === dateTo ? date : `${date}..${dateTo}`);

/**
 * `?days=` to the days asked for. Tomorrow when absent or unusable: the list
 * is pulled the afternoon before.
 */
export function resolveDays(raw: string | null, today: string): PullDays {
  if (raw === 'today') return { kind: 'today', date: today, dateTo: today };
  if (raw) {
    const [date, dateTo = date] = raw.split('..');
    if (DAY.test(date) && DAY.test(dateTo) && !customDaysProblem(date, dateTo))
      return { kind: 'custom', date, dateTo };
  }
  const tomorrow = addDays(today, 1);
  return { kind: 'tomorrow', date: tomorrow, dateTo: tomorrow };
}

const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/** "Fri, Oct 9" / "Fri, Oct 9 – Mon, Oct 12" (years only when not this year). */
export function formatDays(date: string, dateTo: string, today: string): string {
  const withYear = date.slice(0, 4) !== today.slice(0, 4) || dateTo.slice(0, 4) !== today.slice(0, 4);
  const one = (d: string) =>
    fmt(d, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  return date === dateTo ? one(date) : `${one(date)} – ${one(dateTo)}`;
}

/** "Fri 9": the day on a stop when the list covers more than one. */
export const stopDay = (day: string) => `${fmt(day, { weekday: 'short' })} ${Number(day.slice(8))}`;

export const sizeKey = (s: Pick<FilterPullListSize, 'lengthIn' | 'widthIn' | 'thicknessIn'>) =>
  `${s.lengthIn}x${s.widthIn}x${s.thicknessIn}`;

/** Filters (not sizes) in a set of totals. */
export const filterCount = (sizes: Pick<FilterPullListSize, 'quantity'>[]) =>
  sizes.reduce((sum, s) => sum + s.quantity, 0);

export const stopCount = (list: FilterPullList) => list.techs.reduce((sum, t) => sum + t.stops.length, 0);

export interface PullCsvLabels {
  headers: string[];
  /** A tech's printed name (handles unnamed). */
  tech: (name: string | null) => string;
  /** A stop's date and window in the tenant's zone. */
  day: (iso: string) => string;
  window: (start: string, end: string | null) => string;
}

/**
 * One row per filter on a stop, in the printed order (tech, then stop), so
 * the file reads like the page. A stop with no filters keeps one row with the
 * size blank, so the route is whole.
 */
export function pullListCsv(list: FilterPullList, labels: PullCsvLabels): string {
  const rows: (string | number | null)[][] = [labels.headers];
  for (const tech of list.techs)
    for (const stop of tech.stops) {
      const lead = [
        labels.tech(tech.name),
        labels.day(stop.arrivalWindowStart),
        labels.window(stop.arrivalWindowStart, stop.arrivalWindowEnd),
        stop.workOrderNumber,
        stop.customerName,
        stop.locationName,
        stop.streetAddress,
        stop.city,
      ];
      if (stop.filters.length === 0) rows.push([...lead, null, null, null]);
      for (const f of stop.filters) rows.push([...lead, f.equipmentName, formatFilterSize(f), f.quantity]);
    }
  return csvLines(rows);
}
