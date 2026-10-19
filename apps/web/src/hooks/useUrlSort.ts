import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortDir, SortState } from '../components/ui/SortHeader';

// URL-driven column sort for list pages, paired with `SortHeader`. State lives
// in `?sort=key,dir` (shareable / refresh-safe) — the same spelling the BE's
// Spring `sort` param takes, so server-sorted pages pass `sortParam` straight
// through. Absent param = `defaultSort`, which should mirror the BE default so
// "no param" and "default" read identically.
//
// Clicking the active column toggles its direction; clicking another column
// starts at that column's natural direction — desc for `descFirst` keys
// (amounts, counts, dates read best most-first), asc for text. Changing the
// sort resets pagination (`pageKey`).
//
// `allowed` (optional) whitelists keys: an unknown/stale `?sort=` key falls back
// to the default rather than leaving no column marked active.
export function useUrlSort({
  defaultSort,
  descFirst = [],
  allowed,
  pageKey = 'page',
}: {
  defaultSort: SortState;
  descFirst?: readonly string[];
  allowed?: readonly string[];
  pageKey?: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('sort');

  const current = useMemo<SortState>(() => {
    if (raw) {
      const [key, dir] = raw.split(',');
      if (key && (!allowed || allowed.includes(key))) {
        return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
      }
    }
    return defaultSort;
  }, [raw, allowed, defaultSort]);

  // The raw param when it parsed to a usable key, else undefined (→ BE default).
  const sortParam = current === defaultSort ? undefined : `${current.key},${current.dir}`;

  const onSort = useCallback(
    (key: string) => {
      const dir: SortDir =
        key === current.key
          ? current.dir === 'asc'
            ? 'desc'
            : 'asc'
          : descFirst.includes(key)
            ? 'desc'
            : 'asc';
      const next = new URLSearchParams(searchParams);
      next.set('sort', `${key},${dir}`);
      next.delete(pageKey);
      setSearchParams(next, { replace: false });
    },
    [current, descFirst, searchParams, setSearchParams, pageKey],
  );

  return { current, sortParam, onSort };
}

// Client-side sort for lists the BE returns whole (unpaged arrays), driven by
// the same `SortState`. `accessors` maps each sort key to a comparable value;
// nulls/empties sort last in both directions (matching the BE's nulls-last
// convention). Strings compare case-insensitively with numeric collation so
// "PO-9" < "PO-10".
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState,
  accessors: Record<string, (row: T) => string | number | null | undefined>,
): T[] {
  const get = accessors[sort.key];
  if (!get) return [...rows];
  const factor = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    const aEmpty = av === null || av === undefined || av === '';
    const bEmpty = bv === null || bv === undefined || bv === '';
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
}
