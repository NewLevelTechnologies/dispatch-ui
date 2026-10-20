import { useQuery } from '@tanstack/react-query';
import { dispatchBoardApi } from '../api/setup';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * The signed-in technician's dispatches for one calendar day, via the
 * dispatch board read (`GET /scheduling/board`) rather than the older
 * `dispatchesApi.getAll()` (`GET /scheduling/dispatches`) — the latter does
 * not see dispatches created/managed through the board (confirmed live: a
 * dispatch visible and "En route" on the web board came back from
 * `/scheduling/dispatches` under every filter tried, including no filter at
 * all). The board is the current source of truth for "what's on a tech's
 * day".
 *
 * `date` is a plain "YYYY-MM-DD" (see dayGroups.ts's `dayKey`) — the server
 * resolves it in the TENANT's timezone, so there's no client-side instant
 * math to get wrong the way the old from/to approach had.
 */
export function useMyBoardDispatches(date: string) {
  const { data: user, error: userError } = useCurrentUser();

  const query = useQuery({
    queryKey: ['board', date],
    queryFn: () => dispatchBoardApi.getBoard({ date }),
    enabled: !!user?.id,
  });

  // The board read has no sort param (unlike the old dispatches-list
  // endpoint) — order is whatever the server returns, so sort client-side to
  // keep the "soonest first" promise this hook's callers rely on.
  const dispatches = (query.data?.dispatches.filter((d) => d.assignedUserId === user?.id) ?? []).sort((a, b) =>
    a.arrivalWindowStart.localeCompare(b.arrivalWindowStart)
  );

  return {
    dispatches,
    isLoading: !user && !userError ? true : query.isLoading,
    error: userError ?? query.error,
    refetch: query.refetch,
  };
}
