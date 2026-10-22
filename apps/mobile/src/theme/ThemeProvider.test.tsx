import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme, resolveMode } from './ThemeProvider';

function Probe() {
  const theme = useTheme();
  return (
    <Text>
      {theme.mode}:{theme.colors.accent500}
    </Text>
  );
}

describe('resolveMode', () => {
  it('resolves "dark" to the dark theme', () => {
    expect(resolveMode('dark')).toBe('dark');
  });

  it.each([undefined, null, 'light'] as const)('falls back to light for %s', (scheme) => {
    expect(resolveMode(scheme)).toBe('light');
  });
});

describe('ThemeProvider', () => {
  it('throws for a consumer rendered outside the provider', async () => {
    // Swallow the expected React error-boundary console noise.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow(
      'useTheme must be used inside <ThemeProvider>'
    );
    spy.mockRestore();
  });

  it('provides the light palette by default under test (no OS appearance available)', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByText('light:#0085a2')).toBeTruthy();
  });
});
