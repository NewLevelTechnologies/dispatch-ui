import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWorkOrderDetail } from './useWorkOrderDetail';
import { workOrderApi } from '../api/setup';
import type { WorkOrder } from '@dispatch/api';

jest.mock('../api/setup', () => ({ workOrderApi: { getById: jest.fn() } }));

const mockGetById = workOrderApi.getById as jest.Mock;

const WORK_ORDER = { id: 'wo1', workOrderNumber: 'WO-00138' } as WorkOrder;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWorkOrderDetail', () => {
  it('fetches the work order by id', async () => {
    mockGetById.mockResolvedValue(WORK_ORDER);

    const { result } = await renderHook(() => useWorkOrderDetail('wo1'), { wrapper });

    await waitFor(() => expect(result.current.workOrder).toEqual(WORK_ORDER));
    expect(mockGetById).toHaveBeenCalledWith('wo1');
  });

  it('surfaces a fetch failure', async () => {
    const error = new Error('not found');
    mockGetById.mockRejectedValue(error);

    const { result } = await renderHook(() => useWorkOrderDetail('wo1'), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(error));
  });
});
