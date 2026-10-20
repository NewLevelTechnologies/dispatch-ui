import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PlaceholderScreen } from './PlaceholderScreen';

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

describe('PlaceholderScreen', () => {
  it('renders the given title and body', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <PlaceholderScreen title="Schedule" body="This screen is coming in a later phase." />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('This screen is coming in a later phase.')).toBeTruthy();
  });
});
