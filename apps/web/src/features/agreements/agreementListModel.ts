// The Agreements page's pure parts: URL state to list params, how amounts and
// dates read on a row, and how a visit's window reads against today.
import type { AgreementListSort, AgreementStatus, CadenceUnit, ListAgreementsParams } from '../../api/setup';

export const STATUSES: AgreementStatus[] = ['ACTIVE', 'SUSPENDED', 'DRAFT', 'EXPIRED', 'CANCELLED'];

/** What the list shows with no `status` in the URL: the agreements in force. */
export const DEFAULT_STATUSES: AgreementStatus[] = ['ACTIVE'];
/** `?status=any` means every status (the picker's "All"). */
export const ANY_STATUS = 'any';
/** `?plan=none` means custom agreements, sold from no plan. */
export const NO_PLAN = 'none';

/** Home's renewing-soon window. */
export const RENEWING_DAYS = 30;

export const SORTS: AgreementListSort[] = ['customerName', 'agreementNumber', 'termEnd', 'monthlyValue'];
/** Amounts read best largest first on a first click. */
export const DESC_FIRST = new Set<string>(['monthlyValue']);

export const isEnded = (s: AgreementStatus) => s === 'EXPIRED' || s === 'CANCELLED';

/** `?status=` (repeated) to the statuses asked for; [] means all. */
export function parseStatuses(raw: string[]): AgreementStatus[] {
  if (raw.includes(ANY_STATUS)) return [];
  const picked = raw.filter((s): s is AgreementStatus => (STATUSES as string[]).includes(s));
  return picked.length ? picked : DEFAULT_STATUSES;
}

/**
 * The sort asked for, else Customer A–Z — or soonest renewal first when the
 * list is narrowed to the ones renewing, since that's the order to work them.
 */
export function parseSort(
  raw: string | null,
  renewing = false,
): { key: AgreementListSort; dir: 'asc' | 'desc' } {
  const [key, dir] = (raw ?? '').split(',');
  if ((SORTS as string[]).includes(key)) return { key: key as AgreementListSort, dir: dir === 'desc' ? 'desc' : 'asc' };
  return { key: renewing ? 'termEnd' : 'customerName', dir: 'asc' };
}

export interface ListFilters {
  q: string;
  statuses: AgreementStatus[];
  /** A plan id, NO_PLAN, or null for any plan. */
  plan: string | null;
  renewing: boolean;
  visitsBehind: boolean;
  noBilling: boolean;
}

/** The list's URL state. Flags read `renewing=30`, `visits=behind`, `billing=none`. */
export function parseFilters(params: URLSearchParams, q = params.get('q') ?? ''): ListFilters {
  return {
    q,
    statuses: parseStatuses(params.getAll('status')),
    plan: params.get('plan') || null,
    renewing: params.get('renewing') === String(RENEWING_DAYS),
    visitsBehind: params.get('visits') === 'behind',
    noBilling: params.get('billing') === 'none',
  };
}

/** Anything narrowing the list past the default status. */
export const hasNarrowing = (f: ListFilters) => Boolean(f.q || f.plan || f.renewing || f.visitsBehind || f.noBilling);

/** The params that clear every filter but status. */
export const CLEAR_FILTERS = { q: null, plan: null, renewing: null, visits: null, billing: null } as const;

export function listParams(
  f: ListFilters,
  p: { scope: string[] | undefined; sort: string | null; page: number; size: number },
): ListAgreementsParams {
  const sort = parseSort(p.sort, f.renewing);
  return {
    q: f.q || undefined,
    status: f.statuses,
    planId: f.plan && f.plan !== NO_PLAN ? [f.plan] : undefined,
    noPlan: f.plan === NO_PLAN || undefined,
    renewingWithinDays: f.renewing ? RENEWING_DAYS : undefined,
    visitsBehind: f.visitsBehind || undefined,
    noBilling: f.noBilling || undefined,
    regionIds: p.scope,
    sort: `${sort.key},${sort.dir}`,
    page: p.page - 1,
    size: p.size,
  };
}

const CADENCE_SHORT: Record<CadenceUnit, string> = { WEEK: 'wk', MONTH: 'mo', QUARTER: 'qtr', YEAR: 'yr' };

/** The real cadence beneath the /mo figure: "/ qtr", "/ 2 mo". */
export function cadenceSuffix(unit: CadenceUnit, interval: number): string {
  return interval > 1 ? `/ ${interval} ${CADENCE_SHORT[unit]}` : `/ ${CADENCE_SHORT[unit]}`;
}

/** Days from today to a term end; negative once it has passed. */
export const daysUntil = (day: string, today: string) => daysBetween(today, day);

const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86_400_000);

/**
 * Where a visit's window stands today: closed (`overdue`, by how many days),
 * open now, or opening in N days.
 */
export function windowState(
  windowStart: string,
  windowEnd: string,
  today: string,
): { kind: 'overdue' | 'open' | 'upcoming'; days: number } {
  if (windowEnd < today) return { kind: 'overdue', days: daysBetween(windowEnd, today) };
  if (windowStart <= today) return { kind: 'open', days: daysBetween(today, windowEnd) };
  return { kind: 'upcoming', days: daysBetween(today, windowStart) };
}

/** "Oct 1 – 31", "Sep 28 – Oct 4", "Dec 20, 2026 – Jan 10, 2027". */
export function formatWindowDates(from: string, to: string, today: string): string {
  const fmt = (day: string, year: boolean) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  const thisYear = today.slice(0, 4);
  const withYear = from.slice(0, 4) !== to.slice(0, 4) || from.slice(0, 4) !== thisYear;
  if (from === to) return fmt(from, withYear);
  if (!withYear && from.slice(0, 7) === to.slice(0, 7)) return `${fmt(from, false)} – ${Number(to.slice(8))}`;
  return `${fmt(from, withYear)} – ${fmt(to, withYear)}`;
}

/** "Mar 31, 2027", or null. */
export function formatDay(day: string | null | undefined): string | null {
  if (!day) return null;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** What the dialog needs from either the list row or the full agreement. */
export interface RenewableAgreement {
  id: string;
  agreementNumber: string;
  customer: { name: string };
  status: AgreementStatus;
  termStart?: string | null;
  termEnd?: string | null;
  renewalTermMonths?: number | null;
  nextTermEnd?: string | null;
  nextTermBillingAmount?: number | null;
}

/** Renewable from ACTIVE or EXPIRED, and only with a term end to renew from. */
export function canRenew(a: Pick<RenewableAgreement, 'status' | 'termEnd'>): boolean {
  return Boolean(a.termEnd) && (a.status === 'ACTIVE' || a.status === 'EXPIRED');
}

/** `day` plus `months`, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The new term's default end: the renewal term on file, else the current term's length again, else a year. */
export function defaultRenewalEnd(a: RenewableAgreement): string {
  const termEnd = a.termEnd!;
  let months = a.renewalTermMonths ?? 0;
  if (!months && a.termStart) {
    const [y1, m1] = a.termStart.split('-').map(Number);
    const [y2, m2] = termEnd.split('-').map(Number);
    months = (y2 - y1) * 12 + (m2 - m1);
  }
  return addMonths(termEnd, months > 0 ? months : 12);
}
