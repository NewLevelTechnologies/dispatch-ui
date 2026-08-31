// useMediaQuery.ts — subscribe to a CSS media query and re-render when
// the match state changes. Built on useSyncExternalStore so the
// subscription lives outside React state (no set-state-in-effect, no
// hydration mismatch — Vite is client-only anyway).
import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
