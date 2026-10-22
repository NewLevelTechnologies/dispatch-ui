import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from './ThemeProvider';
import { ThemePreferenceCard } from './ThemePreferenceCard';
import { persistThemePreference, storedThemePreference } from './themePreference';

jest.mock('./themePreference', () => ({
  ...jest.requireActual('./themePreference'),
  storedThemePreference: jest.fn(),
  persistThemePreference: jest.fn(),
}));

const mockStored = storedThemePreference as jest.Mock;
const mockPersist = persistThemePreference as jest.Mock;

const renderCard = () =>
  render(
    <ThemeProvider>
      <ThemePreferenceCard />
    </ThemeProvider>,
  );

const selectedLabels = () =>
  screen
    .getAllByRole('radio')
    .filter((row) => row.props.accessibilityState?.selected)
    .map((row) => row.props.accessibilityLabel);

beforeEach(() => {
  jest.clearAllMocks();
  mockStored.mockResolvedValue(null);
  mockPersist.mockResolvedValue(undefined);
});

describe('ThemePreferenceCard', () => {
  it('offers the same three options web does', async () => {
    await renderCard();

    expect(screen.getByText('Theme')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
  });

  it('starts on System — the app follows the phone until told otherwise', async () => {
    await renderCard();
    expect(selectedLabels()).toEqual(['System']);
  });

  it('marks the stored choice once it loads, and only that one', async () => {
    mockStored.mockResolvedValue('dark');

    await renderCard();

    expect(await screen.findByText('Dark')).toBeTruthy();
    expect(selectedLabels()).toEqual(['Dark']);
  });

  it('records a new choice when one is tapped', async () => {
    await renderCard();

    await fireEvent.press(screen.getByText('Light'));

    expect(mockPersist).toHaveBeenCalledWith('light');
    expect(selectedLabels()).toEqual(['Light']);
  });
});
