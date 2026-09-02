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

jest.mock('expo-router', () => ({
  Stack: () => null,
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments(),
}));

// Importing the real one configures Amplify as a side effect.
jest.mock('../../api/setup', () => ({}));

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: (...a: unknown[]) => mockGetCurrentUser(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments.mockReturnValue([]);
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
