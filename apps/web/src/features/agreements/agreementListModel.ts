// The Agreements page's pure parts: URL state to list params, and how a
// visit's window reads against today.
import type { AgreementListSort, AgreementStatus, ListAgreementsParams } from '../../api/setup';

export const STATUSES: AgreementStatus[] = ['ACTIVE', 'SUSPENDED', 'DRAFT', 'EXPIRED', 'CANCELLED'];

/** What the list shows with no `status` in the URL: the agreements in force. */
export const DEFAULT_STATUSES: AgreementStatus[] = ['ACTIVE'];
/** `?status=any` means every status (the chip's reset). */
export const ANY_STATUS = 'any';

export const STATUS_TONE: Record<AgreementStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};

/** Home's renewing-soon window. */
export const RENEWING_DAYS = 30;

export const SORTS: AgreementListSort[] = ['customerName', 'agreementNumber', 'termEnd', 'monthlyValue'];
/** Amounts and dates read best soonest/largest first on a first click. */
export const DESC_FIRST = new Set<string>(['monthlyValue']);

/** `?status=` (repeated) to the statuses asked for; [] means all. */
export function parseStatuses(raw: string[]): AgreementStatus[] {
  if (raw.includes(ANY_STATUS)) return [];
  const picked = raw.filter((s): s is AgreementStatus => (STATUSES as string[]).includes(s));
  return picked.length ? picked : DEFAULT_STATUSES;
}

export function parseSort(raw: string | null): { key: AgreementListSort; dir: 'asc' | 'desc' } {
  const [key, dir] = (raw ?? '').split(',');
  if ((SORTS as string[]).includes(key)) return { key: key as AgreementListSort, dir: dir === 'desc' ? 'desc' : 'asc' };
  return { key: 'customerName', dir: 'asc' };
}

export function listParams(p: {
  q: string;
  statuses: AgreementStatus[];
  renewing: boolean;
  scope: string[] | undefined;
  sort: string | null;
  page: number;
  size: number;
}): ListAgreementsParams {
  const sort = parseSort(p.sort);
  return {
    q: p.q || undefined,
    // Renewing soon is the overview's rule, which is ACTIVE only.
    status: p.renewing ? undefined : p.statuses,
    renewingWithinDays: p.renewing ? RENEWING_DAYS : undefined,
    regionIds: p.scope,
    sort: `${sort.key},${sort.dir}`,
    page: p.page - 1,
    size: p.size,
  };
}

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
