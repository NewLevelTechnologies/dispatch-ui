import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getUserPreferences,
  updateUserPreferences,
  type ThemePreference,
} from '../api/userPreferencesApi';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark' | 'system';

// Map between UI theme values and API enum values
const themeToApiTheme = (theme: Theme): ThemePreference => {
  return theme.toUpperCase() as ThemePreference;
};

const apiThemeToTheme = (apiTheme: ThemePreference | null): Theme => {
  if (!apiTheme) return 'system';
  return apiTheme.toLowerCase() as Theme;
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // Fetch user preferences from API (only when authenticated)
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: getUserPreferences,
    enabled: isAuthenticated,
  });

  // Initialize theme from API preferences or localStorage
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return (stored as Theme) || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: updateUserPreferences,
  });

  // Sync theme from API preferences when they become available
  useEffect(() => {
    if (preferences?.theme) {
      const convertedTheme = apiThemeToTheme(preferences.theme);
      if (convertedTheme !== theme) {
        setThemeState(convertedTheme);
        localStorage.setItem('theme', convertedTheme);
      }
    }
    // Only sync when preferences first load, not on every theme change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences?.theme]);

  useEffect(() => {
    const root = window.document.documentElement;

    const getSystemTheme = () => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const applyTheme = (newTheme: Theme) => {
      const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
      setResolvedTheme(resolved);

      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);

    // Listen for system theme changes when in system mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    setThemeState(newTheme);

    // Persist to API if authenticated
    if (isAuthenticated) {
      updatePreferencesMutation.mutate({ theme: themeToApiTheme(newTheme) });
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
