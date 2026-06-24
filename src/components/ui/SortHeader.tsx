import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Sortable dense-table column header. Renders a `<th>` whose label is a button;
// clicking calls `onSort(sortKey)` (the parent decides the next direction —
// toggle when it's the active column, else a sensible default). URL-driven sort
// state lives in the parent (shareable / refresh-safe).
//
// Affordance contract: a header is sortable IFF it shows the ⇅ glyph.
//   • inactive → a faint, ALWAYS-visible double chevron (stacked ▲▼), so the
//     column reads as sortable at rest — not only on hover.
//   • hover    → a compact rounded chip (--bg-hover, --r-sm) hugs just the
//     label+glyph — never the full cell, which would slab a wide column — and
//     the glyph darkens. Negative margins cancel the chip padding so the label
//     stays baseline-aligned with non-sortable headers regardless of column width.
//   • active   → label emphasized to --fg-strong; glyph becomes a single solid
//     ▲ (asc) / ▼ (desc). Exactly one column active at a time.
// Monochrome only — emphasis is weight + --fg-strong, never accent (accent is
// reserved for navigation). Non-sortable columns use a plain <th> (no glyph).
//
// `uppercase` on the button keeps the dense-table header's all-caps look:
// Tailwind preflight resets `button { text-transform: none }`. Size / tracking /
// color otherwise inherit from the <th>.
//
// The button's aria-label ("Sort by <col>", via common.actions.sortBy) gives AT
// an explicit action and keeps a sort header distinct from a same-named filter
// chip (e.g. a "Status" column vs a "Status" filter chip).
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
  const { t } = useTranslation();
  const active = current.key === sortKey;
  return (
    <th
      className={align === 'right' ? 'right' : undefined}
      aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={typeof label === 'string' ? t('common.actions.sortBy', { field: label }) : undefined}
        className={`group -mx-[7px] -my-[3px] inline-flex cursor-pointer items-center gap-1 rounded-[var(--r-sm)] px-[7px] py-[3px] uppercase transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-fg-strong' : ''}`}
      >
        {label}
        {active ? (
          <span aria-hidden className="text-[9px] leading-none text-fg-muted">
            {current.dir === 'asc' ? '▲' : '▼'}
          </span>
        ) : (
          // Faint double chevron = "you can sort me". Always visible at rest;
          // darkens on hover (group-hover, group = the chip button).
          <span
            aria-hidden
            className="inline-flex -translate-y-px flex-col text-[7px] leading-[0.7] text-fg-dim opacity-40 transition-opacity group-hover:opacity-95"
          >
            <span>{'▲'}</span>
            <span>{'▼'}</span>
          </span>
        )}
      </button>
    </th>
  );
}
