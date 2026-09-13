// ─────────────────────────────────────────────────────────────────
// ListToolbar.tsx — search input + filter chips on one horizontal row.
//
//   <ListToolbar
//     search={
//       <ListSearch
//         placeholder="Search by name, phone, or email…"
//         value={searchInput}
//         onChange={handleSearchInputChange}
//       />
//     }
//   >
//     <FilterChipListbox ... />
//     <FilterChipListbox ... />
//   </ListToolbar>
//
// All children sit on the same baseline (items-end), consistent gap.
// The search expands to fill remaining space; chips keep their natural
// width. Loose on the canvas — not wrapped in a Card.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input, InputGroup } from '../catalyst/input';
import { dense } from './dense';

export function ListToolbar({
  search,
  children,
  className,
}: {
  search?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-3 flex flex-wrap items-end gap-2', className)}>
      {search}
      {children}
    </div>
  );
}

export function ListSearch({
  placeholder,
  value,
  onChange,
  ariaLabel,
  compact,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Sits in a chrome band rather than above a list: 26px to match the
   *  controls beside it, and a fixed width so the filters group next to it
   *  instead of being pushed to the far edge. */
  compact?: boolean;
}) {
  return (
    <InputGroup
      className={
        compact
          ? // The icon is sized and positioned for a 32px field: 16px lands
            // flush with the bottom edge of a 26px one and reads heavy beside
            // 11.5px type. 14px, centred on the smaller field.
            'w-[200px] shrink-0 [&>[data-slot=icon]]:size-3.5! [&>[data-slot=icon]]:top-[6px]!'
          : 'min-w-[260px] flex-1'
      }
    >
      <MagnifyingGlassIcon data-slot="icon" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? placeholder}
        className={compact ? dense.inputChrome : dense.input}
      />
    </InputGroup>
  );
}
