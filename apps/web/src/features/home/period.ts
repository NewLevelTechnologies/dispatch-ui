// The Revenue tab's reporting period. One URL param, `?period=`, in the
// backend's format: `2026-08` (month), `2026-Q3` (quarter), `2026-YTD` (year
// to date) or `2025` (full year). Absent = the current month to date, which
// is also what the backend answers with no param. Pure date math over the
// tenant's "today"; every number still comes from the server.
import type { DailyAmount, RevenueComparisonBasis } from '../../api/setup';

export type PeriodKind = 'month' | 'quarter' | 'ytd' | 'year';

export interface Period {
  id: string;
  kind: PeriodKind;
  year: number;
  /** 1–12, months only. */
  month?: number;
  /** 1–4, quarters only. */
  quarter?: number;
}

const MONTH = /^(\d{4})-(\d{2})$/;
const QUARTER = /^(\d{4})-Q([1-4])$/;
const YTD = /^(\d{4})-YTD$/;
const YEAR = /^(\d{4})$/;

export function parsePeriod(id: string): Period | null {
  let m = MONTH.exec(id);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { id, kind: 'month', year: Number(m[1]), month } : null;
  }
  if ((m = QUARTER.exec(id))) return { id, kind: 'quarter', year: Number(m[1]), quarter: Number(m[2]) };
  if ((m = YTD.exec(id))) return { id, kind: 'ytd', year: Number(m[1]) };
  if ((m = YEAR.exec(id))) return { id, kind: 'year', year: Number(m[1]) };
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (today: string) => today.split('-').map(Number) as [number, number, number];

export function monthId(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** The current month's id, e.g. "2026-10". */
export function currentMonthId(today: string): string {
  const [y, m] = ymd(today);
  return monthId(y, m);
}

/** Whether the period contains today (so it's "to date"). */
export function isCurrentPeriod(p: Period, today: string): boolean {
  const [y, m] = ymd(today);
  switch (p.kind) {
    case 'month':
      return p.year === y && p.month === m;
    case 'quarter':
      return p.year === y && p.quarter === Math.ceil(m / 3);
    case 'ytd':
    case 'year':
      return p.year === y;
  }
}

export interface PeriodOption {
  id: string;
  /** Which relative hint to show beside the name. */
  hint: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'yearToDate' | 'lastYear' | null;
}

export interface PeriodGroup {
  id: 'month' | 'quarter' | 'year';
  options: PeriodOption[];
}

/**
 * What the picker offers: this month and the 12 before it, this and last
 * quarter, this year to date and last year. No custom ranges (Reports).
 */
export function periodGroups(today: string): PeriodGroup[] {
  const [y, m] = ymd(today);
  const months: PeriodOption[] = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({
      id: monthId(d.getUTCFullYear(), d.getUTCMonth() + 1),
      hint: i === 0 ? 'thisMonth' : i === 1 ? 'lastMonth' : null,
    });
  }
  const q = Math.ceil(m / 3);
  const lastQ = q === 1 ? { year: y - 1, q: 4 } : { year: y, q: q - 1 };
  return [
    { id: 'month', options: months },
    {
      id: 'quarter',
      options: [
        { id: `${y}-Q${q}`, hint: 'thisQuarter' },
        { id: `${lastQ.year}-Q${lastQ.q}`, hint: 'lastQuarter' },
      ],
    },
    {
      id: 'year',
      options: [
        { id: `${y}-YTD`, hint: 'yearToDate' },
        { id: String(y - 1), hint: 'lastYear' },
      ],
    },
  ];
}

/**
 * The period the URL asks for, or the current month when it asks for
 * nothing or for something the picker doesn't offer (rather than sending the
 * backend a period it would reject).
 */
export function resolvePeriod(raw: string | null, today: string): Period {
  const offered = raw && periodGroups(today).some((g) => g.options.some((o) => o.id === raw));
  return (offered && parsePeriod(raw)) || (parsePeriod(currentMonthId(today)) as Period);
}

const monthLong = (month: number) =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
export const monthShort = (month: number) =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/** "September 2026", "Q3 2026", "2026". */
export function periodName(p: Period): string {
  switch (p.kind) {
    case 'month':
      return `${monthLong(p.month!)} ${p.year}`;
    case 'quarter':
      return `Q${p.quarter} ${p.year}`;
    case 'ytd':
    case 'year':
      return String(p.year);
  }
}

/** The "to date" suffix for a current period's KPI labels. */
export function toDateSuffix(p: Period): 'MTD' | 'QTD' | 'YTD' {
  return p.kind === 'month' ? 'MTD' : p.kind === 'quarter' ? 'QTD' : 'YTD';
}

/**
 * What the delta is "vs": the same days last year ("same days 2025"), the
 * same period last year ("Aug 2025", "Q2 2025", "2025"), or the previous month
 * ("Jul 2026"). Null when the backend has nothing to compare against.
 */
export function comparisonLabel(
  p: Period,
  basis: RevenueComparisonBasis | null,
): { kind: 'sameDays' | 'period'; label: string } | null {
  switch (basis) {
    case 'sameDaysLastYear':
      return { kind: 'sameDays', label: String(p.year - 1) };
    case 'samePeriodLastYear':
      return {
        kind: 'period',
        label:
          p.kind === 'month'
            ? `${monthShort(p.month!)} ${p.year - 1}`
            : p.kind === 'quarter'
              ? `Q${p.quarter} ${p.year - 1}`
              : String(p.year - 1),
      };
    case 'previousMonth': {
      if (p.kind !== 'month') return null;
      const d = new Date(Date.UTC(p.year, p.month! - 2, 1));
      return { kind: 'period', label: `${monthShort(d.getUTCMonth() + 1)} ${d.getUTCFullYear()}` };
    }
    default:
      return null;
  }
}

export interface RevenueMonth {
  /** "Jan". */
  label: string;
  amount: number;
  /** The month still in progress — only in a current period. */
  partial: boolean;
}

/**
 * Calendar-month buckets for a quarter, year to date or year, from the
 * backend's daily totals (which run periodStart → asOf). The month holding
 * `asOf` is partial in a current period unless `asOf` is its last day.
 */
export function revenueMonths(billedByDay: DailyAmount[], asOf: string, isCurrent: boolean): RevenueMonth[] {
  const buckets = new Map<string, number>();
  for (const d of billedByDay) {
    const key = d.date.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + d.amount);
  }
  const [ay, am, ad] = ymd(asOf);
  const lastDay = new Date(Date.UTC(ay, am, 0)).getUTCDate();
  const asOfKey = monthId(ay, am);
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amount]) => ({
      label: monthShort(Number(key.slice(5, 7))),
      amount,
      partial: isCurrent && key === asOfKey && ad < lastDay,
    }));
}
