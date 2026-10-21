// The reads behind "My day". Every one is scoped to the signed-in user and
// is an existing endpoint; the page adds no new stored state.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  dispatchesApi,
  quotesApi,
  workItemStatusesApi,
  workOrderApi,
  type DispatchBoardRow,
  type DispatchStatus,
  type ProgressCategory,
} from '../../api/setup';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { shiftDay } from '../../lib/boardMove';
import { zonedIso } from '../../lib/zonedTime';
import { PENDING_PARTS_CODE } from '../../lib/workItemStatusTargets';
import { errorCode, extractApiError, isConflict, showError } from '../../lib/toast';
import { invalidateDispatchConsumers } from '../../utils/invalidateRoleConsumers';
import { routeStops } from './myDayModel';

// A tech's day changes under them — the dispatcher moves, releases and
// cancels — so the route polls like the home board does.
const POLL_MS = 60_000;
const OPEN_CATEGORIES: ProgressCategory[] = ['NOT_STARTED', 'AWAITING_SCHEDULE', 'IN_PROGRESS', 'BLOCKED'];
const CARRYOVER_LIMIT = 5;

/** The tenant-local calendar day, so "today" is the truck's day, not the
 *  browser's. */
export function useMyDayDates() {
  const timeZone = useTenantTimeZone();
  const today = zonedDate(new Date(), timeZone) ?? new Date().toISOString().slice(0, 10);
  return { timeZone, today, tomorrow: shiftDay(today, 1) };
}

/** My released, non-cancelled dispatches on `date`, in arrival order. */
export function useDayStops(userId: string | undefined, date: string, timeZone: string) {
  const query = useQuery({
    // Under ['dispatches'] so invalidateDispatchConsumers refreshes it after
    // any dispatch write — here, on the board, or on the work order.
    queryKey: ['dispatches', 'my-day', userId, date, timeZone],
    queryFn: () =>
      dispatchesApi.getAll({
        assignedUserId: userId,
        from: zonedIso(date, 0, timeZone),
        to: zonedIso(date, 24, timeZone),
        sort: 'arrivalWindowStart,asc',
        size: 200,
      }),
    enabled: !!userId,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const stops = useMemo(() => routeStops(query.data?.content ?? []), [query.data]);
  return { ...query, stops };
}

/** The focus stop's work order — the address to navigate to, the person to
 *  call and the priority, none of which the dispatch row carries. */
export function useFocusWorkOrder(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['work-orders', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId!),
    enabled: !!workOrderId,
  });
}

/** Carry-over: open work orders of mine waiting on parts, and quotes I sent
 *  that the customer hasn't answered. Each is one selector over existing
 *  records. Work already on today's route is left to the route. */
export function useCarryover(userId: string | undefined, onRouteWorkOrderIds: ReadonlySet<string>) {
  const { data: statuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });
  const pendingPartsId = statuses?.find((s) => s.code === PENDING_PARTS_CODE)?.id;

  const awaitingParts = useQuery({
    queryKey: ['work-orders-list', 'my-day', 'awaiting-parts', userId, pendingPartsId],
    queryFn: () =>
      workOrderApi.getAll({
        assignedUserId: userId,
        workItemStatusIds: [pendingPartsId!],
        lifecycleState: 'ACTIVE',
        progressCategory: OPEN_CATEGORIES,
        size: CARRYOVER_LIMIT + onRouteWorkOrderIds.size,
      }),
    enabled: !!userId && !!pendingPartsId,
  });

  const quotes = useQuery({
    queryKey: ['quotes', 'my-day', 'sent', userId],
    queryFn: () =>
      quotesApi.getAll({ status: ['SENT'], sentByUserId: userId, size: CARRYOVER_LIMIT, sort: 'lastSentAt,desc' }),
    enabled: !!userId,
  });

  return {
    awaitingParts: (awaitingParts.data?.content ?? [])
      .filter((wo) => !onRouteWorkOrderIds.has(wo.id))
      .slice(0, CARRYOVER_LIMIT),
    quotes: quotes.data?.content ?? [],
  };
}

/** Start driving / Arrived: the same PUT the trip drawer and the board use,
 *  version-guarded so a dispatcher's concurrent edit is a conflict, not an
 *  overwrite. */
export function useAdvanceDispatch() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stop, to }: { stop: DispatchBoardRow; to: DispatchStatus }) =>
      dispatchesApi.update(stop.id, { status: to, version: stop.version }),
    onSuccess: (_data, { stop }) => invalidateDispatchConsumers(queryClient, stop.workOrderId),
    onError: (err, { stop }) => {
      invalidateDispatchConsumers(queryClient, stop.workOrderId);
      if (isConflict(err) && errorCode(err) === 'DISPATCH_VERSION_CONFLICT') {
        showError(t('myDay.errors.conflict'));
        return;
      }
      showError(t('myDay.errors.update'), extractApiError(err));
    },
  });
}
