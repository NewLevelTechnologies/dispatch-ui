import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import ScheduleScreen from '../schedule';
import { useMyDispatches } from '../../../schedule/useMyDispatches';
import type { DispatchBoardRow } from '@dispatch/api';

jest.mock('../../../schedule/useMyDispatches', () => ({ useMyDispatches: jest.fn() }));

const mockUseMyDispatches = useMyDispatches as jest.Mock;
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

function row(overrides: Partial<DispatchBoardRow>): DispatchBoardRow {
  return {
    id: 'd1',
    workOrderId: 'wo1',
    assignedUserId: 'user-1',
    arrivalWindowStart: new Date().toISOString(),
    arrivalWindowEnd: new Date().toISOString(),
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
    mockUseMyDispatches.mockReturnValue({ dispatches: [], isLoading: false, error: null, refetch: mockRefetch });
    await renderSchedule();
    expect(screen.getByText('Nothing coming up')).toBeTruthy();
  });

  it('groups dispatches under day headings', async () => {
    mockUseMyDispatches.mockReturnValue({
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

  it('retries through the shell on error', async () => {
    mockUseMyDispatches.mockReturnValue({
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
