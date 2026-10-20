import { useQuery } from '@tanstack/react-query';
import { dispatchesApi } from '../api/setup';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { DateRange } from './dateRanges';

/**
 * The signed-in technician's dispatches in a date range, sorted by arrival
 * window. Waits on `useCurrentUser` first — `assignedUserId` is a backend
 * user id, not the Cognito username/email `useAuth` exposes — so there's
 * nothing to query until that resolves.
 *
 * `rangeKey` names the query in the cache (e.g. "today", "upcoming-14") so
 * Today and Schedule don't fight over the same cache entry when their date
 * ranges happen to overlap.
 */
export function useMyDispatches(range: DateRange, rangeKey: string) {
  const { data: user, error: userError } = useCurrentUser();

  const query = useQuery({
    queryKey: ['dispatches', 'mine', rangeKey, user?.id, range.from, range.to],
    queryFn: () =>
      dispatchesApi.getAll({
        assignedUserId: user!.id,
        from: range.from,
        to: range.to,
        sort: 'arrivalWindowStart,asc',
        size: 100,
      }),
    enabled: !!user?.id,
  });

  return {
    dispatches: query.data?.content ?? [],
    // Covers both legs: the user lookup hasn't resolved yet, or it has and
    // the dispatch query (now enabled) is in flight.
    isLoading: !user && !userError ? true : query.isLoading,
    error: userError ?? query.error,
    refetch: query.refetch,
  };
}
