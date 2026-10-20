import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useWorkOrderNotes } from './useWorkOrderNotes';
import { notesApi } from '../api/setup';
import type { WorkOrderNote } from '@dispatch/api';

jest.mock('../api/setup', () => ({ notesApi: { list: jest.fn(), create: jest.fn() } }));

const mockList = notesApi.list as jest.Mock;
const mockCreate = notesApi.create as jest.Mock;

const NOTE = { id: 'n1', body: 'Customer called ahead', pinned: false } as WorkOrderNote;

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe('useWorkOrderNotes', () => {
  it('lists the work order’s notes', async () => {
    mockList.mockResolvedValue([NOTE]);

    const { result } = await renderHook(() => useWorkOrderNotes('wo1'), { wrapper });

    await waitFor(() => expect(result.current.notes).toEqual([NOTE]));
    expect(mockList).toHaveBeenCalledWith('wo1');
  });

  it('adds a note and refreshes the list', async () => {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([NOTE]);
    mockCreate.mockResolvedValue(NOTE);

    const { result } = await renderHook(() => useWorkOrderNotes('wo1'), { wrapper });
    await waitFor(() => expect(result.current.notes).toEqual([]));

    await act(async () => {
      result.current.addNote('Customer called ahead');
    });

    expect(mockCreate).toHaveBeenCalledWith('wo1', { body: 'Customer called ahead' });
    await waitFor(() => expect(result.current.notes).toEqual([NOTE]));
  });
});
