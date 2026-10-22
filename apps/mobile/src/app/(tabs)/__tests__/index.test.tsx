import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import TodayScreen from '../index';
import { useAdvanceStop, useDayAt, useFocusWorkOrder, useMyDayStops } from '../../../my-day/useMyDay';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useWorkOrderAccess } from '../../../permissions/useWorkOrderAccess';
import { useCarryover } from '../../../my-day/useCarryover';
import type { MyDayStop } from '@dispatch/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../my-day/useMyDay', () => ({
  useMyDayStops: jest.fn(),
  useDayAt: jest.fn(),
  useFocusWorkOrder: jest.fn(),
  useAdvanceStop: jest.fn(),
}));
jest.mock('../../../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));
jest.mock('../../../permissions/useWorkOrderAccess', () => ({ useWorkOrderAccess: jest.fn() }));
jest.mock('../../../maps/openDirections', () => ({ openDirections: jest.fn() }));
jest.mock('../../../my-day/useCarryover', () => ({ useCarryover: jest.fn() }));

const mockUseMyDayStops = useMyDayStops as jest.Mock;
const mockUseDayAt = useDayAt as jest.Mock;
const mockUseFocusWorkOrder = useFocusWorkOrder as jest.Mock;
const mockUseAdvanceStop = useAdvanceStop as jest.Mock;
const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseWorkOrderAccess = useWorkOrderAccess as jest.Mock;
const mockUseCarryover = useCarryover as jest.Mock;
const mockMutate = jest.fn();
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };
const ZONE = 'America/New_York';

const stop = (over: Partial<MyDayStop> = {}): MyDayStop =>
  ({
    dispatchId: 'd1',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-00219',
    workOrderSummary: 'Callback: restroom supply line burst',
    customerName: 'Peachtree Dental Group',
    serviceLocationName: null,
    serviceLocationStreet: '1192 Spalding Dr',
    serviceLocationCity: 'Sandy Springs',
    serviceLocationState: 'GA',
    serviceLocationZip: '30350',
    status: 'SCHEDULED',
    // 10a–12p in New York.
    arrivalWindowStart: '2026-10-21T14:00:00Z',
    arrivalWindowEnd: '2026-10-21T16:00:00Z',
    estimatedDuration: 120,
    arrivedAt: null,
    departedAt: null,
    driveMinFromPrev: null,
    recurring: false,
    version: 2,
    ...over,
  }) as MyDayStop;

/** The today query's return shape. */
const dayResult = (stops: MyDayStop[], over: Record<string, unknown> = {}) => ({
  stops,
  data: { date: '2026-10-21', timeZone: ZONE, stops },
  isLoading: false,
  error: null,
  refetch: mockRefetch,
  ...over,
});

const renderToday = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <TodayScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAdvanceStop.mockReturnValue({ mutate: mockMutate, isPending: false });
  mockUseFocusWorkOrder.mockReturnValue({ data: undefined });
  mockUseCurrentUser.mockReturnValue({ data: { id: 'me', capabilities: [] } });
  mockUseWorkOrderAccess.mockReturnValue({ canEdit: true });
  mockUseDayAt.mockReturnValue(dayResult([]));
  mockUseCarryover.mockReturnValue({ awaitingParts: [], quotes: [] });
});

describe('TodayScreen', () => {
  it('shows a loading state', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([], { isLoading: true, data: undefined }));
    await renderToday();
    expect(screen.queryByText('Callback: restroom supply line burst')).toBeNull();
  });

  it('shows the error state with a working retry', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([], { error: new Error('network') }));
    await renderToday();

    expect(screen.getByText('Couldn’t load your day')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when nothing is released', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([]));
    await renderToday();
    expect(screen.getByText('No stops today')).toBeTruthy();
  });

  it('renders the focus card with the window in the tenant’s zone', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    await renderToday();

    expect(screen.getByText('10a – 12p')).toBeTruthy();
    expect(screen.getAllByText('Callback: restroom supply line burst').length).toBeGreaterThan(0);
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('~2h on site')).toBeTruthy();
  });

  it('counts progress and names what is next', async () => {
    mockUseMyDayStops.mockReturnValue(
      dayResult([stop({ dispatchId: 'a', status: 'COMPLETED' }), stop({ dispatchId: 'b' })]),
    );
    await renderToday();
    expect(screen.getByText(/1 of 2 stops done · next at 10a/)).toBeTruthy();
  });

  it('walks the visit forward: scheduled offers Start driving', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop({ status: 'SCHEDULED' })]));
    await renderToday();

    await fireEvent.press(screen.getByText('Start driving'));
    expect(mockMutate).toHaveBeenCalledWith({ stop: expect.objectContaining({ dispatchId: 'd1' }), to: 'EN_ROUTE' });
  });

  it('en route offers Arrived on site', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop({ status: 'EN_ROUTE' })]));
    await renderToday();

    await fireEvent.press(screen.getByText('Arrived on site'));
    expect(mockMutate).toHaveBeenCalledWith({ stop: expect.objectContaining({ dispatchId: 'd1' }), to: 'IN_PROGRESS' });
  });

  it('on site hands off to the work order rather than flipping status here', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop({ status: 'IN_PROGRESS', arrivedAt: '2026-10-21T14:05:00Z' })]));
    await renderToday();

    await fireEvent.press(screen.getByText('Complete visit'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/work-order/[id]', params: { id: 'wo1' } });
  });

  it('hides the status action when the role may not move jobs along', async () => {
    mockUseWorkOrderAccess.mockReturnValue({ canEdit: false });
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    await renderToday();

    expect(screen.queryByText('Start driving')).toBeNull();
    // The day still reads — only acting on it is gated.
    expect(screen.getByText('10a – 12p')).toBeTruthy();
    expect(screen.getByText('Navigate')).toBeTruthy();
  });

  it('opens the work order from a route row, not the dispatch', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop({ dispatchId: 'a' }), stop({ dispatchId: 'b', workOrderId: 'wo2' })]));
    await renderToday();

    // The second row — the first is also rendered as the focus card above.
    await fireEvent.press(screen.getAllByText('Callback: restroom supply line burst')[2]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/work-order/[id]', params: { id: 'wo2' } });
  });

  it('shows the day-done state once nothing is left to act on', async () => {
    mockUseMyDayStops.mockReturnValue(
      dayResult([
        stop({
          dispatchId: 'a',
          status: 'COMPLETED',
          arrivedAt: '2026-10-21T14:00:00Z',
          departedAt: '2026-10-21T15:00:00Z',
        }),
      ]),
    );
    await renderToday();

    expect(screen.getByText('Day complete')).toBeTruthy();
    expect(screen.getByText(/1 of 1 stops completed/)).toBeTruthy();
    expect(screen.getByText(/1h on site/)).toBeTruthy();
  });

  it('lists what is hanging over the tech, and opens the job behind it', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    mockUseCarryover.mockReturnValue({
      awaitingParts: [{ id: 'wo9', workOrderNumber: 'WO-00077', summary: 'Compressor on order' }],
      quotes: [],
    });
    await renderToday();

    expect(screen.getByText('Unfinished')).toBeTruthy();
    await fireEvent.press(screen.getByText('Compressor on order'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/work-order/[id]', params: { id: 'wo9' } });
  });

  it('says nothing when there is nothing hanging over the tech', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    await renderToday();
    expect(screen.queryByText('Unfinished')).toBeNull();
  });

  it('teases tomorrow', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    mockUseDayAt.mockReturnValue(dayResult([stop({ dispatchId: 't1', customerName: 'Robert Hughes' })]));
    await renderToday();

    expect(screen.getByText('Tomorrow · 1 stop')).toBeTruthy();
  });

  it('steps to another day, which is read-only', async () => {
    mockUseMyDayStops.mockReturnValue(dayResult([stop()]));
    mockUseDayAt.mockReturnValue(dayResult([stop({ dispatchId: 'x', status: 'SCHEDULED' })]));
    await renderToday();

    await fireEvent.press(screen.getByLabelText('Next day'));

    // No focus card, so no way to advance a visit you aren't working.
    expect(screen.queryByText('Start driving')).toBeNull();
    expect(screen.getByText('Route')).toBeTruthy();
  });
});
