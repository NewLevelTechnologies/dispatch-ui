// The reads behind "My day". Every one is scoped to the signed-in user and
// is an existing endpoint; the page adds no new stored state.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  dispatchesApi,
  myDayApi,
  quotesApi,
  workItemStatusesApi,
  workOrderApi,
  type DispatchStatus,
  type MyDayStop,
  type ProgressCategory,
} from '../../api/setup';
import { shiftDay } from '../../lib/boardMove';
import { PENDING_PARTS_CODE } from '../../lib/workItemStatusTargets';
import { errorCode, errorStatus, extractApiError, isConflict, showError } from '../../lib/toast';
import { invalidateDispatchConsumers } from '../../utils/invalidateRoleConsumers';
import { routeStops } from './myDayModel';

// A tech's day changes under them — the dispatcher moves, releases and
// cancels — so the route polls like the home board does.
const POLL_MS = 60_000;
const OPEN_CATEGORIES: ProgressCategory[] = ['NOT_STARTED', 'AWAITING_SCHEDULE', 'IN_PROGRESS', 'BLOCKED'];
const CARRYOVER_LIMIT = 5;

/** My day as released to me. `date` omitted = today in the tenant's zone,
 *  which the server resolves — so the client never computes "today". */
export function useMyDayStops(date?: string, { enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    // Under ['dispatches'] so invalidateDispatchConsumers refreshes it after
    // any dispatch write — here, on the board, or on the work order.
    queryKey: ['dispatches', 'my-day', date ?? 'today'],
    queryFn: () => myDayApi.getDay(date),
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const stops = useMemo(() => routeStops(query.data?.stops ?? []), [query.data]);
  return { ...query, stops };
}

/** The day `offset` days from today, once today's response has told us
 *  what "today" is. Released work only, like every My day read. */
export function useDayAt(today: string | undefined, offset: number) {
  return useMyDayStops(today ? shiftDay(today, offset) : undefined, { enabled: !!today && offset !== 0 });
}

/** The focus stop's work order — only for who to call and what equipment,
 *  which the stop doesn't carry. Never its schedule: the window is the
 *  released one on the stop. */
export function useFocusWorkOrder(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['work-orders', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId!),
    enabled: !!workOrderId,
  });
}

/** Carry-over: open work orders of mine waiting on parts, and quotes I wrote
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
      quotesApi.getAll({ status: ['SENT'], createdByUserId: userId, size: CARRYOVER_LIMIT, sort: 'lastSentAt,desc' }),
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
    mutationFn: ({ stop, to }: { stop: MyDayStop; to: DispatchStatus }) =>
      dispatchesApi.update(stop.dispatchId, { status: to, ...(stop.version != null && { version: stop.version }) }),
    onSuccess: (_data, { stop }) => invalidateDispatchConsumers(queryClient, stop.workOrderId),
    onError: (err, { stop }) => {
      invalidateDispatchConsumers(queryClient, stop.workOrderId);
      // Reassigned, unscheduled or cancelled since it was sent: the stop stays
      // on the tech's day until the removal is released, but it's no longer
      // theirs to act on.
      if (errorStatus(err) === 404) {
        showError(t('myDay.errors.changed'));
        return;
      }
      if (isConflict(err) && errorCode(err) === 'DISPATCH_VERSION_CONFLICT') {
        showError(t('myDay.errors.conflict'));
        return;
      }
      showError(t('myDay.errors.update'), extractApiError(err));
    },
  });
}
