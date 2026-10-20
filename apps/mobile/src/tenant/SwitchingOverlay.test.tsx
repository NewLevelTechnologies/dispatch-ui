import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SwitchingOverlay } from './SwitchingOverlay';

describe('SwitchingOverlay', () => {
  it('names the destination workspace', async () => {
    await render(
      <ThemeProvider>
        <SwitchingOverlay companyName="Acme HVAC" />
      </ThemeProvider>
    );
    expect(screen.getByText('Switching to Acme HVAC…')).toBeTruthy();
    expect(screen.getByText('AH')).toBeTruthy();
  });
});
