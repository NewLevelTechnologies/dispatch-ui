import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import TodayScreen from '../index';
import { useMyDispatches } from '../../../schedule/useMyDispatches';
import type { DispatchBoardRow } from '@dispatch/api';

jest.mock('../../../schedule/useMyDispatches', () => ({ useMyDispatches: jest.fn() }));

const mockUseMyDispatches = useMyDispatches as jest.Mock;
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const ROW: DispatchBoardRow = {
  id: 'd1',
  workOrderId: 'wo1',
  assignedUserId: 'user-1',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  arrivalWindowEnd: new Date(2026, 9, 20, 9, 0, 0).toISOString(),
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  workOrderNumber: 'WO-1001',
  workOrderTypeId: null,
  workOrderTypeName: null,
  workOrderSummary: 'No cool — compressor noise',
  customerId: 'c1',
  customerName: 'Johnson Residence',
  serviceLocationId: 'loc1',
  serviceLocationCity: 'Phoenix',
  serviceLocationState: 'AZ',
  assignedUserName: 'Mike Reynolds',
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
    mockUseMyDispatches.mockReturnValue({ dispatches: [], isLoading: true, error: null, refetch: mockRefetch });
    await renderToday();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('No visits today')).toBeNull();
  });

  it('shows the empty state with no dispatches', async () => {
    mockUseMyDispatches.mockReturnValue({ dispatches: [], isLoading: false, error: null, refetch: mockRefetch });
    await renderToday();
    expect(screen.getByText('No visits today')).toBeTruthy();
    expect(screen.getByText('Nothing assigned to you for today.')).toBeTruthy();
  });

  it('renders a dispatch row for each job, soonest first as given', async () => {
    mockUseMyDispatches.mockReturnValue({ dispatches: [ROW], isLoading: false, error: null, refetch: mockRefetch });
    await renderToday();

    expect(screen.getByText('No cool — compressor noise')).toBeTruthy();
    expect(screen.getByText('Johnson Residence · Phoenix, AZ')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('retries through the shell on error', async () => {
    mockUseMyDispatches.mockReturnValue({
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
