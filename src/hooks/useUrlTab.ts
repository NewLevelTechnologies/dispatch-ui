import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// URL-driven active-tab state for detail pages, so a refreshed / shared /
// new-tab URL restores the open tab (and, paired with useUrlPage, the page
// within it). The tab lives in a search param (default 'tab'); the fallback tab
// drops the param to keep the canonical URL clean. Switching tabs pushes a
// history entry so Back returns to the previous tab. All other params
// (?from=, pagination keys, …) are preserved.
export function useUrlTab<T extends string>(
  tabs: readonly T[],
  fallback: T,
  key = 'tab',
): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const active = raw && (tabs as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setActive = useCallback(
    (tab: T) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab === fallback) next.delete(key);
        else next.set(key, tab);
        return next;
      });
    },
    [setSearchParams, fallback, key],
  );

  return [active, setActive];
}
