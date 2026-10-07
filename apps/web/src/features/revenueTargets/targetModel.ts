// Company-wide monthly revenue targets: the pure math behind the settings
// panel and the Revenue tab's target line. A month with no target is null,
// never 0, everywhere here — a blank month draws no rule and scores nothing.
// Targets are measured against the same `billed` the Revenue KPI shows.
import type { DailyAmount, RevenueTargets } from '../../api/setup';

export type MonthAmounts = (number | null)[];

/** The backend's upper bound for one month. */
export const MAX_TARGET = 1_000_000_000;

export const EMPTY_YEAR: MonthAmounts = Array.from({ length: 12 }, () => null);

/** Twelve amounts, January first, from a GET (null where unset). */
export function targetAmounts(targets: RevenueTargets | undefined): MonthAmounts {
  if (!targets) return EMPTY_YEAR;
  const out = [...EMPTY_YEAR];
  for (const m of targets.months) if (m.month >= 1 && m.month <= 12) out[m.month - 1] = m.amount;
  return out;
}

export function isEmptyYear(amounts: MonthAmounts): boolean {
  return amounts.every((a) => a == null);
}

export function countSet(amounts: MonthAmounts): number {
  return amounts.filter((a) => a != null).length;
}

export function sumSet(amounts: MonthAmounts): number {
  return amounts.reduce<number>((s, a) => s + (a ?? 0), 0);
}

const ymd = (date: string) => date.slice(0, 10).split('-').map(Number) as [number, number, number];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Where a month sits against the tenant's today. */
export type MonthStatus = 'closed' | 'current' | 'open';

export function monthStatus(year: number, month: number, today: string): MonthStatus {
  const [ty, tm] = ymd(today);
  if (year < ty || (year === ty && month < tm)) return 'closed';
  return year === ty && month === tm ? 'current' : 'open';
}

/** Billing summed by calendar month; null for months the days don't reach. */
export function monthlyActuals(billedByDay: DailyAmount[]): MonthAmounts {
  const out = [...EMPTY_YEAR];
  for (const d of billedByDay) {
    const i = Number(d.date.slice(5, 7)) - 1;
    out[i] = (out[i] ?? 0) + d.amount;
  }
  return out;
}

/**
 * The full period's target (a current period still compares against all of
 * it: "$38k of $165k"), or null unless every month it spans has one. Periods
 * never cross a year, so one year's amounts cover them.
 */
export function periodTarget(periodStart: string, periodEnd: string, amounts: MonthAmounts): number | null {
  const [, from] = ymd(periodStart);
  const [, to] = ymd(periodEnd);
  let total = 0;
  for (let m = from; m <= to; m++) {
    const a = amounts[m - 1];
    if (a == null) return null;
    total += a;
  }
  return total;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * A weekly bucket's share of its month's target, by days: bucket `index` runs
 * from day index×7+1 for 7 days (the last one shorter), as `revenueWeeks`
 * draws them. Null when the month has no target.
 */
export function weekTarget(index: number, asOf: string, monthAmount: number | null): number | null {
  if (monthAmount == null) return null;
  const [y, m] = ymd(asOf);
  const last = daysInMonth(y, m);
  const start = index * 7 + 1;
  const end = Math.min(start + 6, last);
  return cents((monthAmount * (end - start + 1)) / last);
}

/** "N of M hit target": complete buckets that have a target, and how many of those hit it. */
export function hitCount(bars: { amount: number; target: number | null; partial: boolean }[]): {
  hit: number;
  of: number;
} {
  const scored = bars.filter((b) => !b.partial && b.target != null);
  return { hit: scored.filter((b) => b.amount >= (b.target as number)).length, of: scored.length };
}

// ── Quick fill (draft only; nothing saves until Save) ─────────────────────

const toThousand = (n: number) => Math.round(n / 1000) * 1000;

/**
 * Last year's months plus a growth %, rounded to $1,000. `undefined` where
 * the source has nothing (or rounds to $0, which isn't a target), so those
 * months are left as they are.
 */
export function fillFromSource(source: MonthAmounts, growthPct: number): (number | undefined)[] {
  const g = 1 + growthPct / 100;
  return source.map((v) => {
    const next = v == null ? 0 : toThousand(v * g);
    return next > 0 ? next : undefined;
  });
}

/**
 * A yearly total spread across the months — shaped like `shape` (last year's
 * actuals) or evenly when it's null — rounded to $1,000, with the remainder in
 * December so the twelve sum to the total exactly.
 */
export function spreadTotal(total: number, shape: number[] | null): number[] {
  const base = shape && shape.length === 12 && sumSet(shape) > 0 ? shape : Array.from({ length: 12 }, () => 1);
  const weight = sumSet(base);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    const v = i === 11 ? total - acc : toThousand((total * base[i]) / weight);
    out.push(v);
    acc += v;
  }
  return out;
}

/** Writes filled values into the draft, skipping `undefined` and any month `skip` marks. */
export function applyFill(draft: MonthAmounts, values: (number | undefined)[], skip: (month: number) => boolean): MonthAmounts {
  return draft.map((v, i) => {
    const next = values[i];
    return next === undefined || skip(i + 1) ? v : next;
  });
}

/** The draft's months that differ from what's saved. */
export function changedMonths(draft: MonthAmounts, saved: MonthAmounts): boolean[] {
  return draft.map((v, i) => v !== saved[i]);
}

export type AmountProblem = 'zero' | 'tooLarge';

/** Same rules as the backend, so a save rarely bounces. Blank is fine. */
export function amountProblem(amount: number | null): AmountProblem | null {
  if (amount == null) return null;
  if (amount <= 0) return 'zero';
  if (amount > MAX_TARGET) return 'tooLarge';
  return null;
}

/** "+8.0%" / "−3.2%" (true minus), or null without both sides. */
export function signedPct(value: number | null, base: number | null): string | null {
  if (value == null || base == null || base === 0) return null;
  const d = ((value - base) / base) * 100;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`;
}
