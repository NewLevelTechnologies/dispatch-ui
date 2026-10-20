import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDispatchDetail } from './useDispatchDetail';
import { dispatchesApi } from '../api/setup';
import type { Dispatch } from '@dispatch/api';

jest.mock('../api/setup', () => ({ dispatchesApi: { getById: jest.fn() } }));

const mockGetById = dispatchesApi.getById as jest.Mock;

const DISPATCH = { id: 'd1', status: 'EN_ROUTE' } as Dispatch;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useDispatchDetail', () => {
  it('fetches the dispatch by id', async () => {
    mockGetById.mockResolvedValue(DISPATCH);

    const { result } = await renderHook(() => useDispatchDetail('d1'), { wrapper });

    await waitFor(() => expect(result.current.dispatch).toEqual(DISPATCH));
    expect(mockGetById).toHaveBeenCalledWith('d1');
  });

  it('surfaces a fetch failure', async () => {
    const error = new Error('not found');
    mockGetById.mockRejectedValue(error);

    const { result } = await renderHook(() => useDispatchDetail('d1'), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(error));
  });
});
