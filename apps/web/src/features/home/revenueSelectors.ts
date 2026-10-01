// Pure selectors for the Revenue & productivity view. The backend owns every
// sum; these only reshape its answers for display.
import type {
  DailyAmount,
  FinancialDashboardReceivables,
  TechnicianProductivityResponse,
} from '../../api/setup';

/** Whole dollars for headline figures ("$48,920"); compact for labels ("$12.4K"). */
export function money(amount: number, { compact = false }: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact && Math.abs(amount) >= 1000 ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(amount);
}

export interface RevenueWeek {
  /** "Sep 1–7". */
  label: string;
  amount: number;
  /** The week still in progress — drawn striped, labelled "so far". */
  partial: boolean;
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

function monthShort(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The month's billing in 7-day buckets from the 1st (1–7, 8–14, …, 29–end),
 * so every bar covers the same span and the last one is the only short one.
 * Buckets run through `asOf`; the bucket holding `asOf` is partial unless
 * `asOf` is its last day.
 */
export function revenueWeeks(billedByDay: DailyAmount[], asOf: string): RevenueWeek[] {
  if (billedByDay.length === 0) return [];
  const month = monthShort(asOf);
  const lastDay = daysInMonth(asOf);
  const today = dayOfMonth(asOf);
  const buckets = new Map<number, number>();
  for (const d of billedByDay) {
    const index = Math.floor((dayOfMonth(d.date) - 1) / 7);
    buckets.set(index, (buckets.get(index) ?? 0) + d.amount);
  }
  const lastIndex = Math.floor((today - 1) / 7);
  const weeks: RevenueWeek[] = [];
  for (let i = 0; i <= lastIndex; i++) {
    const start = i * 7 + 1;
    const end = Math.min(start + 6, lastDay);
    weeks.push({
      label: start === end ? `${month} ${start}` : `${month} ${start}–${end}`,
      amount: buckets.get(i) ?? 0,
      partial: i === lastIndex && today < end,
    });
  }
  return weeks;
}

/** Running total by day — the Revenue MTD sparkline. */
export function cumulative(billedByDay: DailyAmount[]): number[] {
  let sum = 0;
  return billedByDay.map((d) => (sum += d.amount));
}

/** Signed whole-percent change, or null when there is nothing to compare to. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type AgingTone = 'success' | 'warning' | 'danger';

export interface AgingBucketRow {
  id: 'current' | 'days1To30' | 'days31To60' | 'days61Plus';
  amount: number;
  count: number;
  tone: AgingTone;
}

/** The spec's four buckets; 61+ folds the backend's 61–90 and 91+. */
export function agingBuckets(r: FinancialDashboardReceivables): AgingBucketRow[] {
  return [
    { id: 'current', amount: r.current.amount, count: r.current.count, tone: 'success' },
    { id: 'days1To30', amount: r.days1To30.amount, count: r.days1To30.count, tone: 'warning' },
    { id: 'days31To60', amount: r.days31To60.amount, count: r.days31To60.count, tone: 'danger' },
    {
      id: 'days61Plus',
      amount: r.days61To90.amount + r.days91Plus.amount,
      count: r.days61To90.count + r.days91Plus.count,
      tone: 'danger',
    },
  ];
}

/** Hours to one decimal, dropping a trailing ".0" ("42", "6.5"). */
export function hours(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

/** Both unattributed buckets; the tech rows plus this make `totalRevenue`. */
export function unattributedAmount(r: TechnicianProductivityResponse): number {
  return r.unattributed.noWorkOrder.amount + r.unattributed.noTechArrived.amount;
}

/**
 * Whether the card's total equals Revenue MTD to the cent. The two come from
 * different services, so they can disagree for a few seconds after an
 * invoice is written.
 */
export function matchesRevenueMtd(totalRevenue: number, billed: number): boolean {
  return Math.round(totalRevenue * 100) === Math.round(billed * 100);
}

/** "Sep 14" from a LocalDate, without a timezone shift. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
