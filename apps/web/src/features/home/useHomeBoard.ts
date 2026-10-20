import { useQuery } from '@tanstack/react-query';
import { dispatchBoardApi } from '../../api/setup';

// Board queries live under the `dispatch-board` prefix so a release (here or
// on the board) invalidates them through `invalidateDispatchBoard`.
const POLL_MS = 60_000;

/** The one shared fetch: KPIs, status bar, Who's where and the Unreleased row. */
export function useHomeBoard(today: string, regionIds: string[] | undefined) {
  return useQuery({
    queryKey: ['dispatch-board', 'home', today, regionIds],
    queryFn: () => dispatchBoardApi.getBoard({ date: today, regionIds }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useHomeBoardSummary(regionIds: string[] | undefined) {
  return useQuery({
    queryKey: ['dispatch-board', 'home-summary', regionIds],
    queryFn: () => dispatchBoardApi.getSummary({ regionIds }),
  });
}
