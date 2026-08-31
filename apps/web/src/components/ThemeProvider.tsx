// ─────────────────────────────────────────────────────────────────
// ThemeProvider
//
// Applies "theme-light" / "theme-dark" (and optionally "accent-cool")
// classes on <html>. Persists choice to localStorage. The inline
// script in index.html runs before React mounts so the theme class is
// on <html> on first paint (prevents FOUC).
//
// Usage:
//   <ThemeProvider>...</ThemeProvider>
//   const { mode, accent, setMode, setAccent } = useTheme();
// ─────────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Mode = 'light' | 'dark' | 'system';
type Accent = 'warm' | 'cool';

type ThemeContextValue = {
  mode: Mode;
  accent: Accent;
  setMode: (m: Mode) => void;
  setAccent: (a: Accent) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// `system` resolves to whatever the OS reports via prefers-color-scheme.
function resolveMode(mode: Mode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light');
  const [accent, setAccentState] = useState<Accent>('cool');

  // Hydrate from localStorage on first client render. The bootstrap script in
  // index.html already set the matching classes on <html> pre-mount, so this
  // just syncs React state to what's on the DOM. Default = light + cool.
  useEffect(() => {
    const saved = localStorage.getItem('theme-mode') as Mode | null;
    const savedAccent = localStorage.getItem('theme-accent') as Accent | null;
    /* eslint-disable react-hooks/set-state-in-effect */
    setModeState(saved ?? 'light');
    setAccentState(savedAccent ?? 'cool');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Apply classes to <html> whenever mode/accent change. In `system` mode we
  // also subscribe to the OS color-scheme MediaQueryList so the page re-tints
  // live if the user flips their OS theme.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = resolveMode(mode);
      root.classList.remove('theme-light', 'theme-dark');
      root.classList.add(`theme-${resolved}`);
      root.style.colorScheme = resolved;
    };
    apply();
    root.classList.toggle('accent-cool', accent === 'cool');

    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [mode, accent]);

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem('theme-mode', m);
  };
  const setAccent = (a: Accent) => {
    setAccentState(a);
    localStorage.setItem('theme-accent', a);
  };

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

// Mirror of the inline bootstrap script in index.html — kept here as
// the source of truth so future Next.js/SSR ports have a drop-in.
export const themeBootstrapScript = `
(function() {
  try {
    var m = localStorage.getItem('theme-mode') || 'light';
    var a = localStorage.getItem('theme-accent') || 'cool';
    var resolved = m;
    if (m === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add('theme-' + resolved);
    if (a === 'cool') document.documentElement.classList.add('accent-cool');
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

// Drop-in toggle component from the handoff — kept available even though
// AppLayout uses its own toggle UI. Useful for ad-hoc placements / debug.
export function ThemeToggle() {
  const { mode, accent, setMode, setAccent } = useTheme();
  // Two-state toggle for the ad-hoc widget — the System option lives in the
  // canonical Preferences card on Account Settings.
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        className="btn sm"
        aria-label="Toggle theme"
      >
        {mode === 'dark' ? '☀ Light' : '☾ Dark'}
      </button>
      <button
        onClick={() => setAccent(accent === 'warm' ? 'cool' : 'warm')}
        className="btn sm"
        aria-label="Toggle accent"
      >
        {accent === 'warm' ? 'Warm' : 'Cool'}
      </button>
    </div>
  );
}
