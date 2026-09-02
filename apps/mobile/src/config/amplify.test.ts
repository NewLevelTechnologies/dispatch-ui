/**
 * The config module runs its work at import time, so each case re-requires it in
 * an isolated registry with a different environment. jest.isolateModules is what
 * makes that possible — a plain import would be cached after the first test and
 * every later case would assert against the first one's environment.
 *
 * `require` rather than `await import()`: Jest runs these in CJS, where a
 * dynamic import throws "A dynamic import callback was invoked without
 * --experimental-vm-modules".
 */
const mockConfigure = jest.fn();
const mockSetKeyValueStorage = jest.fn();

jest.mock('aws-amplify', () => ({ Amplify: { configure: (...a: unknown[]) => mockConfigure(...a) } }));
jest.mock('aws-amplify/auth/cognito', () => ({
  cognitoUserPoolsTokenProvider: {
    setKeyValueStorage: (...a: unknown[]) => mockSetKeyValueStorage(...a),
  },
}));
jest.mock('react-native-get-random-values', () => ({}));

const ORIGINAL_ENV = process.env;

function loadConfig(): unknown {
  let error: unknown = null;
  jest.isolateModules(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./amplify');
    } catch (e) {
      error = e;
    }
  });
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('amplify config', () => {
  it('configures Cognito from the environment', () => {
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_TEST';
    process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID = 'client-abc';

    expect(loadConfig()).toBeNull();

    expect(mockConfigure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-east-1_TEST',
          userPoolClientId: 'client-abc',
          loginWith: { email: true },
        },
      },
    });
  });

  it('moves token storage off AsyncStorage onto the keychain', () => {
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_TEST';
    process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID = 'client-abc';

    loadConfig();

    // Amplify's React Native default is AsyncStorage, which is plain text.
    expect(mockSetKeyValueStorage).toHaveBeenCalledTimes(1);
    const storage = mockSetKeyValueStorage.mock.calls[0][0];
    expect(typeof storage.setItem).toBe('function');
    expect(typeof storage.getItem).toBe('function');
    expect(typeof storage.removeItem).toBe('function');
    expect(typeof storage.clear).toBe('function');
  });

  it('applies the storage only after configure, never before', () => {
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_TEST';
    process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID = 'client-abc';

    loadConfig();

    // The token provider reads configuration when first used, so swapping
    // storage first would have no configured provider to attach to.
    const configureOrder = mockConfigure.mock.invocationCallOrder[0];
    const storageOrder = mockSetKeyValueStorage.mock.invocationCallOrder[0];
    expect(configureOrder).toBeLessThan(storageOrder);
  });

  it('fails loudly when the pool id is missing', () => {
    delete process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
    process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID = 'client-abc';

    const error = loadConfig();

    // A missing value is a build-time misconfiguration; better to say so here
    // than let Amplify throw something opaque on the first sign-in.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Missing Cognito configuration/);
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('fails loudly when the client id is missing', () => {
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_TEST';
    delete process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;

    const error = loadConfig();

    expect(error).toBeInstanceOf(Error);
    // The message names the fix, including the --clear that people forget.
    expect((error as Error).message).toMatch(/pnpm dev --clear/);
  });
});
