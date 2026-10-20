import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useServiceLocationDetail } from './useServiceLocationDetail';
import { customerApi } from '../api/setup';
import type { ServiceLocationDetailDto } from '@dispatch/api';

jest.mock('../api/setup', () => ({ customerApi: { getServiceLocationById: jest.fn() } }));

const mockGetServiceLocationById = customerApi.getServiceLocationById as jest.Mock;

const LOCATION = { id: 'loc1', accessInstructions: 'Use the side gate' } as ServiceLocationDetailDto;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useServiceLocationDetail', () => {
  it('fetches the service location by id', async () => {
    mockGetServiceLocationById.mockResolvedValue(LOCATION);

    const { result } = await renderHook(() => useServiceLocationDetail('loc1'), { wrapper });

    await waitFor(() => expect(result.current.serviceLocation).toEqual(LOCATION));
    expect(mockGetServiceLocationById).toHaveBeenCalledWith('loc1');
  });

  it('does not fetch without an id', async () => {
    const { result } = await renderHook(() => useServiceLocationDetail(undefined), { wrapper });

    expect(mockGetServiceLocationById).not.toHaveBeenCalled();
    expect(result.current.serviceLocation).toBeUndefined();
  });
});
