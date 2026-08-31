// Shared query-option factories + derivation helpers for the Service Agreement
// detail page and its Coverage / Schedule tabs. Kept in one module so the page
// shell and the two extracted tab files agree on query keys (react-query
// dedupes by key — the same factory called from two mounted components fires
// one request). UI atoms live in ./agreementCards.
import {
  agreementApi,
  customerApi,
  type ServiceLocation,
  type BillingScheduleResponse,
  type CadenceUnit,
  type AgreementVisitsWhen,
} from '../../api/setup';
import { titleCaseAddress } from '@dispatch/utils';

// id → location, for resolving the bare serviceLocationId on coverage + visit
// rows to a human label without an N+1 storm. One customer-scoped list call.
export type LocationMap = Map<string, ServiceLocation>;

// ── Query-option factories ───────────────────────────────────────────────────

export function agreementCoverageQueryOptions(id: string) {
  return {
    queryKey: ['agreement', id, 'coverage'] as const,
    queryFn: () => agreementApi.getCoverage(id),
    enabled: Boolean(id),
  };
}

export function agreementVisitsQueryOptions(id: string, when: AgreementVisitsWhen, limit = 100) {
  return {
    queryKey: ['agreement', id, 'visits', when] as const,
    queryFn: () => agreementApi.getVisits(id, { when, limit }),
    enabled: Boolean(id),
  };
}

// Compliance (PR3) + billing-schedule (PR4) are pending-merge — a 404 is
// deterministic (not transient), so retry:false and let the query land in
// isError. Callers branch on isSuccess and HIDE the figure (never show 0/0 or
// $0). "Not deployed" and "not configured" 404s render identically.
export function agreementComplianceQueryOptions(id: string) {
  return {
    queryKey: ['agreement', id, 'compliance'] as const,
    queryFn: () => agreementApi.getCompliance(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60 * 1000,
  };
}

export function agreementBillingQueryOptions(id: string) {
  return {
    queryKey: ['agreement', id, 'billing-schedule'] as const,
    queryFn: () => agreementApi.getBillingSchedule(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60 * 1000,
  };
}

// Recognized/deferred — point-in-time, so a short staleTime; 404 (no billing)
// is deterministic, so retry:false and the card hides the row.
export function agreementRevenueQueryOptions(id: string) {
  return {
    queryKey: ['agreement', id, 'revenue-recognition'] as const,
    queryFn: () => agreementApi.getRevenueRecognition(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 60 * 1000,
  };
}

// One customer-scoped location list → id→location Map (memoized via select, so
// it's shared by the Coverage + Schedule tabs). customerId comes from
// AgreementResponse.customer.id.
export function agreementLocationsQueryOptions(customerId: string) {
  return {
    queryKey: ['agreement-locations', customerId] as const,
    queryFn: () => customerApi.getServiceLocations(customerId),
    enabled: Boolean(customerId),
    staleTime: 5 * 60 * 1000,
    select: (rows: ServiceLocation[]): LocationMap =>
      new Map(rows.map((l) => [l.id, l])),
  };
}

// ── Derivation helpers ───────────────────────────────────────────────────────

export function periodsPerYear(unit: CadenceUnit, interval = 1): number {
  const base = unit === 'WEEK' ? 52 : unit === 'MONTH' ? 12 : unit === 'QUARTER' ? 4 : 1;
  return interval > 0 ? base / interval : base;
}

// ARR is only derivable from a FIXED_SCHEDULE periodic amount. PER_VISIT has no
// fixed periodic figure (amount is per-visit) → null, and the UI shows "Per visit".
export function computeArr(b: BillingScheduleResponse): number | null {
  if (b.billingMode !== 'FIXED_SCHEDULE') return null;
  return b.amount * periodsPerYear(b.cadenceUnit, b.cadenceInterval);
}

const CADENCE_ADVERB: Record<CadenceUnit, string> = {
  WEEK: 'Weekly',
  MONTH: 'Monthly',
  QUARTER: 'Quarterly',
  YEAR: 'Annually',
};
const CADENCE_ABBR: Record<CadenceUnit, string> = {
  WEEK: 'wk',
  MONTH: 'mo',
  QUARTER: 'qtr',
  YEAR: 'yr',
};

export function cadenceLabel(unit: CadenceUnit, interval = 1): string {
  if (interval === 1) return CADENCE_ADVERB[unit];
  return `Every ${interval} ${unit.toLowerCase()}s`;
}

export function cadenceAbbr(unit: CadenceUnit): string {
  return CADENCE_ABBR[unit];
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatCurrency(amount?: number | null): string {
  if (amount == null) return '—';
  return usd.format(amount);
}

// Parse a date-only string (YYYY-MM-DD) without the UTC-midnight off-by-one that
// `new Date('2026-07-01')` causes in negative timezones. Full ISO instants
// (dispatch windows) fall through to the native parser.
function toLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

export function formatDay(value?: string | null): string {
  if (!value) return '—';
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDayNoYear(value?: string | null): string {
  if (!value) return '—';
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatWindow(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  if (!end) return formatDay(start);
  return `${formatDayNoYear(start)} – ${formatDay(end)}`;
}

// Whole days from today until `value` (date-only safe). Negative = past.
export function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - a.getTime()) / 86_400_000);
}

// Resolve a serviceLocationId to a display label, tolerating a not-yet-loaded
// map or a membership that outlived a deleted location. `sub` is the full
// address, title-cased (DB stores it uppercase) — same shape as the canonical
// location list: "<street> · <city>, ST <zip>".
export function locationLabel(map: LocationMap | undefined, id: string): { name: string; sub: string } {
  const loc = map?.get(id);
  if (!loc) return { name: `Location ${id.slice(0, 8)}`, sub: '' };
  const a = loc.address;
  const street = titleCaseAddress([a?.streetAddress, a?.streetAddressLine2].filter(Boolean).join(' '));
  // State code stays as-is (titleCaseAddress would lower-case "GA").
  const cityLine = [titleCaseAddress(a?.city), [a?.state, a?.zipCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  if (loc.locationName) {
    return { name: loc.locationName, sub: [street, cityLine].filter(Boolean).join(' · ') };
  }
  // No name → lead with the street; drop it from the sub so it isn't repeated.
  return { name: street || `Location ${id.slice(0, 8)}`, sub: cityLine };
}
