// Data hook for the agreement Schedule tab + Overview teaser. Fetches both the
// `upcoming` and `recent` visit feeds and partitions by workOrderId, hedging
// against the undocumented `when=upcoming` status predicate (the
// scheduling-service analogue excludes OVERDUE/MISSED from `upcoming`). Dispatch
// enrichment fans out over the materialized rows only, keyed by workOrderId
// (shared with WO caches). Lives in its own (component-free) module so the tab
// file satisfies react-refresh's "only export components" rule.
import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { dispatchesApi, type DispatchBoardRow, type AgreementVisitResponse } from '../../api';
import { agreementVisitsQueryOptions, locationLabel, type LocationMap } from './agreementShared';

export interface ScheduledVisit {
  obligationId: string;
  label: string | null;
  status: AgreementVisitResponse['status'];
  workOrderId: string;
  workOrderNumber: string | null;
  locName: string;
  locSub: string;
  date: string | null; // ISO instant of arrival window start, or null when no dispatch
  tech: string | null;
  live: boolean; // tech on site now (dispatch IN_PROGRESS)
  hasDispatch: boolean;
}

export interface UpcomingPeriod {
  periodKey: string;
  windowStart: string;
  windowEnd: string;
  count: number;
}

// Pick the one dispatch that matters for a WO: on-site now → soonest scheduled →
// most recent otherwise. Mirrors the location-detail precedence rule.
function chooseDispatch(rows: DispatchBoardRow[]): DispatchBoardRow | null {
  if (rows.length === 0) return null;
  const live = rows.find((r) => r.status === 'IN_PROGRESS');
  if (live) return live;
  const scheduled = rows
    .filter((r) => r.status === 'SCHEDULED')
    .sort((a, b) => (a.arrivalWindowStart ?? '').localeCompare(b.arrivalWindowStart ?? ''));
  if (scheduled.length) return scheduled[0];
  return [...rows].sort((a, b) =>
    (b.arrivalWindowStart ?? '').localeCompare(a.arrivalWindowStart ?? ''),
  )[0];
}

export function useAgreementSchedule(agreementId: string, locationMap: LocationMap | undefined) {
  const upcomingQ = useQuery(agreementVisitsQueryOptions(agreementId, 'upcoming', 100));
  const recentQ = useQuery(agreementVisitsQueryOptions(agreementId, 'recent', 20));

  // Dedupe by obligationId across the two feeds.
  const rows = useMemo(() => {
    const byId = new Map<string, AgreementVisitResponse>();
    for (const r of [...(upcomingQ.data ?? []), ...(recentQ.data ?? [])]) {
      byId.set(r.obligationId, r);
    }
    return [...byId.values()];
  }, [upcomingQ.data, recentQ.data]);

  const materialized = useMemo(() => rows.filter((r) => r.workOrderId), [rows]);

  const dispatchQueries = useQueries({
    queries: materialized.map((v) => ({
      queryKey: ['agreement-visit-dispatch', v.workOrderId] as const,
      queryFn: () => dispatchesApi.listForWorkOrder(v.workOrderId!),
      enabled: Boolean(v.workOrderId),
      staleTime: 30 * 1000,
      retry: 1,
    })),
  });

  const scheduled: ScheduledVisit[] = useMemo(() => {
    const list = materialized.map((v, i) => {
      const dispatch = chooseDispatch(dispatchQueries[i]?.data ?? []);
      const loc = locationLabel(locationMap, v.serviceLocationId);
      return {
        obligationId: v.obligationId,
        label: v.visitTemplateLabel,
        status: v.status,
        workOrderId: v.workOrderId!,
        workOrderNumber: dispatch?.workOrderNumber ?? null,
        locName: loc.name,
        locSub: loc.sub,
        date: dispatch?.arrivalWindowStart ?? null,
        tech: dispatch?.assignedUserName ?? null,
        live: dispatch?.status === 'IN_PROGRESS',
        hasDispatch: Boolean(dispatch),
      };
    });
    // Soonest first; rows without a booked date sink to the bottom.
    return list.sort((a, b) => (a.date ?? '~').localeCompare(b.date ?? '~'));
  }, [materialized, dispatchQueries, locationMap]);

  const upcomingPeriods: UpcomingPeriod[] = useMemo(() => {
    const expected = rows.filter((r) => !r.workOrderId);
    const groups = new Map<string, UpcomingPeriod>();
    for (const r of expected) {
      const g = groups.get(r.periodKey);
      if (!g) {
        groups.set(r.periodKey, {
          periodKey: r.periodKey,
          windowStart: r.windowStart,
          windowEnd: r.windowEnd,
          count: 1,
        });
      } else {
        g.count += 1;
        if (r.windowStart < g.windowStart) g.windowStart = r.windowStart;
        if (r.windowEnd > g.windowEnd) g.windowEnd = r.windowEnd;
      }
    }
    return [...groups.values()].sort((a, b) => a.windowStart.localeCompare(b.windowStart));
  }, [rows]);

  return {
    scheduled,
    upcomingPeriods,
    isLoading: upcomingQ.isLoading || recentQ.isLoading,
    isError: upcomingQ.isError && recentQ.isError,
  };
}
