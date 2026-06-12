import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

// URL-driven page state for in-tab lists, so they can use the Catalyst
// `ListFooter` / pagination primitive (which is href-based) instead of a
// hand-rolled Prev/Next. The page lives in a named search param (distinct per
// surface, e.g. 'jobsPage' / 'eqPage', so sibling tabs don't collide); page 1
// drops the param to keep the URL clean. `pageHref` preserves all other params
// (filters, ?tab=, ?from=). `resetPage` is for filter/search changes.
export function useUrlPage(key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();

  const raw = parseInt(searchParams.get(key) ?? '1', 10);
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;

  const pageHref = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams);
      if (p <= 1) next.delete(key);
      else next.set(key, String(p));
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname, key],
  );

  const resetPage = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, key]);

  return { page, pageHref, resetPage };
}
