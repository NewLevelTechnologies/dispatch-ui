/**
 * Covers the auth provider handed to @dispatch/api — the thing that decides
 * whether an outbound request carries a Cognito token.
 *
 * The module wires itself up on import, so the provider is captured from the
 * setAuthProvider spy and invoked directly.
 */
const mockFetchAuthSession = jest.fn();
const mockSetAuthProvider = jest.fn();
const mockSetBaseURL = jest.fn();

// Importing the real config would configure Amplify for real; it has its own
// suite in src/config.
jest.mock('./../config/amplify', () => ({}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: (...a: unknown[]) => mockFetchAuthSession(...a),
}));

jest.mock('@dispatch/api', () => ({
  apiClient: {
    setAuthProvider: (...a: unknown[]) => mockSetAuthProvider(...a),
    setBaseURL: (...a: unknown[]) => mockSetBaseURL(...a),
  },
}));

const ORIGINAL_ENV = process.env;

type AuthProvider = { getAccessToken: () => Promise<string | null> };

/** Re-imports the module in a clean registry and returns the wired provider. */
function loadSetup(): AuthProvider {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./setup');
  });
  return mockSetAuthProvider.mock.calls.at(-1)![0] as AuthProvider;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('mobile api setup', () => {
  it('attaches the Cognito access token to requests', async () => {
    mockFetchAuthSession.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'jwt-token-value' } },
    });

    const provider = loadSetup();

    await expect(provider.getAccessToken()).resolves.toBe('jwt-token-value');
  });

  it('returns null when there is no session', async () => {
    // Signed out: no tokens on the session object.
    mockFetchAuthSession.mockResolvedValue({});

    const provider = loadSetup();

    await expect(provider.getAccessToken()).resolves.toBeNull();
  });

  it('returns null instead of throwing when the refresh fails', async () => {
    // An expired refresh token rejects here. Throwing from an interceptor would
    // surface far from the cause; a null lets the request 401 and the UI handle
    // it.
    mockFetchAuthSession.mockRejectedValue(new Error('Refresh token has expired'));

    const provider = loadSetup();

    await expect(provider.getAccessToken()).resolves.toBeNull();
  });

  it('points the shared client at the configured API origin', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/api/v1';

    loadSetup();

    expect(mockSetBaseURL).toHaveBeenCalledWith('https://api.example.test/api/v1');
  });

  it('leaves the packaged default in place when no origin is set', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;

    loadSetup();

    // Overriding with undefined would be worse than not calling it at all.
    expect(mockSetBaseURL).not.toHaveBeenCalled();
  });
});
