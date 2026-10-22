import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the tech asked for — not what's on screen. `system` defers to the OS
 * appearance; the other two override it. Same three options web offers in
 * Account Settings, so the two apps answer the question the same way.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// Plain AsyncStorage, same tier as the active workspace and the maps choice —
// an appearance preference is not a secret.
const STORAGE_KEY = 'dispatch.themePreference';

function isPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** The tech's stored choice, or null if they've never made one. */
export async function storedThemePreference(): Promise<ThemePreference | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // Guard the cast: a value written by an older build (or hand-edited) that
    // isn't one of the three would otherwise be trusted into the palette lookup.
    return isPreference(raw) ? raw : null;
  } catch {
    // Losing it just falls back to following the OS, which is the default
    // anyway — never worth failing a launch over.
    return null;
  }
}

export async function persistThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Non-fatal: the theme still applies, it just isn't remembered.
  }
}
