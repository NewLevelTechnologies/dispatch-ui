import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { StatusPill, type PillTone } from './StatusPill';

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderPill = (label: string, tone: PillTone) =>
  render(
    <ThemeProvider>
      <StatusPill label={label} tone={tone} />
    </ThemeProvider>
  );

describe('StatusPill', () => {
  it.each<PillTone>(['info', 'accent', 'success', 'warning', 'danger', 'neutral'])(
    'renders its label for the %s tone',
    async (tone) => {
      await renderPill('Scheduled', tone);
      expect(screen.getByText('Scheduled')).toBeTruthy();
    }
  );
});
