import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppHeader } from './AppHeader';

// react-native-safe-area-context ships no jest mock for this version, so
// insets come from a real SafeAreaProvider seeded with fixed metrics rather
// than the on-device native measurement.
const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderHeader = (props: Partial<React.ComponentProps<typeof AppHeader>> = {}) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AppHeader title="Today" {...props} />
      </ThemeProvider>
    </SafeAreaProvider>
  );

describe('AppHeader', () => {
  it('renders the title', async () => {
    await renderHeader();
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('renders an eyebrow line when given one', async () => {
    await renderHeader({ eyebrow: 'Tuesday, Oct 20' });
    expect(screen.getByText('Tuesday, Oct 20')).toBeTruthy();
  });

  it('omits the eyebrow line when none is given', async () => {
    await renderHeader();
    expect(screen.queryByText('Tuesday, Oct 20')).toBeNull();
  });

  it('renders a subtitle line below the title when given one', async () => {
    await renderHeader({ subtitle: 'WO-00138' });
    expect(screen.getByText('WO-00138')).toBeTruthy();
  });

  it('omits the subtitle line when none is given', async () => {
    await renderHeader();
    expect(screen.queryByText('WO-00138')).toBeNull();
  });
});
