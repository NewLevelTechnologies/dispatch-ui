import type { ReactNode } from 'react';

// Sortable dense-table column header. Renders a `<th>` whose label is a button;
// clicking calls `onSort(sortKey)` (the parent decides the next direction —
// toggle when it's the active column, else a sensible default). The active
// column shows a solid ▲/▼; the rest show a faint ▾ so the column reads as
// sortable. URL-driven sort state lives in the parent (shareable / refresh-safe).
//
// Reusable across the list pages + detail tabs — pair with a server `sort=key,dir`
// param. Reference consumer: PayersPage.
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

export function SortHeader({
  sortKey,
  label,
  current,
  onSort,
  align = 'left',
}: {
  sortKey: string;
  label: ReactNode;
  current: SortState;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const active = current.key === sortKey;
  return (
    <th className={align === 'right' ? 'right' : undefined} aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        // A <button> takes UA font defaults that override inheritance, so it
        // would render in the body font (mixed-case) instead of the uppercase
        // dense-table header style. Force-inherit the th's typography; color
        // stays class-driven (muted default → fg on hover/active).
        style={{ font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
        className={`group inline-flex cursor-pointer items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
      >
        {label}
        <span
          aria-hidden
          className={`text-[8px] leading-none ${active ? 'text-fg-muted' : 'text-fg-dim opacity-40 group-hover:opacity-100'}`}
        >
          {active ? (current.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </button>
    </th>
  );
}
