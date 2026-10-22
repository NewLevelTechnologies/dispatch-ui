import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { MapsPreferenceCard } from './MapsPreferenceCard';
import { useMapsPreference } from './useMapsPreference';
import { mapAppsFor } from './mapApps';

jest.mock('./useMapsPreference', () => ({ useMapsPreference: jest.fn() }));

const mockUseMapsPreference = useMapsPreference as jest.Mock;
const mockChoose = jest.fn();

const IOS_APPS = mapAppsFor('ios');

const renderCard = () =>
  render(
    <ThemeProvider>
      <MapsPreferenceCard />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MapsPreferenceCard', () => {
  it('renders nothing while the device is still being probed', async () => {
    mockUseMapsPreference.mockReturnValue({ apps: [], selected: null, choose: mockChoose, isLoading: true });
    await renderCard();
    expect(screen.queryByText('Directions')).toBeNull();
  });

  it('renders nothing when there is only one maps app — no setting to offer', async () => {
    mockUseMapsPreference.mockReturnValue({
      apps: IOS_APPS.slice(0, 1),
      selected: null,
      choose: mockChoose,
      isLoading: false,
    });
    await renderCard();
    expect(screen.queryByText('Directions')).toBeNull();
  });

  it('lists every available app once there is a real choice', async () => {
    mockUseMapsPreference.mockReturnValue({ apps: IOS_APPS, selected: 'google', choose: mockChoose, isLoading: false });
    await renderCard();

    expect(screen.getByText('Directions')).toBeTruthy();
    expect(screen.getByText('Apple Maps')).toBeTruthy();
    expect(screen.getByText('Google Maps')).toBeTruthy();
    expect(screen.getByText('Waze')).toBeTruthy();
  });

  it('marks the chosen app as selected, and only that one', async () => {
    mockUseMapsPreference.mockReturnValue({ apps: IOS_APPS, selected: 'waze', choose: mockChoose, isLoading: false });
    await renderCard();

    const selected = screen.getAllByRole('radio').filter((row) => row.props.accessibilityState?.selected);
    expect(selected).toHaveLength(1);
    expect(screen.getByText('Waze')).toBeTruthy();
  });

  it('marks nothing as selected before the tech has ever been asked', async () => {
    mockUseMapsPreference.mockReturnValue({ apps: IOS_APPS, selected: null, choose: mockChoose, isLoading: false });
    await renderCard();

    const selected = screen.getAllByRole('radio').filter((row) => row.props.accessibilityState?.selected);
    expect(selected).toHaveLength(0);
  });

  it('records a new choice when one is tapped', async () => {
    mockUseMapsPreference.mockReturnValue({ apps: IOS_APPS, selected: 'apple', choose: mockChoose, isLoading: false });
    await renderCard();

    await fireEvent.press(screen.getByText('Waze'));

    expect(mockChoose).toHaveBeenCalledWith('waze');
  });
});
