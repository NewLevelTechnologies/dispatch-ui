import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateDispatchStatus } from './useUpdateDispatchStatus';
import { dispatchesApi } from '../api/setup';

jest.mock('../api/setup', () => ({ dispatchesApi: { update: jest.fn() } }));

const mockUpdate = dispatchesApi.update as jest.Mock;

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe('useUpdateDispatchStatus', () => {
  it('calls update with the given status', async () => {
    mockUpdate.mockResolvedValue({ id: 'd1', status: 'EN_ROUTE' });

    const { result } = await renderHook(() => useUpdateDispatchStatus('d1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('EN_ROUTE');
    });

    expect(mockUpdate).toHaveBeenCalledWith('d1', { status: 'EN_ROUTE' });
  });

  it('invalidates this dispatch and every board query on success', async () => {
    mockUpdate.mockResolvedValue({ id: 'd1', status: 'EN_ROUTE' });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useUpdateDispatchStatus('d1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('EN_ROUTE');
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dispatch', 'd1'] }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['board'] });
  });
});
