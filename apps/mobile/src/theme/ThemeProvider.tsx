import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ColorSchemeName } from 'react-native';
import { palettes, radii, spacing, typography } from './tokens';
import type { ColorTokens, ThemeMode } from './tokens';

export type Theme = {
  mode: ThemeMode;
  colors: ColorTokens;
  radii: typeof radii;
  spacing: typeof spacing;
  typography: typeof typography;
};

const ThemeContext = createContext<Theme | null>(null);

function buildTheme(mode: ThemeMode): Theme {
  return { mode, colors: palettes[mode], radii, spacing, typography };
}

/**
 * Pulled out as a pure function so it's testable without mocking react-native
 * itself — `useColorScheme` pulls in native modules (TurboModuleRegistry)
 * that aren't available under Jest, so a test that fakes the hook via
 * `jest.mock('react-native', ...)` drags all of that in too.
 */
export function resolveMode(scheme: ColorSchemeName | null | undefined): ThemeMode {
  return scheme === 'dark' ? 'dark' : 'light';
}

/**
 * Follows the OS appearance setting, same default as web's `prefers-color-
 * scheme` fallback. There is no in-app light/dark toggle yet (web has one in
 * Account settings) — add it here, as an override on top of `scheme`, when a
 * technician-facing settings screen exists to put it in.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode = resolveMode(scheme);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
