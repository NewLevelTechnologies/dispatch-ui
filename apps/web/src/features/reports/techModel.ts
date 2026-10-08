// The Tech productivity report's shaping: each tech's trend bars and the CSV.
// Every figure is the server's, by Home's credit rules.
import type { TechnicianProductivityResponse, TechnicianProductivityRow } from '../../api/setup';
import { monthShort } from '../home/period';
import { unattributedAmount } from '../home/revenueSelectors';
import { csvLines } from './csv';
import { addDays, formatSpan } from './revenueModel';

/** Past this many weeks a row's trend draws months, or the bars get too thin to read. */
export const MAX_TREND_WEEKS = 26;

export interface TrendBar {
  /** "Sep 1 – 7, 2026" or "Sep 2026". */
  title: string;
  revenue: number;
  jobs: number;
}

/**
 * A tech's trend: their weeks, or with a long range, months (each week in the
 * month it starts in). A job billed in two weeks counts in each, so `jobs` is
 * per bar, never summed.
 */
export function trendBars(weekly: TechnicianProductivityRow['weekly'], asOf: string): TrendBar[] {
  if (weekly.length <= MAX_TREND_WEEKS)
    return weekly.map((w, i) => {
      const next = weekly[i + 1]?.weekStart;
      const end = next ? addDays(next, -1) : asOf;
      return { title: formatSpan(w.weekStart, end < w.weekStart ? w.weekStart : end), revenue: w.revenue, jobs: w.jobs };
    });
  const months = new Map<string, TrendBar>();
  for (const w of weekly) {
    const key = w.weekStart.slice(0, 7);
    const bar = months.get(key) ?? {
      title: `${monthShort(Number(key.slice(5)))} ${key.slice(0, 4)}`,
      revenue: 0,
      jobs: 0,
    };
    bar.revenue += w.revenue;
    bar.jobs += w.jobs;
    months.set(key, bar);
  }
  return [...months.values()];
}

export interface TechCsvLabels {
  headers: string[];
  /** Headers for the comparison columns; used only when there's a comparison. */
  comparisonHeaders: string[];
  name: (name: string | null) => string;
  unattributed: { noWorkOrder: string; noTechArrived: string };
  total: string;
}

const amount = (n: number | null) => (n == null ? null : n.toFixed(2));
const hrs = (n: number) => n.toFixed(1);

/**
 * One row per tech, then the two unattributed amounts and the total, so the
 * revenue column adds up to the total and matches the Revenue report.
 */
export function techCsv(p: TechnicianProductivityResponse, labels: TechCsvLabels): string {
  const cmp = p.comparison != null;
  const rows: (string | number | null)[][] = [[...labels.headers, ...(cmp ? labels.comparisonHeaders : [])]];
  const blank = (n: number) => Array<null>(n).fill(null);
  // Columns after name, jobs and revenue.
  const width = labels.headers.length - 3;
  for (const r of p.technicians)
    rows.push([
      labels.name(r.name),
      r.jobs,
      amount(r.revenue),
      amount(r.averageTicket),
      hrs(r.onSiteHours),
      hrs(r.invoicedHours),
      amount(r.revenuePerInvoicedHour),
      r.firstVisit.eligible,
      r.firstVisit.completed,
      r.callbacks,
      hrs(r.excludedHours.billedLater),
      hrs(r.excludedHours.billedEarlier),
      hrs(r.excludedHours.notBilled),
      hrs(r.excludedHours.agreement),
      ...(cmp
        ? [
            r.comparison?.jobs ?? null,
            amount(r.comparison?.revenue ?? null),
            r.comparison ? hrs(r.comparison.onSiteHours) : null,
            r.comparison?.callbacks ?? null,
          ]
        : []),
    ]);
  const pad = (row: (string | number | null)[]) => [...row, ...blank(rows[0].length - row.length)];
  rows.push(pad([labels.unattributed.noWorkOrder, p.unattributed.noWorkOrder.count, amount(p.unattributed.noWorkOrder.amount)]));
  rows.push(pad([labels.unattributed.noTechArrived, p.unattributed.noTechArrived.count, amount(p.unattributed.noTechArrived.amount)]));
  const totalRow: (string | number | null)[] = [labels.total, null, amount(p.totalRevenue), ...blank(width)];
  if (cmp) totalRow.push(null, amount(p.comparison!.totalRevenue), null, null);
  rows.push(pad(totalRow));
  return csvLines(rows);
}

/** Revenue credited to techs: the total less what no tech earned. */
export const creditedRevenue = (p: TechnicianProductivityResponse) =>
  Math.round((p.totalRevenue - unattributedAmount(p)) * 100) / 100;
