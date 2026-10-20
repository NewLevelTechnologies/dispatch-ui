import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../theme/ThemeProvider';
import AvailabilityScreen from '../availability';
import { useMyAvailability } from '../../availability/useMyAvailability';
import type { Availability } from '@dispatch/api';

jest.mock('../../availability/useMyAvailability', () => ({ useMyAvailability: jest.fn() }));

const mockUseMyAvailability = useMyAvailability as jest.Mock;
const mockRefetch = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const ENTRY: Availability = {
  id: 'a1',
  userId: 'user-1',
  startsAt: new Date(2026, 9, 24, 0, 0, 0).toISOString(),
  endsAt: new Date(2026, 9, 24, 23, 59, 59).toISOString(),
  allDay: true,
  status: 'OFF',
  label: 'Out — Vacation',
  reason: 'Family trip',
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const renderAvailability = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AvailabilityScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AvailabilityScreen', () => {
  it('shows the empty state with nothing on the books', async () => {
    mockUseMyAvailability.mockReturnValue({ availability: [], isLoading: false, error: null, refetch: mockRefetch });
    await renderAvailability();
    expect(screen.getByText('Nothing on the books')).toBeTruthy();
  });

  it('lists each entry with its label, span and reason', async () => {
    mockUseMyAvailability.mockReturnValue({
      availability: [ENTRY],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderAvailability();

    expect(screen.getByText('Out — Vacation')).toBeTruthy();
    expect(screen.getByText('Oct 24')).toBeTruthy();
    expect(screen.getByText('Family trip')).toBeTruthy();
  });

  it('uses its own copy for the error state, not the generic schedule one', async () => {
    mockUseMyAvailability.mockReturnValue({
      availability: [],
      isLoading: false,
      error: new Error('network'),
      refetch: mockRefetch,
    });
    await renderAvailability();

    expect(screen.getByText('Couldn’t load your availability')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
