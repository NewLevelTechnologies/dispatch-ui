import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider, useTheme, resolveMode } from './ThemeProvider';
import { persistThemePreference, storedThemePreference } from './themePreference';

jest.mock('./themePreference', () => ({
  ...jest.requireActual('./themePreference'),
  storedThemePreference: jest.fn(),
  persistThemePreference: jest.fn(),
}));

const mockStored = storedThemePreference as jest.Mock;
const mockPersist = persistThemePreference as jest.Mock;

function Probe() {
  const { mode, preference, colors, setPreference } = useTheme();
  return (
    <>
      <Text>
        {mode}:{preference}:{colors.accent500}
      </Text>
      <Text onPress={() => setPreference('dark')}>go dark</Text>
    </>
  );
}

const renderThemed = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockStored.mockResolvedValue(null);
  mockPersist.mockResolvedValue(undefined);
});

describe('resolveMode', () => {
  it('honours an explicit choice over the OS', () => {
    expect(resolveMode('dark', 'light')).toBe('dark');
    expect(resolveMode('light', 'dark')).toBe('light');
  });

  it('follows the OS when the preference is "system"', () => {
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', 'light')).toBe('light');
  });

  it.each([undefined, null] as const)('reads an unknown OS appearance (%s) as light', (scheme) => {
    expect(resolveMode('system', scheme)).toBe('light');
  });
});

describe('ThemeProvider', () => {
  it('throws for a consumer rendered outside the provider', async () => {
    // Swallow the expected React error-boundary console noise.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow('useTheme must be used inside <ThemeProvider>');
    spy.mockRestore();
  });

  it('defaults to following the phone, which reads light under test', async () => {
    await renderThemed();
    expect(screen.getByText('light:system:#0085a2')).toBeTruthy();
  });

  it('applies a stored preference once it loads', async () => {
    mockStored.mockResolvedValue('dark');

    await renderThemed();

    expect(await screen.findByText(/^dark:dark:/)).toBeTruthy();
  });

  it('switches palette when the tech picks one, and remembers it', async () => {
    await renderThemed();

    await fireEvent.press(screen.getByText('go dark'));

    expect(screen.getByText(/^dark:dark:/)).toBeTruthy();
    expect(mockPersist).toHaveBeenCalledWith('dark');
  });

  it('ignores a missing stored preference rather than overriding the default', async () => {
    mockStored.mockResolvedValue(null);
    await renderThemed();
    expect(screen.getByText(/:system:/)).toBeTruthy();
  });
});
