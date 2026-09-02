import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../auth/AuthContext';
import HomeScreen from '../index';

/**
 * The home screen is the POC's proof surface: it shows who is signed in and the
 * result of an authenticated API read. These tests cover the three states that
 * matter — loading, loaded, and failed — plus sign-out.
 */
const mockGetSettings = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockSignOut = jest.fn();

// Mocked wholesale: importing the real module configures Amplify as a side
// effect, which a screen test has no business triggering.
jest.mock('../../api/setup', () => ({
  tenantSettingsApi: { getSettings: (...args: unknown[]) => mockGetSettings(...args) },
}));

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const renderHome = async () => {
  // retry:false so a rejected query surfaces as an error instead of a timeout.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <HomeScreen />
      </AuthProvider>
    </QueryClientProvider>
  );
};

const SETTINGS = {
  companyName: 'Acme HVAC',
  phone: '6025550100',
  timezone: 'America/Phoenix',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({
    username: 'cognito-sub',
    signInDetails: { loginId: 'tech@acme.com' },
  });
});

describe('HomeScreen', () => {
  it('names the signed-in user', async () => {
    mockGetSettings.mockResolvedValue(SETTINGS);
    await renderHome();
    await waitFor(() => expect(screen.getByText('Signed in as tech@acme.com')).toBeTruthy());
  });

  it('shows tenant data returned by the authenticated request', async () => {
    mockGetSettings.mockResolvedValue(SETTINGS);
    await renderHome();

    await waitFor(() => expect(screen.getByText('Authenticated request succeeded')).toBeTruthy());
    expect(screen.getByText('Acme HVAC')).toBeTruthy();
    expect(screen.getByText('America/Phoenix')).toBeTruthy();
    // Routed through @dispatch/utils rather than printed raw.
    expect(screen.getByText('(602) 555-0100')).toBeTruthy();
  });

  it('falls back to a dash for fields the tenant has not set', async () => {
    mockGetSettings.mockResolvedValue({ companyName: 'Acme HVAC', phone: null, timezone: null });
    await renderHome();

    await waitFor(() => expect(screen.getByText('Acme HVAC')).toBeTruthy());
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('reports why the request failed', async () => {
    mockGetSettings.mockRejectedValue(new Error('Request failed with status code 401'));
    await renderHome();

    await waitFor(() => expect(screen.getByText('Could not load tenant settings')).toBeTruthy());
    // The message is shown verbatim: a 401 means the token never arrived, and
    // anything else means auth worked and something later broke.
    expect(screen.getByText('Request failed with status code 401')).toBeTruthy();
  });

  it('signs out when asked', async () => {
    mockGetSettings.mockResolvedValue(SETTINGS);
    mockSignOut.mockResolvedValue(undefined);
    await renderHome();
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());

    await fireEvent.press(screen.getByText('Sign out'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
