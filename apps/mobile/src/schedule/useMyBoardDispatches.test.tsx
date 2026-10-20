import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyBoardDispatches } from './useMyBoardDispatches';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { dispatchBoardApi } from '../api/setup';
import type { BoardDispatch, DispatchBoard } from '@dispatch/api';

jest.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));
jest.mock('../api/setup', () => ({ dispatchBoardApi: { getBoard: jest.fn() } }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockGetBoard = dispatchBoardApi.getBoard as jest.Mock;

const MINE = { id: 'd1', assignedUserId: 'user-1', arrivalWindowStart: '2026-10-20T15:00:00Z' } as BoardDispatch;
const SOMEONE_ELSES = {
  id: 'd2',
  assignedUserId: 'user-2',
  arrivalWindowStart: '2026-10-20T16:00:00Z',
} as BoardDispatch;

const BOARD: DispatchBoard = {
  date: '2026-10-20',
  timeZone: 'America/Phoenix',
  techs: [],
  dispatches: [MINE, SOMEONE_ELSES],
  techsHiddenByDivisionFilter: 0,
  commitments: [],
  dispatchesMissingCoordinates: 0,
  pendingRelease: { newCount: 0, changedCount: 0, removedCount: 0, total: 0, techCount: 0 },
  scheduledReleases: [],
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMyBoardDispatches', () => {
  it('waits on the current user before querying', async () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: null });

    const { result } = await renderHook(() => useMyBoardDispatches('2026-10-20'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(mockGetBoard).not.toHaveBeenCalled();
  });

  it('fetches the day board and keeps only this technician’s own dispatches', async () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'user-1' }, error: null });
    mockGetBoard.mockResolvedValue(BOARD);

    const { result } = await renderHook(() => useMyBoardDispatches('2026-10-20'), { wrapper });

    await waitFor(() => expect(result.current.dispatches).toEqual([MINE]));
    expect(mockGetBoard).toHaveBeenCalledWith({ date: '2026-10-20' });
  });

  it('surfaces a failure to resolve the current user as the hook error', async () => {
    const userError = new Error('could not load user');
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: userError });

    const { result } = await renderHook(() => useMyBoardDispatches('2026-10-20'), { wrapper });

    expect(result.current.error).toBe(userError);
    expect(mockGetBoard).not.toHaveBeenCalled();
  });
});
