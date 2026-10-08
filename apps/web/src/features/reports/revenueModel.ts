// The Revenue report's date math and shaping. Every figure comes from the
// server; this only picks the range to ask for, buckets the daily amounts
// for the chart, names things and writes the CSV.
import type {
  DailyAmount,
  InvoiceListItemRow,
  ListInvoicesParams,
  RevenueReport,
  RevenueReportCompare,
  RevenueReportGroupBy,
} from '../../api/setup';
import { monthShort, parsePeriod, periodGroups, periodName, type Period } from '../home/period';

export const COMPARES: RevenueReportCompare[] = ['sameDatesLastYear', 'previousPeriod', 'none'];
export const GROUP_BYS: RevenueReportGroupBy[] = ['division', 'workOrderType', 'region', 'none'];

/** The longest range the backend accepts, in years. */
export const MAX_RANGE_YEARS = 3;

/**
 * A report range. A period uses Home's ids (`2026-09`, `2026-Q3`, `2026-YTD`,
 * `2025`) so a link from Home names exactly what Home showed; a custom range
 * is `2026-09-08..2026-10-04`. Both are absolute, so a shared link never
 * changes meaning.
 */
export type ReportRange =
  | { id: string; kind: 'period'; period: Period; from: string; to: string }
  | { id: string; kind: 'custom'; from: string; to: string };

const CUSTOM = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (day: string) => new Date(`${day}T00:00:00Z`);

export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

function addYears(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  // Feb 29 lands on Feb 28 rather than rolling into March.
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${pad(m)}-${pad(Math.min(d, last))}`;
}

const lastOfMonth = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 0)));

/** The days a period covers if it runs its course; the server cuts `to` at today. */
export function periodDates(p: Period): { from: string; to: string } {
  switch (p.kind) {
    case 'month':
      return { from: `${p.year}-${pad(p.month!)}-01`, to: lastOfMonth(p.year, p.month!) };
    case 'quarter': {
      const first = (p.quarter! - 1) * 3 + 1;
      return { from: `${p.year}-${pad(first)}-01`, to: lastOfMonth(p.year, first + 2) };
    }
    case 'ytd':
    case 'year':
      return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
  }
}

/** Why a custom range can't be asked for, or null when it can. */
export function customRangeProblem(from: string, to: string, today: string): 'order' | 'future' | 'tooLong' | null {
  if (to < from) return 'order';
  if (from > today) return 'future';
  if (to >= addYears(from, MAX_RANGE_YEARS)) return 'tooLong';
  return null;
}

export const customRangeId = (from: string, to: string) => `${from}..${to}`;

/** Last month: reports answer "how did it go", so a finished period leads. */
export function defaultRangeId(today: string): string {
  return periodGroups(today)[0].options[1].id;
}

/** The range the URL asks for, or the default when it asks for nothing usable. */
export function resolveRange(raw: string | null, today: string): ReportRange {
  const custom = raw ? CUSTOM.exec(raw) : null;
  if (custom && !customRangeProblem(custom[1], custom[2], today))
    return { id: raw!, kind: 'custom', from: custom[1], to: custom[2] };
  const period = raw ? parsePeriod(raw) : null;
  if (period) {
    const dates = periodDates(period);
    if (dates.from <= today) return { id: raw!, kind: 'period', period, ...dates };
  }
  const fallback = parsePeriod(defaultRangeId(today))!;
  return { id: fallback.id, kind: 'period', period: fallback, ...periodDates(fallback) };
}

/** "Sep 8 – Oct 4, 2026", "Sep 1 – 30, 2026", "Dec 1, 2025 – Jan 31, 2026". */
export function formatSpan(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (from === to) return `${monthShort(fm)} ${fd}, ${fy}`;
  if (fy !== ty) return `${monthShort(fm)} ${fd}, ${fy} – ${monthShort(tm)} ${td}, ${ty}`;
  if (fm === tm) return `${monthShort(fm)} ${fd} – ${td}, ${fy}`;
  return `${monthShort(fm)} ${fd} – ${monthShort(tm)} ${td}, ${fy}`;
}

/** The range's name: the period's ("September 2026", "Q3 2026", "2026") or its dates. */
export function rangeName(range: ReportRange): string {
  return range.kind === 'period' ? periodName(range.period) : formatSpan(range.from, range.to);
}

/**
 * A window's short name for "vs …": a whole month, quarter or year by name
 * ("Aug 2026", "Q2 2026", "2025"), anything else by its dates.
 */
export function windowName(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (fd === 1 && fy === ty && to === lastOfMonth(ty, tm)) {
    if (fm === tm) return `${monthShort(fm)} ${fy}`;
    if (fm === 1 && tm === 12) return String(fy);
    if (tm === fm + 2 && (fm - 1) % 3 === 0) return `Q${(fm - 1) / 3 + 1} ${fy}`;
  }
  return formatSpan(from, to);
}

export type ChartUnit = 'day' | 'week' | 'month';

/** ≤45 days → daily, ≤~6 months → weekly, longer → monthly. */
export function chartUnit(days: number): ChartUnit {
  return days <= 45 ? 'day' : days <= 190 ? 'week' : 'month';
}

export interface ChartBucket {
  /** Under the bar: the day of month, the week's first day, or the month. */
  label: string;
  /** The exact dates, for the hover title. */
  title: string;
  amount: number;
  weekend: boolean;
  /** A daily chart's first day of a month after the first: it gets a rule and the month's name. */
  monthStart: boolean;
}

/**
 * The chart's bars from the daily amounts. Weeks run in sevens from the
 * range's first day, the way Home's month chart does; months are calendar
 * months.
 */
export function buckets(days: DailyAmount[], unit: ChartUnit): ChartBucket[] {
  if (unit === 'day')
    return days.map((d, i) => {
      const [y, m, day] = d.date.split('-').map(Number);
      const dow = utc(d.date).getUTCDay();
      return {
        label: String(day),
        title: `${monthShort(m)} ${day}, ${y}`,
        amount: d.amount,
        weekend: dow === 0 || dow === 6,
        monthStart: day === 1 && i > 0,
      };
    });
  const keyOf = (d: DailyAmount, i: number) => (unit === 'week' ? String(Math.floor(i / 7)) : d.date.slice(0, 7));
  const groups: { key: string; first: string; last: string; amount: number }[] = [];
  days.forEach((d, i) => {
    const key = keyOf(d, i);
    const prev = groups[groups.length - 1];
    if (prev?.key === key) {
      prev.last = d.date;
      prev.amount += d.amount;
    } else groups.push({ key, first: d.date, last: d.date, amount: d.amount });
  });
  return groups.map((g) => {
    const [y, m, day] = g.first.split('-').map(Number);
    return unit === 'week'
      ? { label: `${monthShort(m)} ${day}`, title: formatSpan(g.first, g.last), amount: g.amount, weekend: false, monthStart: false }
      : { label: monthShort(m), title: `${monthShort(m)} ${y}`, amount: g.amount, weekend: false, monthStart: false };
  });
}

/**
 * The days the chart's ghost bars come from. A daily chart against last year
 * lines up the same weekday (364 days back), so Saturdays sit behind
 * Saturdays; everything else lines up by bucket against the comparison
 * window. The summary and table always use the calendar comparison.
 */
export function ghostWindow(report: RevenueReport, unit: ChartUnit): { from: string; to: string; sameWeekdays: boolean } | null {
  const c = report.comparison;
  if (!c) return null;
  if (unit === 'day' && c.basis === 'sameDatesLastYear')
    return { from: addDays(report.from, -364), to: addDays(report.to, -364), sameWeekdays: true };
  return { from: c.from, to: c.to, sameWeekdays: false };
}

/** Signed change to one decimal ("+4.2%", "−3.0%"), or null with nothing to compare. */
export function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const formatPct = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;

/** The report's invoice list's page param (`?page=`). */
export const INVOICE_PAGE_PARAM = 'page';

/** The report's base list filter: billed invoices in its dates and scope. */
export function reportInvoiceParams(
  report: Pick<RevenueReport, 'from' | 'to'>,
  scope: string[] | undefined,
): ListInvoicesParams {
  return { billed: true, from: report.from, to: report.to, regionIds: scope, sort: 'invoiceDate,desc' };
}

/** The invoice-list filter for one group: the drill-down rule, so its count matches the group's. */
export function groupFilter(groupBy: RevenueReportGroupBy, id: string | null): Partial<ListInvoicesParams> {
  switch (groupBy) {
    case 'division':
      return id ? { divisionIds: [id] } : { noDivision: true };
    case 'workOrderType':
      return id ? { workOrderTypeIds: [id] } : { noWorkOrderType: true };
    case 'region':
      return id ? { regionIds: [id] } : { noRegion: true };
    default:
      return {};
  }
}

/** The invoices page's URL param for a group (`division`, `type`, `region`; `none` = unassigned). */
const GROUP_PARAM: Record<Exclude<RevenueReportGroupBy, 'none'>, string> = {
  division: 'division',
  workOrderType: 'type',
  region: 'region',
};

/** The invoices list holding exactly a group's invoices (or the whole report's). */
export function invoicesHref(
  report: Pick<RevenueReport, 'from' | 'to'>,
  scope: string[] | undefined,
  group?: { groupBy: RevenueReportGroupBy; id: string | null },
): string {
  const q = new URLSearchParams({ status: 'billed', from: report.from, to: report.to });
  if (scope?.length) q.set('region', scope[0]);
  // A region group replaces the scope: it's one of the scope's regions anyway.
  if (group && group.groupBy !== 'none') q.set(GROUP_PARAM[group.groupBy], group.id ?? 'none');
  return `/invoices?${q.toString()}`;
}

export interface CsvLabels {
  headers: [string, string, string, string, string, string, string, string, string, string];
  division: (id: string | null) => string;
  type: (id: string | null) => string;
  region: (id: string | null) => string;
}

const csvCell = (v: string | number | null) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const amount = (n: number) => n.toFixed(2);

/**
 * One row per invoice, a plain header row and nothing above it, so it sorts
 * in a spreadsheet and maps in an import tool. Group values are columns, so
 * any grouping can be rebuilt from the file.
 */
export function revenueCsv(rows: InvoiceListItemRow[], labels: CsvLabels): string {
  const lines = [labels.headers.map(csvCell).join(',')];
  for (const r of rows)
    lines.push(
      [
        r.invoiceNumber,
        r.invoiceDate,
        r.customerName,
        r.workOrderNumber,
        labels.division(r.divisionId),
        labels.type(r.workOrderTypeId),
        labels.region(r.regionId),
        amount(r.subtotal),
        amount(r.taxAmount),
        amount(r.totalAmount),
      ]
        .map(csvCell)
        .join(','),
    );
  return lines.join('\r\n') + '\r\n';
}
