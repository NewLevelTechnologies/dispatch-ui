import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import ScheduleScreen from '../schedule';

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

describe('ScheduleScreen', () => {
  it('renders as a placeholder for now', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <ScheduleScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('This screen is coming in a later phase.')).toBeTruthy();
  });
});
