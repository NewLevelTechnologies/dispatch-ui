import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ScheduleScreenShell } from './ScheduleScreenShell';

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const BASE_PROPS = {
  title: 'Today',
  isLoading: false,
  error: null,
  isEmpty: false,
  emptyTitle: 'No visits today',
  emptyBody: 'Nothing assigned to you for today.',
  onRetry: jest.fn(),
};

const renderShell = (props: Partial<React.ComponentProps<typeof ScheduleScreenShell>> = {}) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ScheduleScreenShell {...BASE_PROPS} {...props}>
          <Text>row content</Text>
        </ScheduleScreenShell>
      </ThemeProvider>
    </SafeAreaProvider>
  );

describe('ScheduleScreenShell', () => {
  it('renders children when there is data', async () => {
    await renderShell();
    expect(screen.getByText('row content')).toBeTruthy();
  });

  it('shows a spinner while loading, hiding everything else', async () => {
    await renderShell({ isLoading: true });
    expect(screen.queryByText('row content')).toBeNull();
    expect(screen.queryByText('No visits today')).toBeNull();
  });

  it('shows the error state with a working retry button', async () => {
    const onRetry = jest.fn();
    await renderShell({ error: new Error('network'), onRetry });

    expect(screen.getByText('Couldn’t load your schedule')).toBeTruthy();
    expect(screen.queryByText('row content')).toBeNull();

    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses a caller-supplied error title/body instead of the generic default', async () => {
    await renderShell({
      error: new Error('network'),
      errorTitle: 'Couldn’t load your availability',
      errorBody: 'Custom error body',
    });

    expect(screen.getByText('Couldn’t load your availability')).toBeTruthy();
    expect(screen.getByText('Custom error body')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load your schedule')).toBeNull();
  });

  it('shows the empty state when there is nothing to list', async () => {
    await renderShell({ isEmpty: true });
    expect(screen.getByText('No visits today')).toBeTruthy();
    expect(screen.getByText('Nothing assigned to you for today.')).toBeTruthy();
    expect(screen.queryByText('row content')).toBeNull();
  });
});
