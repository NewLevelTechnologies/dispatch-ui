import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyUpcomingBoardDispatches } from './useMyUpcomingBoardDispatches';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { dispatchBoardApi } from '../api/setup';
import type { BoardDispatch, DispatchBoard } from '@dispatch/api';

jest.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));
jest.mock('../api/setup', () => ({ dispatchBoardApi: { getBoard: jest.fn() } }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockGetBoard = dispatchBoardApi.getBoard as jest.Mock;

function board(date: string, dispatches: BoardDispatch[]): DispatchBoard {
  return {
    date,
    timeZone: 'America/Phoenix',
    techs: [],
    dispatches,
    techsHiddenByDivisionFilter: 0,
    commitments: [],
    dispatchesMissingCoordinates: 0,
    pendingRelease: { newCount: 0, changedCount: 0, removedCount: 0, total: 0, techCount: 0 },
    scheduledReleases: [],
  };
}

const MINE_DAY1 = {
  id: 'd1',
  assignedUserId: 'user-1',
  arrivalWindowStart: '2026-10-20T15:00:00Z',
} as BoardDispatch;
const OTHER_DAY1 = {
  id: 'd2',
  assignedUserId: 'user-2',
  arrivalWindowStart: '2026-10-20T16:00:00Z',
} as BoardDispatch;
const MINE_DAY2 = {
  id: 'd3',
  assignedUserId: 'user-1',
  arrivalWindowStart: '2026-10-21T15:00:00Z',
} as BoardDispatch;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: { id: 'user-1' }, error: null });
});

describe('useMyUpcomingBoardDispatches', () => {
  it('fetches one board per date and merges just this technician’s dispatches', async () => {
    mockGetBoard.mockImplementation(({ date }: { date: string }) =>
      Promise.resolve(date === '2026-10-20' ? board(date, [MINE_DAY1, OTHER_DAY1]) : board(date, [MINE_DAY2]))
    );

    const { result } = await renderHook(() => useMyUpcomingBoardDispatches(['2026-10-20', '2026-10-21']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.dispatches).toEqual([MINE_DAY1, MINE_DAY2]));
    expect(mockGetBoard).toHaveBeenCalledWith({ date: '2026-10-20' });
    expect(mockGetBoard).toHaveBeenCalledWith({ date: '2026-10-21' });
  });

  it('waits on the current user before querying any day', async () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: null });

    const { result } = await renderHook(() => useMyUpcomingBoardDispatches(['2026-10-20', '2026-10-21']), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(true);
    expect(mockGetBoard).not.toHaveBeenCalled();
  });

  it('surfaces a failure to resolve the current user as the hook error', async () => {
    const userError = new Error('could not load user');
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: userError });

    const { result } = await renderHook(() => useMyUpcomingBoardDispatches(['2026-10-20']), { wrapper });

    expect(result.current.error).toBe(userError);
    expect(mockGetBoard).not.toHaveBeenCalled();
  });
});
