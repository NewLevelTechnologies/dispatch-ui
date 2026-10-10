// The Receivables report's pure parts: which date it's as of (from the URL),
// the buckets in order with their list filter, and the CSV. Every figure is
// the server's; the open set and aging are the backend's rule.
import type { InvoiceAgingBucket, InvoiceListItemRow, ReceivablesReport } from '../../api/setup';
import { monthShort } from '../home/period';
import { csvLines } from './csv';
import { addDays } from './revenueModel';

export type AsOfPreset = 'today' | 'lastMonthEnd' | 'lastQuarterEnd' | 'lastYearEnd';
export const AS_OF_PRESETS: AsOfPreset[] = ['lastMonthEnd', 'today', 'lastQuarterEnd', 'lastYearEnd'];
/** Month-end close is what this report is for, so last month's end leads. */
export const DEFAULT_AS_OF: AsOfPreset = 'lastMonthEnd';

export interface AsOf {
  /** A preset, or `date` for one picked. */
  kind: AsOfPreset | 'date';
  date: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

export function presetDate(p: AsOfPreset, today: string): string {
  const [y, m] = today.split('-').map(Number);
  switch (p) {
    case 'today':
      return today;
    case 'lastMonthEnd':
      return addDays(`${y}-${pad(m)}-01`, -1);
    case 'lastQuarterEnd':
      return addDays(`${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, -1);
    case 'lastYearEnd':
      return `${y - 1}-12-31`;
  }
}

/** `?asOf=` to the date asked for: a preset, a past or present day, or the default. */
export function resolveAsOf(raw: string | null, today: string): AsOf {
  if (raw && (AS_OF_PRESETS as string[]).includes(raw))
    return { kind: raw as AsOfPreset, date: presetDate(raw as AsOfPreset, today) };
  if (raw && DAY.test(raw) && raw <= today) return { kind: 'date', date: raw };
  return { kind: DEFAULT_AS_OF, date: presetDate(DEFAULT_AS_OF, today) };
}

/** "Sep 30, 2026". */
export function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${monthShort(m)} ${d}, ${y}`;
}

export type BucketKey = 'current' | 'days1To30' | 'days31To60' | 'days61To90' | 'days91Plus';

/** The report's buckets in age order, each with the list filter that holds its invoices. */
export const BUCKETS: { key: BucketKey; filter: InvoiceAgingBucket; tone: 'success' | 'warning' | 'danger' }[] = [
  { key: 'current', filter: 'CURRENT', tone: 'success' },
  { key: 'days1To30', filter: 'DAYS_1_30', tone: 'warning' },
  { key: 'days31To60', filter: 'DAYS_31_60', tone: 'danger' },
  { key: 'days61To90', filter: 'DAYS_61_90', tone: 'danger' },
  { key: 'days91Plus', filter: 'DAYS_91_PLUS', tone: 'danger' },
];

export const bucketByFilter = (filter: string | null) => BUCKETS.find((b) => b.filter === filter) ?? null;

/** Open invoices' count: the five buckets. */
export const openCount = (r: ReceivablesReport) => BUCKETS.reduce((sum, b) => sum + r[b.key].count, 0);

/** Days past due on `asOf` (0 or less is current). */
export function daysPastDue(dueDate: string, asOf: string): number {
  return Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
}

/** The bucket an invoice sits in on `asOf`, by days past due. */
export function bucketOn(dueDate: string, asOf: string): BucketKey {
  const days = daysPastDue(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return 'days1To30';
  if (days <= 60) return 'days31To60';
  if (days <= 90) return 'days61To90';
  return 'days91Plus';
}

export interface ReceivablesCsvLabels {
  headers: string[];
  bucket: (key: BucketKey) => string;
  region: (id: string | null) => string;
}

const amount = (n: number) => n.toFixed(2);

/**
 * One row per invoice open on `asOf`, oldest due first, with its age and
 * bucket on that date, and its balance at the end of it.
 */
export function receivablesCsv(rows: InvoiceListItemRow[], asOf: string, labels: ReceivablesCsvLabels): string {
  return csvLines([
    labels.headers,
    ...rows.map((r) => [
      r.invoiceNumber,
      r.invoiceDate,
      r.dueDate,
      Math.max(0, daysPastDue(r.dueDate, asOf)),
      labels.bucket(bucketOn(r.dueDate, asOf)),
      r.customerName,
      r.workOrderNumber,
      labels.region(r.regionId),
      amount(r.totalAmount),
      amount(r.balanceAsOf ?? r.balanceDue),
    ]),
  ]);
}
