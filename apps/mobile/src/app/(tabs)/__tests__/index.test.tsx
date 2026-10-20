import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import TodayScreen from '../index';
import { useMyBoardDispatches } from '../../../schedule/useMyBoardDispatches';
import type { BoardDispatch } from '@dispatch/api';

jest.mock('../../../schedule/useMyBoardDispatches', () => ({ useMyBoardDispatches: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockUseMyBoardDispatches = useMyBoardDispatches as jest.Mock;
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const ROW: BoardDispatch = {
  id: 'd1',
  seq: 1,
  status: 'SCHEDULED',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  arrivalWindowEnd: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
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
};

const renderToday = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <TodayScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TodayScreen', () => {
  it('shows a loading state', async () => {
    mockUseMyBoardDispatches.mockReturnValue({ dispatches: [], isLoading: true, error: null, refetch: mockRefetch });
    await renderToday();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('No visits today')).toBeNull();
  });

  it('shows the empty state with no dispatches', async () => {
    mockUseMyBoardDispatches.mockReturnValue({ dispatches: [], isLoading: false, error: null, refetch: mockRefetch });
    await renderToday();
    expect(screen.getByText('No visits today')).toBeTruthy();
    expect(screen.getByText('Nothing assigned to you for today.')).toBeTruthy();
  });

  it('renders a dispatch row for each job, soonest first as given', async () => {
    mockUseMyBoardDispatches.mockReturnValue({
      dispatches: [ROW],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderToday();

    expect(screen.getByText('No cool — compressor noise')).toBeTruthy();
    expect(screen.getByText('Johnson Residence · Phoenix, AZ')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('navigates to the dispatch detail screen on tap', async () => {
    mockUseMyBoardDispatches.mockReturnValue({
      dispatches: [ROW],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderToday();

    await fireEvent.press(screen.getByText('No cool — compressor noise'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/dispatch/[id]',
      params: { id: 'd1', workOrderId: 'wo1' },
    });
  });

  it('retries through the shell on error', async () => {
    mockUseMyBoardDispatches.mockReturnValue({
      dispatches: [],
      isLoading: false,
      error: new Error('network'),
      refetch: mockRefetch,
    });
    await renderToday();

    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
