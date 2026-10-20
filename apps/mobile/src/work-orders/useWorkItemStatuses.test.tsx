import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWorkItemStatuses } from './useWorkItemStatuses';
import { workItemStatusesApi } from '../api/setup';
import type { WorkItemStatus } from '@dispatch/api';

jest.mock('../api/setup', () => ({ workItemStatusesApi: { getAll: jest.fn() } }));

const mockGetAll = workItemStatusesApi.getAll as jest.Mock;

const STATUSES = [
  { id: 's1', name: 'Diagnosing' },
  { id: 's2', name: 'Awaiting parts' },
] as WorkItemStatus[];

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWorkItemStatuses', () => {
  it('resolves a status id to its configured name', async () => {
    mockGetAll.mockResolvedValue(STATUSES);

    const { result } = await renderHook(() => useWorkItemStatuses(), { wrapper });

    await waitFor(() => expect(result.current.statuses).toEqual(STATUSES));
    expect(result.current.labelFor('s2')).toBe('Awaiting parts');
  });

  it('returns null for an unknown or missing status id', async () => {
    mockGetAll.mockResolvedValue(STATUSES);

    const { result } = await renderHook(() => useWorkItemStatuses(), { wrapper });

    await waitFor(() => expect(result.current.statuses).toEqual(STATUSES));
    expect(result.current.labelFor('unknown')).toBeNull();
    expect(result.current.labelFor(null)).toBeNull();
  });
});
