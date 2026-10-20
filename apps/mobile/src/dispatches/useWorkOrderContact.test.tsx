import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWorkOrderContact } from './useWorkOrderContact';
import { workOrderApi } from '../api/setup';
import type { WorkOrder } from '@dispatch/api';

jest.mock('../api/setup', () => ({ workOrderApi: { getById: jest.fn() } }));

const mockGetById = workOrderApi.getById as jest.Mock;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWorkOrderContact', () => {
  it('prefers the site contact name/phone over the customer', async () => {
    mockGetById.mockResolvedValue({
      workOrderNumber: 'WO-00138',
      summary: 'No hot water',
      customer: { id: 'c1', name: 'Michelle Parker', phone: '6025550100' },
      serviceLocation: {
        id: 'loc1',
        locationName: null,
        address: { streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
        siteContactName: 'Gate Guard',
        siteContactPhone: '6025559999',
      },
    } as unknown as WorkOrder);

    const { result } = await renderHook(() => useWorkOrderContact('wo1'), { wrapper });

    await waitFor(() => expect(result.current.workOrderNumber).toBe('WO-00138'));
    expect(result.current.contactName).toBe('Gate Guard');
    expect(result.current.contactPhone).toBe('6025559999');
    expect(result.current.address).toEqual({
      streetAddress: '123 Main St',
      city: 'Phoenix',
      state: 'AZ',
      zipCode: '85001',
    });
  });

  it('falls back to the customer name/phone when the site has no contact', async () => {
    mockGetById.mockResolvedValue({
      workOrderNumber: 'WO-00138',
      summary: null,
      customer: { id: 'c1', name: 'Michelle Parker', phone: '6025550100' },
      serviceLocation: {
        id: 'loc1',
        address: { streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      },
    } as unknown as WorkOrder);

    const { result } = await renderHook(() => useWorkOrderContact('wo1'), { wrapper });

    await waitFor(() => expect(result.current.contactName).toBe('Michelle Parker'));
    expect(result.current.contactPhone).toBe('6025550100');
  });

  it('returns nulls before the query resolves', async () => {
    mockGetById.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => useWorkOrderContact('wo1'), { wrapper });

    expect(result.current.contactName).toBeNull();
    expect(result.current.contactPhone).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
