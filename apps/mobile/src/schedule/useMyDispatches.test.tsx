import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyDispatches } from './useMyDispatches';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { dispatchesApi } from '../api/setup';
import type { DispatchBoardRow } from '../api/setup';

jest.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));
jest.mock('../api/setup', () => ({ dispatchesApi: { getAll: jest.fn() } }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockGetAll = dispatchesApi.getAll as jest.Mock;

const RANGE = { from: '2026-10-20T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' };

const ROW = { id: 'd1', assignedUserId: 'user-1' } as DispatchBoardRow;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMyDispatches', () => {
  it('waits on the current user before querying', async () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: null });

    const { result } = await renderHook(() => useMyDispatches(RANGE, 'today'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it('queries by the resolved user id and the given range, sorted by arrival time', async () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'user-1' }, error: null });
    mockGetAll.mockResolvedValue({ content: [ROW] });

    const { result } = await renderHook(() => useMyDispatches(RANGE, 'today'), { wrapper });

    await waitFor(() => expect(result.current.dispatches).toEqual([ROW]));
    expect(mockGetAll).toHaveBeenCalledWith({
      assignedUserId: 'user-1',
      from: RANGE.from,
      to: RANGE.to,
      sort: 'arrivalWindowStart,asc',
      size: 100,
    });
  });

  it('surfaces a failure to resolve the current user as the hook error', async () => {
    const userError = new Error('could not load user');
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: userError });

    const { result } = await renderHook(() => useMyDispatches(RANGE, 'today'), { wrapper });

    expect(result.current.error).toBe(userError);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetAll).not.toHaveBeenCalled();
  });
});
