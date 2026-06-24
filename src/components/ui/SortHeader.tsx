import type { ReactNode } from 'react';

// Sortable dense-table column header. Renders a `<th>` whose label is a button;
// clicking calls `onSort(sortKey)` (the parent decides the next direction —
// toggle when it's the active column, else a sensible default). The active
// column shows a solid ▲/▼; the rest show a faint ▾ so the column reads as
// sortable. URL-driven sort state lives in the parent (shareable / refresh-safe).
//
// Reusable across the list pages + detail tabs — pair with a server `sort=key,dir`
// param. Reference consumer: PayersPage.
//
// The label button carries `uppercase` so it keeps the dense-table header's
// all-caps look: Tailwind preflight resets `button { text-transform: none }`,
// so without it a sortable header renders in its raw casing while plain `<th>`
// headers stay uppercased. Size / tracking / color still inherit from the <th>.
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
        className={`group inline-flex cursor-pointer items-center gap-1 uppercase ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-fg' : 'hover:text-fg'}`}
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
