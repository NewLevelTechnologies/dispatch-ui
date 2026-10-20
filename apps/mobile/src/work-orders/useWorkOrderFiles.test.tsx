import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWorkOrderPhotos } from './useWorkOrderFiles';
import { workOrderFilesApi } from '../api/setup';
import type { WorkOrderFile } from '@dispatch/api';

jest.mock('../api/setup', () => ({ workOrderFilesApi: { list: jest.fn() } }));

const mockList = workOrderFilesApi.list as jest.Mock;

const PHOTO = { id: 'f1', kind: 'PHOTO' } as WorkOrderFile;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWorkOrderPhotos', () => {
  it('fetches photo-kind files for the work order', async () => {
    mockList.mockResolvedValue({ content: [PHOTO], totalElements: 1, totalPages: 1, number: 0, size: 100, counts: {} });

    const { result } = await renderHook(() => useWorkOrderPhotos('wo1'), { wrapper });

    await waitFor(() => expect(result.current.photos).toEqual([PHOTO]));
    expect(mockList).toHaveBeenCalledWith('wo1', { kind: 'PHOTO', limit: 100 });
  });
});
