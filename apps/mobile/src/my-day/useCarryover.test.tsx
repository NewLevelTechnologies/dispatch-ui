import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCarryover } from './useCarryover';
import { quotesApi, workItemStatusesApi, workOrderApi } from '../api/setup';

jest.mock('../api/setup', () => ({
  workItemStatusesApi: { getAll: jest.fn() },
  workOrderApi: { getAll: jest.fn() },
  quotesApi: { getAll: jest.fn() },
}));

const mockStatuses = workItemStatusesApi.getAll as jest.Mock;
const mockWorkOrders = workOrderApi.getAll as jest.Mock;
const mockQuotes = quotesApi.getAll as jest.Mock;

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const render = (userId: string | undefined, onRoute: string[] = []) =>
  renderHook(() => useCarryover(userId, new Set(onRoute)), { wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mockStatuses.mockResolvedValue([{ id: 'pp', code: 'PENDING_PARTS', name: 'Awaiting parts' }]);
  mockWorkOrders.mockResolvedValue({ content: [] });
  mockQuotes.mockResolvedValue({ content: [] });
});

describe('useCarryover', () => {
  it('looks parts-waiting jobs up by the seeded status code, not a tenant’s label', async () => {
    mockStatuses.mockResolvedValue([
      { id: 'other', code: 'COMPLETE', name: 'Awaiting parts' }, // same label, wrong code
      { id: 'pp', code: 'PENDING_PARTS', name: 'Waiting on bits' },
    ]);

    await render('me');

    await waitFor(() =>
      expect(mockWorkOrders).toHaveBeenCalledWith(expect.objectContaining({ workItemStatusIds: ['pp'] })),
    );
  });

  it('scopes both reads to the signed-in tech', async () => {
    await render('me');

    await waitFor(() => expect(mockWorkOrders).toHaveBeenCalled());
    expect(mockWorkOrders).toHaveBeenCalledWith(expect.objectContaining({ assignedUserId: 'me' }));
    expect(mockQuotes).toHaveBeenCalledWith(expect.objectContaining({ createdByUserId: 'me' }));
  });

  it('waits rather than querying for nobody', async () => {
    await render(undefined);
    expect(mockWorkOrders).not.toHaveBeenCalled();
    expect(mockQuotes).not.toHaveBeenCalled();
  });

  it('leaves work already on today’s route to the route', async () => {
    mockWorkOrders.mockResolvedValue({ content: [{ id: 'wo1' }, { id: 'wo2' }] });

    const { result } = await render('me', ['wo1']);

    await waitFor(() => expect(result.current.awaitingParts).toHaveLength(1));
    expect(result.current.awaitingParts[0]!.id).toBe('wo2');
  });

  it('caps the list even when the route filter removes nothing', async () => {
    mockWorkOrders.mockResolvedValue({ content: Array.from({ length: 9 }, (_, i) => ({ id: `wo${i}` })) });

    const { result } = await render('me');

    await waitFor(() => expect(result.current.awaitingParts).toHaveLength(5));
  });

  it('drops quotes that have no job to open — mobile has no quote screen', async () => {
    mockQuotes.mockResolvedValue({
      content: [
        { id: 'q1', quoteNumber: 'Q-1', workOrderId: 'wo9' },
        { id: 'q2', quoteNumber: 'Q-2', workOrderId: null },
      ],
    });

    const { result } = await render('me');

    await waitFor(() => expect(result.current.quotes).toHaveLength(1));
    expect(result.current.quotes[0]!.id).toBe('q1');
  });
});
