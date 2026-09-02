import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';

/**
 * Amplify token storage backed by the iOS Keychain / Android Keystore instead
 * of AsyncStorage.
 *
 * Amplify's React Native integration defaults to AsyncStorage, which is plain
 * text on disk — a refresh token there is readable from a device backup or on a
 * jailbroken device. expo-secure-store puts it behind the platform keystore.
 *
 * Three things make this more than a one-line adapter:
 *
 * 1. KEY CHARSET. SecureStore only accepts [A-Za-z0-9._-]. Amplify's keys embed
 *    the username, which here is an email address, so a raw key containing "@"
 *    is rejected. Keys are escaped below rather than hashed, so they stay
 *    greppable when debugging the keychain.
 *
 * 2. VALUE SIZE. expo-secure-store documents a 2048-byte ceiling per value and
 *    warns that larger writes may fail. Cognito ID and refresh tokens can exceed
 *    that, and a silently dropped write would look like a random logout, so
 *    values are split across chunk keys.
 *
 * 3. NO ENUMERATION. SecureStore cannot list its own keys, so clear() would have
 *    nothing to iterate. An index of written keys is maintained alongside.
 */

/** Conservative: the documented Android limit is 2048, leave room for overhead. */
const CHUNK_SIZE = 1800;

const PREFIX = 'amp_';
const INDEX_KEY = 'amp_index';

/**
 * Escapes anything SecureStore rejects as `_<hex>`. `_` is itself escaped so the
 * encoding stays unambiguous — otherwise a literal `_` could be confused with an
 * escape marker.
 */
function encodeKey(key: string): string {
  return PREFIX + key.replace(/[^A-Za-z0-9.-]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // A corrupt index must not brick sign-in: worst case clear() misses a stale
    // key, which the next setItem overwrites anyway.
    return [];
  }
}

async function writeIndex(keys: string[]): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(keys));
}

/** Deletes the count marker and every chunk belonging to an encoded key. */
async function purge(encoded: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(encoded);
  const count = countRaw ? Number(countRaw) : 0;
  const deletions: Promise<void>[] = [SecureStore.deleteItemAsync(encoded)];
  for (let i = 0; i < count; i += 1) deletions.push(SecureStore.deleteItemAsync(`${encoded}.${i}`));
  await Promise.all(deletions);
}

export const secureTokenStorage: KeyValueStorageInterface = {
  async setItem(key: string, value: string): Promise<void> {
    const encoded = encodeKey(key);

    // Drop any previous value first: a shorter new value would otherwise leave
    // orphaned trailing chunks that getItem would happily concatenate.
    await purge(encoded);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // An empty string is still a value Amplify may store, so keep one chunk.
    if (chunks.length === 0) chunks.push('');

    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(`${encoded}.${i}`, chunk))
    );
    await SecureStore.setItemAsync(encoded, String(chunks.length));

    const index = await readIndex();
    if (!index.includes(encoded)) await writeIndex([...index, encoded]);
  },

  async getItem(key: string): Promise<string | null> {
    const encoded = encodeKey(key);
    const countRaw = await SecureStore.getItemAsync(encoded);
    if (countRaw === null) return null;

    const count = Number(countRaw);
    if (!Number.isFinite(count) || count < 1) return null;

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${encoded}.${i}`))
    );
    // A missing chunk means a partial write; treat it as absent rather than
    // returning a truncated token that would fail signature validation with a
    // far more confusing error.
    if (parts.some((p) => p === null)) return null;

    return parts.join('');
  },

  async removeItem(key: string): Promise<void> {
    const encoded = encodeKey(key);
    await purge(encoded);
    const index = await readIndex();
    const next = index.filter((k) => k !== encoded);
    if (next.length !== index.length) await writeIndex(next);
  },

  async clear(): Promise<void> {
    const index = await readIndex();
    await Promise.all(index.map(purge));
    await SecureStore.deleteItemAsync(INDEX_KEY);
  },
};
