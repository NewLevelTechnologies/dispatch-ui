import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import type { DispatchStatus, MyDayStop } from '@dispatch/api';
import { dispatchesApi, myDayApi } from '../api/setup';
import { routeStops, shiftDay } from './myDayModel';
import { errorCode, errorStatus, extractApiError, isConflict } from './apiError';

// A tech's day changes under them — the dispatcher moves, releases and
// cancels — so the route polls rather than waiting for a manual refresh.
const POLL_MS = 60_000;

/**
 * My day, as released to me.
 *
 * `date` omitted means today in the *tenant's* zone, which the server
 * resolves — the client never computes "today" itself, which is also what
 * removes the timezone bug class Phase 2 hit.
 *
 * This replaces Today's old `dispatchBoardApi.getBoard` read, which returned
 * the whole board for the client to filter down to "mine". This endpoint is
 * filtered server-side, arrival-ordered, carries the drive time between stops,
 * and — the part that matters — returns the window the tech was actually
 * *sent*, not a live one that may contain unreleased dispatcher changes.
 */
export function useMyDayStops(date?: string, { enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['dispatches', 'my-day', date ?? 'today'],
    queryFn: () => myDayApi.getDay(date),
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const stops = useMemo(() => routeStops(query.data?.stops ?? []), [query.data]);
  return { ...query, stops };
}

/**
 * The day `offset` days from today, once today's own response has said what
 * "today" is. Offset 0 is left to the caller's existing query rather than
 * duplicating it under a second key.
 */
export function useDayAt(today: string | undefined, offset: number) {
  return useMyDayStops(today ? shiftDay(today, offset) : undefined, { enabled: !!today && offset !== 0 });
}

/**
 * Start driving / Arrived — the same PUT the web drawer and board use, but
 * **version-guarded**: a dispatcher editing the same visit concurrently
 * becomes a conflict to report rather than an overwrite.
 *
 * A stop whose removal is pending release has a null `version` and 404s here;
 * it still shows on the day, but it is no longer the tech's to act on.
 */
export function useAdvanceStop() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  return useMutation({
    mutationFn: ({ stop, to }: { stop: MyDayStop; to: DispatchStatus }) =>
      dispatchesApi.update(stop.dispatchId, { status: to, ...(stop.version != null && { version: stop.version }) }),
    onSuccess: refresh,
    onError: (err: unknown) => {
      // Refetch either way: whatever the server knows now is more current than
      // what this screen just tried to do.
      refresh();
      if (errorStatus(err) === 404) {
        Alert.alert(t('myDay.errors.changed'));
        return;
      }
      if (isConflict(err) && errorCode(err) === 'DISPATCH_VERSION_CONFLICT') {
        Alert.alert(t('myDay.errors.conflict'));
        return;
      }
      Alert.alert(t('myDay.errors.update'), extractApiError(err));
    },
  });
}
