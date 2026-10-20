import { render, waitFor } from '@testing-library/react-native';
import RootLayout from '../_layout';

/**
 * Covers the redirect rules in AuthGate: where a user lands as auth state
 * settles. The redirect lives in an effect rather than a conditional render
 * because expo-router needs the navigator mounted before it accepts a
 * navigation — so a test that only checked markup would miss it entirely.
 */
const mockReplace = jest.fn();
const mockSegments = jest.fn<string[], []>();
const mockGetCurrentUser = jest.fn();
const mockListMyTenants = jest.fn();

jest.mock('expo-router', () => {
  // A real <Stack> renders its <Stack.Screen> children as route config, not
  // DOM — the mock only needs to not crash when one is passed, not do
  // anything with it.
  const MockStack = () => null;
  MockStack.Screen = () => null;
  return {
    Stack: MockStack,
    useRouter: () => ({ replace: mockReplace }),
    useSegments: () => mockSegments(),
  };
});

// Without `initialMetrics`, the real SafeAreaProvider waits on a native
// onInsetsChange event that never fires under the test renderer — which
// stalls the whole tree's effects, including AuthProvider's. This test is
// about the auth redirect, not safe-area measurement, so stub it out the
// same way the mocks above stub out expo-router/Amplify.
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View };
});

// Importing the real one configures Amplify as a side effect.
jest.mock('../../api/setup', () => ({
  apiClient: { setTenantRevokedHandler: jest.fn() },
  // Never resolves: this test is about the auth redirect, not the tenant
  // gate, and the tabs group it would gate is behind a Stack mocked to
  // render nothing anyway.
  userApi: { listMyTenants: (...a: unknown[]) => mockListMyTenants(...a) },
}));

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: (...a: unknown[]) => mockGetCurrentUser(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments.mockReturnValue([]);
  // React Query v5 rejects a queryFn that resolves to `undefined` — give it a
  // real (empty) answer so TenantProvider's bootstrap query settles instead
  // of getting stuck retrying an invalid result.
  mockListMyTenants.mockResolvedValue([]);
});

describe('RootLayout auth gate', () => {
  it('sends a signed-out user to the sign-in screen', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('not signed in'));

    await render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in'));
  });

  it('leaves a signed-out user alone once already on sign-in', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('not signed in'));
    mockSegments.mockReturnValue(['sign-in']);

    await render(<RootLayout />);

    // Redirecting to the screen you are on would loop.
    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends a signed-in user off the sign-in screen', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'x', signInDetails: { loginId: 'a@b.com' } });
    mockSegments.mockReturnValue(['sign-in']);

    await render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('leaves a signed-in user where they are', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'x', signInDetails: { loginId: 'a@b.com' } });
    mockSegments.mockReturnValue([]);

    await render(<RootLayout />);

    await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while auth state is still unknown', async () => {
    // A pending session check must not bounce the user to sign-in and back.
    mockGetCurrentUser.mockReturnValue(new Promise(() => {}));

    await render(<RootLayout />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
