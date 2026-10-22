import { Alert } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MyDayStop } from '@dispatch/api';
import { useAdvanceStop, useDayAt, useMyDayStops } from './useMyDay';
import { dispatchesApi, myDayApi } from '../api/setup';

jest.mock('../api/setup', () => ({
  myDayApi: { getDay: jest.fn() },
  dispatchesApi: { update: jest.fn() },
}));

const mockGetDay = myDayApi.getDay as jest.Mock;
const mockUpdate = dispatchesApi.update as jest.Mock;

const stop = (over: Partial<MyDayStop> = {}): MyDayStop =>
  ({ dispatchId: 'd1', workOrderId: 'wo1', status: 'SCHEDULED', version: 3, ...over }) as MyDayStop;

const day = (stops: MyDayStop[], date = '2026-10-21') => ({ date, timeZone: 'America/New_York', stops });

/** An axios-shaped failure, which is what the api client surfaces. */
const apiError = (status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error('request failed'), { response: { status, data } });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('useMyDayStops', () => {
  it('asks the server for today when given no date — the client never computes it', async () => {
    mockGetDay.mockResolvedValue(day([]));

    const { result } = await renderHook(() => useMyDayStops(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDay).toHaveBeenCalledWith(undefined);
  });

  it('drops cancellations from the route', async () => {
    mockGetDay.mockResolvedValue(
      day([stop({ dispatchId: 'a' }), stop({ dispatchId: 'b', status: 'CANCELLED' })]),
    );

    const { result } = await renderHook(() => useMyDayStops(), { wrapper });

    await waitFor(() => expect(result.current.stops).toHaveLength(1));
    expect(result.current.stops[0]!.dispatchId).toBe('a');
  });

  it('exposes the server’s own date and zone, not the device’s', async () => {
    mockGetDay.mockResolvedValue(day([]));

    const { result } = await renderHook(() => useMyDayStops(), { wrapper });

    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-21'));
    expect(result.current.data?.timeZone).toBe('America/New_York');
  });
});

describe('useDayAt', () => {
  it('asks for the shifted day once today is known', async () => {
    mockGetDay.mockResolvedValue(day([]));

    const { result } = await renderHook(() => useDayAt('2026-10-21', 1), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDay).toHaveBeenCalledWith('2026-10-22');
  });

  it('waits rather than guessing when today is not known yet', async () => {
    await renderHook(() => useDayAt(undefined, 1), { wrapper });
    expect(mockGetDay).not.toHaveBeenCalled();
  });

  it('leaves offset 0 to the caller’s own query', async () => {
    await renderHook(() => useDayAt('2026-10-21', 0), { wrapper });
    expect(mockGetDay).not.toHaveBeenCalled();
  });
});

describe('useAdvanceStop', () => {
  const advance = async (over: Partial<MyDayStop>, to: 'EN_ROUTE' | 'IN_PROGRESS' = 'EN_ROUTE') => {
    const { result } = await renderHook(() => useAdvanceStop(), { wrapper });
    await act(async () => {
      result.current.mutate({ stop: stop(over), to });
    });
    return result;
  };

  it('sends the version so a concurrent dispatcher edit collides instead of being overwritten', async () => {
    mockUpdate.mockResolvedValue({});
    await advance({ version: 7 });
    expect(mockUpdate).toHaveBeenCalledWith('d1', { status: 'EN_ROUTE', version: 7 });
  });

  it('omits the version when the stop has none — a removal pending release', async () => {
    mockUpdate.mockResolvedValue({});
    await advance({ version: null });
    expect(mockUpdate).toHaveBeenCalledWith('d1', { status: 'EN_ROUTE' });
  });

  it('says the job changed on a 404 rather than a generic failure', async () => {
    mockUpdate.mockRejectedValue(apiError(404));
    await advance({});
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Dispatch changed this job. Check with the office.'),
    );
  });

  it('names a version conflict specifically', async () => {
    mockUpdate.mockRejectedValue(apiError(409, { code: 'DISPATCH_VERSION_CONFLICT' }));
    await advance({});
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('This visit just changed — refreshed with the latest.'),
    );
  });

  it('falls back to the server’s own message for anything else', async () => {
    mockUpdate.mockRejectedValue(apiError(500, { message: 'Scheduling service is down' }));
    await advance({});
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Couldn’t update the visit', 'Scheduling service is down'),
    );
  });

  it('treats a 409 without the conflict code as a plain failure', async () => {
    mockUpdate.mockRejectedValue(apiError(409, { message: 'Something else' }));
    await advance({});
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Couldn’t update the visit', 'Something else'));
  });
});
