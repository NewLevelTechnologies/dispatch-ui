import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ColorSchemeName } from 'react-native';
import { palettes, radii, spacing, typography } from './tokens';
import type { ColorTokens, ThemeMode } from './tokens';
import { persistThemePreference, storedThemePreference, type ThemePreference } from './themePreference';

export type Theme = {
  /** The palette actually in use, once the preference and the OS are reconciled. */
  mode: ThemeMode;
  /** What the tech asked for. `system` means "whatever the phone is doing". */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colors: ColorTokens;
  radii: typeof radii;
  spacing: typeof spacing;
  typography: typeof typography;
};

const ThemeContext = createContext<Theme | null>(null);

/**
 * Pulled out as a pure function so it's testable without mocking react-native
 * itself — `useColorScheme` pulls in native modules (TurboModuleRegistry)
 * that aren't available under Jest, so a test that fakes the hook via
 * `jest.mock('react-native', ...)` drags all of that in too.
 *
 * An explicit choice wins; `system` defers to the OS. A null scheme (the OS
 * hasn't said, or the app is pinned) reads as light, matching web's
 * `prefers-color-scheme` fallback.
 */
export function resolveMode(preference: ThemePreference, scheme: ColorSchemeName | null | undefined): ThemeMode {
  if (preference === 'light' || preference === 'dark') return preference;
  return scheme === 'dark' ? 'dark' : 'light';
}

/**
 * Appearance: follows the phone by default, overridable in Profile.
 *
 * For `system` to mean anything, `app.json` must set
 * `userInterfaceStyle: 'automatic'` — without it iOS pins the app to light and
 * `useColorScheme()` can only ever answer 'light', which is what made the dark
 * palette unreachable for the app's first seven phases.
 *
 * The stored preference loads asynchronously (AsyncStorage has no sync API),
 * so the first frame renders at the default. A tech who chose the opposite of
 * their phone's setting may see one frame of the other — brief, and only for
 * them; blocking the whole app on a storage read to avoid it costs more than
 * it saves.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await storedThemePreference();
      if (active && stored) setPreferenceState(stored);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void persistThemePreference(next);
  }, []);

  const mode = resolveMode(preference, scheme);
  const theme = useMemo(
    () => ({ mode, preference, setPreference, colors: palettes[mode], radii, spacing, typography }),
    [mode, preference, setPreference],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
