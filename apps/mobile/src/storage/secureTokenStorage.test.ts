/**
 * The mock enforces the two SecureStore constraints the adapter exists to work
 * around, so these tests fail if either workaround is removed:
 *
 *   - keys outside [A-Za-z0-9._-] are rejected (Amplify embeds an email address)
 *   - values over 2048 bytes are rejected (Cognito tokens can exceed it)
 *
 * A permissive mock would pass no matter what the adapter did, which is the
 * usual way a storage test ends up proving nothing.
 *
 * Everything lives inside the factory because jest.mock is hoisted above the
 * imports and may not close over out-of-scope variables. The store is handed
 * back on the mocked module so assertions can inspect what was really written.
 */
jest.mock('expo-secure-store', () => {
  const mockStore = new Map<string, string>();
  const mockValidKey = /^[A-Za-z0-9._-]+$/;
  const mockMaxBytes = 2048;

  const assertKey = (key: string) => {
    if (!mockValidKey.test(key)) throw new Error(`SecureStore: invalid key characters: ${key}`);
  };

  return {
    __store: mockStore,
    __maxBytes: mockMaxBytes,
    setItemAsync: async (key: string, value: string) => {
      assertKey(key);
      if (Buffer.byteLength(value, 'utf8') > mockMaxBytes) {
        throw new Error(`SecureStore: value too large (${Buffer.byteLength(value, 'utf8')})`);
      }
      mockStore.set(key, value);
    },
    getItemAsync: async (key: string) => {
      assertKey(key);
      return mockStore.has(key) ? mockStore.get(key)! : null;
    },
    deleteItemAsync: async (key: string) => {
      assertKey(key);
      mockStore.delete(key);
    },
  };
});

import * as SecureStore from 'expo-secure-store';
import { secureTokenStorage } from './secureTokenStorage';

const { __store: store, __maxBytes: MAX_VALUE_BYTES } = SecureStore as unknown as {
  __store: Map<string, string>;
  __maxBytes: number;
};

/** The real shape of an Amplify token key — note the email in the middle. */
const AMPLIFY_KEY =
  'CognitoIdentityServiceProvider.4vupgqt07fuia6a9df1fob36g9.user@example.com.accessToken';

describe('secureTokenStorage', () => {
  beforeEach(() => {
    store.clear();
  });

  it('accepts keys containing characters SecureStore rejects', async () => {
    // Passing a raw Amplify key straight through would throw on the "@".
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'token-value');
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBe('token-value');
  });

  it('round-trips a value larger than the 2048-byte limit', async () => {
    const big = 'x'.repeat(7000);
    await secureTokenStorage.setItem(AMPLIFY_KEY, big);
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBe(big);
  });

  it('splits oversized values into chunks rather than one rejected write', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'y'.repeat(7000));
    const chunkKeys = [...store.keys()].filter((k) => /\.\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThanOrEqual(4);
    // Every stored piece must be within the limit — that is the whole point.
    for (const value of store.values()) {
      expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(MAX_VALUE_BYTES);
    }
  });

  it('leaves no stale tail when a value shrinks', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'z'.repeat(7000));
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'tiny');
    // Without the purge-before-write, the old chunks would still be read back.
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBe('tiny');
  });

  it('keeps keys distinct that differ only by an escaped character', async () => {
    // 'a_b' and 'a@b' collide if "_" is not itself escaped.
    await secureTokenStorage.setItem('a_b', 'first');
    await secureTokenStorage.setItem('a@b', 'second');
    await expect(secureTokenStorage.getItem('a_b')).resolves.toBe('first');
    await expect(secureTokenStorage.getItem('a@b')).resolves.toBe('second');
  });

  it('returns null for a key that was never written', async () => {
    await expect(secureTokenStorage.getItem('never.written')).resolves.toBeNull();
  });

  it('returns null rather than a truncated value when a chunk is missing', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'w'.repeat(7000));
    // Simulate a partial write by dropping one chunk.
    const victim = [...store.keys()].find((k) => k.endsWith('.1'))!;
    store.delete(victim);
    // A truncated token would fail signature validation far from here.
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBeNull();
  });

  it('removes a value and its index entry', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'token-value');
    await secureTokenStorage.removeItem(AMPLIFY_KEY);
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBeNull();
  });

  it('clears every value including the index', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, 'a'.repeat(7000));
    await secureTokenStorage.setItem('another@key', 'value');
    await secureTokenStorage.clear();

    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBeNull();
    await expect(secureTokenStorage.getItem('another@key')).resolves.toBeNull();
    // SecureStore cannot enumerate, so clear() relies on the index. If the index
    // itself survived, the next clear() would silently miss these keys.
    expect(store.size).toBe(0);
  });

  it('stores an empty string as a value distinct from absence', async () => {
    await secureTokenStorage.setItem(AMPLIFY_KEY, '');
    await expect(secureTokenStorage.getItem(AMPLIFY_KEY)).resolves.toBe('');
  });
});
