import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapAppId } from './mapApps';

// Plain AsyncStorage, same tier as the active workspace (src/tenant/tenant.ts)
// — which maps app someone prefers is not a secret, so it has no business in
// the Keychain-backed store that holds auth tokens.
const STORAGE_KEY = 'dispatch.preferredMapApp';

/** Which app this device chose to open directions in, or null if never asked. */
export async function storedMapApp(): Promise<MapAppId | null> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) as MapAppId | null;
  } catch {
    // Losing it just means asking again — never worth failing a Directions tap over.
    return null;
  }
}

export async function persistMapApp(id: MapAppId): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Non-fatal: directions still open, the choice just isn't remembered.
  }
}

/** Forget the choice, so the next Directions tap asks again. */
export async function clearMapApp(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
