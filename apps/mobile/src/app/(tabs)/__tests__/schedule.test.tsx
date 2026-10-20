import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import ScheduleScreen from '../schedule';
import { useMyUpcomingBoardDispatches } from '../../../schedule/useMyUpcomingBoardDispatches';
import type { BoardDispatch } from '@dispatch/api';

jest.mock('../../../schedule/useMyUpcomingBoardDispatches', () => ({
  useMyUpcomingBoardDispatches: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockUseMyUpcomingBoardDispatches = useMyUpcomingBoardDispatches as jest.Mock;
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

function row(overrides: Partial<BoardDispatch>): BoardDispatch {
  return {
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: new Date().toISOString(),
    arrivalWindowEnd: new Date().toISOString(),
    estimatedDuration: 120,
    releasedAt: '2026-10-16T00:00:00.000Z',
    releaseState: 'RELEASED',
    released: null,
    divisionId: null,
    version: 1,
    windowChangedAt: null,
    assignedUserId: 'user-1',
    assignedUserName: 'Jake Morrison',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1001',
    workOrderTypeId: null,
    workOrderSummary: 'No cool — compressor noise',
    customerId: 'c1',
    customerName: 'Johnson Residence',
    priority: null,
    recurring: false,
    serviceLocationId: 'loc1',
    serviceLocationName: null,
    serviceLocationStreet: '1 Main St',
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    serviceLocationZip: '85001',
    latitude: null,
    longitude: null,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...overrides,
  };
}

const TODAY_ROW = row({
  id: 'today',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  workOrderSummary: 'Today job',
});
const NEXT_WEEK_ROW = row({
  id: 'next-week',
  arrivalWindowStart: new Date(2026, 9, 27, 8, 0, 0).toISOString(),
  workOrderSummary: 'Later job',
});

const renderSchedule = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ScheduleScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ScheduleScreen', () => {
  it('shows the week-empty state with no dispatches', async () => {
    mockUseMyUpcomingBoardDispatches.mockReturnValue({
      dispatches: [],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderSchedule();
    expect(screen.getByText('Nothing coming up')).toBeTruthy();
  });

  it('groups dispatches under day headings', async () => {
    mockUseMyUpcomingBoardDispatches.mockReturnValue({
      dispatches: [TODAY_ROW, NEXT_WEEK_ROW],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderSchedule();

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Today job')).toBeTruthy();
    expect(screen.getByText('Tue, Oct 27')).toBeTruthy();
    expect(screen.getByText('Later job')).toBeTruthy();
  });

  it('navigates to the dispatch detail screen on tap', async () => {
    mockUseMyUpcomingBoardDispatches.mockReturnValue({
      dispatches: [TODAY_ROW],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderSchedule();

    await fireEvent.press(screen.getByText('Today job'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/dispatch/[id]',
      params: { id: 'today', workOrderId: 'wo1' },
    });
  });

  it('retries through the shell on error', async () => {
    mockUseMyUpcomingBoardDispatches.mockReturnValue({
      dispatches: [],
      isLoading: false,
      error: new Error('network'),
      refetch: mockRefetch,
    });
    await renderSchedule();

    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
