// The URL state an analysis report shares: the range (Home's period ids or
// custom dates), the comparison, the scope, and whether Home sent you. Custom
// dates under edit are held here until they make a range the backend takes.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RevenueReportCompare } from '../../api/setup';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { COMPARES, customRangeId, customRangeProblem, defaultRangeId, resolveRange } from './revenueModel';

const DEFAULT_COMPARE: RevenueReportCompare = 'sameDatesLastYear';
export const CUSTOM_RANGE = 'custom';

/** `resetParams`: URL params (a list's page, an open drawer) any new question clears. */
export function useReportRange(resetParams: readonly string[] = []) {
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();

  const range = resolveRange(searchParams.get('range'), today);
  const compareRaw = searchParams.get('compare') as RevenueReportCompare | null;
  const compare = compareRaw && COMPARES.includes(compareRaw) ? compareRaw : DEFAULT_COMPARE;
  const regionId = searchParams.get('region');
  const scope = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);
  const fromHome = searchParams.get('from') === 'home';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    // Cleared first, so a change can set one of them (opening a drill-in).
    for (const p of resetParams) next.delete(p);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const [customDraft, setCustomDraft] = useState<{ from: string; to: string } | null>(null);
  const customProblem =
    customDraft && customDraft.from && customDraft.to ? customRangeProblem(customDraft.from, customDraft.to, today) : null;
  const pickRange = (id: string | null) => {
    if (id === CUSTOM_RANGE) {
      // Start from the range on screen, ending no later than today.
      const to = range.to > today ? today : range.to;
      setCustomDraft(null);
      update({ range: customRangeId(range.from, to) });
    } else update({ range: id && id !== defaultRangeId(today) ? id : null });
  };
  const setCustom = (v: { from: string; to: string }) => {
    setCustomDraft(v);
    if (v.from && v.to && !customRangeProblem(v.from, v.to, today)) {
      setCustomDraft(null);
      update({ range: customRangeId(v.from, v.to) });
    }
  };
  const pickCompare = (v: string | null) => update({ compare: v && v !== DEFAULT_COMPARE ? v : null });

  // Back to Home's Revenue tab on the same period and scope.
  const homeHref = `/dashboard?${new URLSearchParams({
    view: 'rev',
    ...(range.kind === 'period' ? { period: range.id } : {}),
    ...(regionId ? { region: regionId } : {}),
  }).toString()}`;

  return {
    today,
    searchParams,
    range,
    compare,
    regionId,
    scope,
    fromHome,
    homeHref,
    update,
    customDraft,
    customProblem,
    pickRange,
    setCustom,
    pickCompare,
  };
}

export type ReportRangeState = ReturnType<typeof useReportRange>;

/**
 * "vs Sep 2025", or why there's nothing to compare with: none picked, or no
 * data for the window (the server sends no comparison).
 */
export function comparisonLine(
  t: (key: string, options?: Record<string, unknown>) => string,
  windowName: string | null,
  compare: RevenueReportCompare,
  rangeFrom: string,
): string {
  if (windowName) return t('reports.range.vs', { window: windowName });
  if (compare === 'none') return t('reports.range.noComparisonPicked');
  return t(`reports.range.noComparison.${compare}`, { year: Number(rangeFrom.slice(0, 4)) - 1 });
}
