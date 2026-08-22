// ─────────────────────────────────────────────────────────────────────────────
// StatusPickerChip — single-select chevron picker with an "All" shortcut.
//
// A record has exactly one status; the list view scopes to one status at a
// time or all of them. The picker exposes that directly:
//
//   - Each status row is a single-pick option (radio-style ✓ on the selected
//     row). Picking one replaces the scope and closes the popover.
//   - An "All …" shortcut at the bottom of the popover. One click switches
//     the view to every status. One click on a single row switches it back.
//
// Defaulting to ['active'] is the right scope for both list pages — but it
// must be *visible*, not silent, otherwise users hit "why can't I find the
// inactive record I know exists." The chip readout always shows the explicit
// selection (`Status: Active`, `Status: All`).
//
// Wire shape stays array-based for callers — single pick is `[id]`, "All" is
// every option's id — so the consumer pages (CustomersPage,
// ServiceLocationsPage) and the URL serialization don't need to change.
//
//   <StatusPickerChip
//     label="Status"
//     options={[
//       { id: 'active',   label: 'Active',   count: 412 },
//       { id: 'inactive', label: 'Inactive', count:  18 },
//     ]}
//     selected={statuses}
//     onChange={(next) => updateFilters({ status: next })}
//   />
// ─────────────────────────────────────────────────────────────────────────────
import * as Headless from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';

type Option = { id: string; label: string; count?: number };

// Sentinel for the "All" row inside Headless.Listbox. The consumer never
// sees it — onChange maps it back to the full option-id array.
const ALL_SENTINEL = '__all__';

export function StatusPickerChip({
  label = 'Status',
  ariaLabel,
  options,
  selected,
  onChange,
  allLabel = 'All',
  allShortcutLabel,
}: {
  label?: string;
  ariaLabel?: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Concise label shown in the chip when every option is selected. Default "All". */
  allLabel?: string;
  /** Descriptive label for the "All …" shortcut row at the bottom of the popover. Defaults to `allLabel`. */
  allShortcutLabel?: string;
}) {
  const allRowLabel = allShortcutLabel ?? allLabel;
  const allSelected = selected.length === options.length;
  const ordered = options.filter((o) => selected.includes(o.id));
  // Chip readout. The +N fallback only fires if somebody hand-edits the URL
  // to a partial-multi state — the picker UI itself can't reach it anymore.
  const display = allSelected
    ? allLabel
    : ordered.length === 1
      ? ordered[0].label
      : ordered.length > 1
        ? `${ordered[0].label} +${ordered.length - 1}`
        : allLabel;

  // Headless.Listbox in single-select mode wants a single value. Map "all"
  // → sentinel; otherwise the first ordered id (with a defensive fallback).
  const listboxValue: string = allSelected
    ? ALL_SENTINEL
    : ordered[0]?.id ?? ALL_SENTINEL;

  return (
    <Headless.Listbox
      value={listboxValue}
      onChange={(next: string) => {
        if (next === ALL_SENTINEL) {
          onChange(options.map((o) => o.id));
        } else {
          onChange([next]);
        }
      }}
    >
      <span
        className={clsx(
          'inline-flex h-8 items-center overflow-hidden rounded-md border bg-bg-elev text-[12px] transition-colors',
          'border-accent-500/35 bg-accent-500/5 hover:bg-[color-mix(in_oklch,var(--accent-500)_12%,var(--bg-elev))]'
        )}
      >
        <Headless.ListboxButton
          aria-label={ariaLabel ?? label}
          className="flex h-full items-center gap-1.5 px-2.5 font-medium text-fg outline-none focus:outline-none"
        >
          <span className="text-fg-muted">{label}</span>
          <span className="font-semibold text-fg-strong">{display}</span>
          <ChevronDownIcon className="size-3 text-fg-muted" aria-hidden="true" />
        </Headless.ListboxButton>
      </span>
      <Headless.ListboxOptions
        transition
        anchor="bottom start"
        className={clsx(
          '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] [--anchor-offset:-6px]',
          'isolate w-max min-w-[var(--button-width)] rounded-lg p-1',
          'outline outline-transparent focus:outline-hidden',
          'overflow-y-auto',
          'bg-bg-elev/95 backdrop-blur-xl',
          'shadow-lg ring-1 ring-border',
          'transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0'
        )}
      >
        {options.map((option) => (
          <Headless.ListboxOption
            key={option.id}
            value={option.id}
            className={clsx(
              'group/option grid w-full cursor-default grid-cols-[16px_1fr_auto] items-center gap-2 rounded-md px-3 py-2',
              'text-[13px] text-fg-strong outline-none',
              'data-focus:bg-bg-hover',
              'data-selected:bg-bg-active'
            )}
          >
            {/* Single-select ✓ — appears on the currently scoped row. Same
                visual as FilterChipListbox so the two pickers read as one
                family; the difference is behavioral (closes on pick). */}
            <svg
              className="size-4 stroke-current text-accent-600 opacity-0 group-data-selected/option:opacity-100"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 8.5l3 3L12 4"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="min-w-0 truncate">{option.label}</span>
            {typeof option.count === 'number' && (
              <span className="font-mono text-[11px] tabular-nums text-fg-dim">
                {option.count.toLocaleString()}
              </span>
            )}
          </Headless.ListboxOption>
        ))}
        {/* "All …" shortcut row — separated by a soft divider so the user
            reads it as a meta-action rather than a sibling of the real
            statuses. Same data-selected styling so the ✓ marks it when
            every row is in scope. */}
        <Headless.ListboxOption
          value={ALL_SENTINEL}
          className={clsx(
            'group/option mt-1 grid w-full cursor-default grid-cols-[16px_1fr] items-center gap-2 rounded-md px-3 py-2',
            'border-t border-border-soft pt-2',
            'text-[13px] text-fg-muted outline-none',
            'data-focus:bg-bg-hover',
            'data-selected:bg-bg-active'
          )}
        >
          <svg
            className="size-4 stroke-current text-accent-600 opacity-0 group-data-selected/option:opacity-100"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 8.5l3 3L12 4"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0 truncate">{allRowLabel}</span>
        </Headless.ListboxOption>
      </Headless.ListboxOptions>
    </Headless.Listbox>
  );
}
