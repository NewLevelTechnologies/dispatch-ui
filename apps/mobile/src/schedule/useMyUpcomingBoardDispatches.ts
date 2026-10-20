import { useQueries } from '@tanstack/react-query';
import { dispatchBoardApi } from '../api/setup';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { BoardDispatch } from '@dispatch/api';

/**
 * Like `useMyBoardDispatches`, but for several days at once (the Schedule
 * screen's week view) — one board read per day, run in parallel via
 * `useQueries`, each filtered down to this technician's own dispatches.
 *
 * A real per-day `getBoard` call each, not the week-aggregate read
 * (`getWeek`): that endpoint was built to avoid "a 60-tech shop's client
 * calling the day read seven times" for the dispatcher's whole-board week
 * view, but it returns per-day *counts*, not the dispatch rows themselves —
 * no title, no address, no arrival time. This screen needs the rows, and for
 * one technician's own week, seven day reads is a reasonable cost.
 */
export function useMyUpcomingBoardDispatches(dates: string[]) {
  const { data: user, error: userError } = useCurrentUser();

  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: ['board', date],
      queryFn: () => dispatchBoardApi.getBoard({ date }),
      enabled: !!user?.id,
    })),
  });

  // Same reasoning as useMyBoardDispatches: the board read has no sort
  // param, so sort client-side once everything's merged across days.
  const dispatches: BoardDispatch[] = (
    user?.id ? results.flatMap((r) => r.data?.dispatches.filter((d) => d.assignedUserId === user.id) ?? []) : []
  ).sort((a, b) => a.arrivalWindowStart.localeCompare(b.arrivalWindowStart));

  return {
    dispatches,
    isLoading: !user && !userError ? true : results.some((r) => r.isLoading),
    error: userError ?? results.find((r) => r.error)?.error,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
