import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyAvailability } from './useMyAvailability';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { availabilityApi } from '../api/setup';
import type { Availability } from '@dispatch/api';

jest.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));
jest.mock('../api/setup', () => ({ availabilityApi: { list: jest.fn() } }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockList = availabilityApi.list as jest.Mock;

const ENTRY = { id: 'a1' } as Availability;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMyAvailability', () => {
  it('waits on the current user before querying', async () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: null });

    const { result } = await renderHook(() => useMyAvailability(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('queries by the resolved user id, open-ended from today', async () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'user-1' }, error: null });
    mockList.mockResolvedValue({ content: [ENTRY] });

    const { result } = await renderHook(() => useMyAvailability(), { wrapper });

    await waitFor(() => expect(result.current.availability).toEqual([ENTRY]));
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', size: 100 })
    );
    expect(mockList.mock.calls[0]![0]).not.toHaveProperty('to');
  });

  it('surfaces a failure to resolve the current user as the hook error', async () => {
    const userError = new Error('could not load user');
    mockUseCurrentUser.mockReturnValue({ data: undefined, error: userError });

    const { result } = await renderHook(() => useMyAvailability(), { wrapper });

    expect(result.current.error).toBe(userError);
    expect(mockList).not.toHaveBeenCalled();
  });
});
