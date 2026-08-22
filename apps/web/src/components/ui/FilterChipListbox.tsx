// ─────────────────────────────────────────────────────────────────────────────
// FilterChipListbox — single- or multi-select filter chip used above list tables.
//
// Empty state shows "Label ▾" with a neutral border + muted chevron.
// Set state shows "Label: Value ×" with an accent-tinted background.
// Clicking the body opens a Listbox popover; × is a sibling button that clears.
//
// The chevron is the picker affordance — universal "opens a menu" cue from
// native <select>. The label stays at full text weight so the empty chip
// doesn't read as disabled. `+` was intentionally swapped out because
// (a) `text-fg-dim + label` looked disabled, and (b) `+` is creation language
// that confuses filter intent.
//
// Listbox (not Menu) is the correct primitive: screen readers announce
// "<option>, selected" for the currently-applied filter via aria-selected,
// which a menu can't communicate. Keyboard nav, type-ahead, Esc-to-close,
// click-outside, and floating positioning, and (in multi mode) Space-to-toggle
// without closing all come from Headless UI — don't hand-roll any of it.
//
// POPOVER STYLING: popover body is hue-agnostic — bg/hover/selected fills are
// neutral tokens (bg-bg-active / bg-bg-hover) so toggling warm↔cool accent
// doesn't shift the popover. The ✓ checkmark is the only colored signal.
//
// SINGLE-SELECT (default):
//   value: string | null. Hosts pass `value={x || null}` so empty-string URL
//   params map cleanly. Pass `resetLabel` to get a built-in reset row at the
//   top — it picks up the special "reset" treatment (muted label, bottom
//   border-soft separator) and gets the selected fill + ✓ when value is null.
//
//   <FilterChipListbox
//     label="Type"
//     ariaLabel="Type"
//     value={typeId || null}
//     displayValue={typeId ? lookupName(typeId, types) : null}
//     resetLabel="Any type"
//     onChange={(id) => updateParams({ type: id, page: null })}
//     onClear={() => updateParams({ type: null, page: null })}
//   >
//     {types.map((t) => <ChipListboxOption key={t.id} value={t.id}>{t.name}</ChipListboxOption>)}
//   </FilterChipListbox>
//
// MULTI-SELECT:
//   value: string[]. No reset row supported here — clearing happens via the
//   × button (or by deselecting every option). Caller formats displayValue
//   per their rules (e.g. "Installation, Service" for 2; "3 selected" for 3+).
//
//   <FilterChipListbox
//     multiple
//     label="Type"
//     ariaLabel="Type"
//     value={typeIds}
//     displayValue={formatMulti(typeIds, lookup)}
//     onChange={(ids) => updateParams({ type: ids, page: null })}
//     onClear={() => updateParams({ type: [], page: null })}
//   >
//     {types.map((t) => <ChipListboxOption key={t.id} value={t.id}>{t.name}</ChipListboxOption>)}
//   </FilterChipListbox>
//
// Use ChipListboxOption (exported below) — NOT Catalyst's ListboxOption.
// Catalyst's option hardcodes a saturated blue focus pill that fights the
// restrained chip aesthetic.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import * as Headless from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';

type BaseProps = {
  label: string;
  ariaLabel: string;
  displayValue?: string | null;
  onClear?: () => void;
  /** Optional disambiguating subtitle shown as a header row in the popover
   *  (e.g. Item status · "contains an item"). */
  hint?: string;
  children: ReactNode;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  resetLabel?: string;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type Props = SingleProps | MultiProps;

export function FilterChipListbox(props: Props) {
  const { label, ariaLabel, displayValue, onClear, hint, children } = props;
  const resetLabel = props.multiple === true ? undefined : props.resetLabel;

  // isSet drives the accent tint + × button visibility. In single mode it's
  // "value != null and we have a label to show"; in multi mode it's "at least
  // one id picked". Caller controls displayValue formatting in both modes.
  const isSet =
    props.multiple === true
      ? props.value.length > 0
      : props.value != null && displayValue != null && displayValue !== '';

  const shell = (
    <>
      <span
        className={clsx(
          'inline-flex h-8 items-center overflow-hidden rounded-md border bg-bg-elev text-[12px] transition-colors',
          isSet
            ? 'border-accent-500/35 bg-accent-500/5 hover:bg-[color-mix(in_oklch,var(--accent-500)_12%,var(--bg-elev))]'
            : 'border-border hover:bg-bg-hover'
        )}
      >
        <Headless.ListboxButton
          aria-label={ariaLabel}
          className="flex h-full items-center gap-1.5 px-2.5 font-medium text-fg outline-none focus:outline-none"
        >
          <span className="text-fg-muted">{label}</span>
          {isSet ? (
            <span className="font-semibold text-fg-strong">{displayValue}</span>
          ) : (
            <ChevronDownIcon className="size-3 text-fg-muted" aria-hidden="true" />
          )}
        </Headless.ListboxButton>
        {isSet && onClear && (
          <button
            type="button"
            aria-label={`${ariaLabel} — clear`}
            onClick={onClear}
            className="flex h-full items-center border-l border-accent-500/20 px-1.5 text-fg-dim hover:bg-bg-hover hover:text-fg-strong"
          >
            ×
          </button>
        )}
      </span>
      <Headless.ListboxOptions
        transition
        anchor="bottom start"
        className={clsx(
          '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] [--anchor-offset:-6px]',
          // Width hugs content but is never narrower than the trigger chip.
          // Rows inside set their own padding (px-3) so they're content + 24px.
          'isolate w-max min-w-[var(--button-width)] rounded-lg p-1',
          'outline outline-transparent focus:outline-hidden',
          'overflow-y-auto',
          'bg-bg-elev/95 backdrop-blur-xl',
          'shadow-lg ring-1 ring-border',
          'transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0'
        )}
      >
        {hint && (
          <div className="border-b border-border-soft px-3 py-1.5 text-[11px] text-fg-dim">
            {label} · {hint}
          </div>
        )}
        {resetLabel && <ChipResetRow>{resetLabel}</ChipResetRow>}
        {children}
      </Headless.ListboxOptions>
    </>
  );

  // Conditional render — Headless.Listbox's value/onChange types depend on
  // `multiple`, so we can't conditionally spread without fighting TS. Two
  // small JSX blocks is cleaner than the cast gymnastics.
  if (props.multiple === true) {
    return (
      <Headless.Listbox multiple value={props.value} onChange={props.onChange}>
        {shell}
      </Headless.Listbox>
    );
  }
  return (
    <Headless.Listbox value={props.value} onChange={props.onChange}>
      {shell}
    </Headless.Listbox>
  );
}

// Drop-in replacement for Catalyst's ListboxOption inside chip popovers.
// Selected fill is neutral (bg-bg-active) so the popover doesn't shift hue
// when the accent toggle is flipped. The ✓ is accent-colored — a small
// signal that ties selection to the brand without flooding the row.
type ChipOptionProps<T> = {
  value: T;
  disabled?: boolean;
  children: ReactNode;
};

export function ChipListboxOption<T>({ value, disabled, children }: ChipOptionProps<T>) {
  return (
    <Headless.ListboxOption
      value={value}
      disabled={disabled}
      className={clsx(
        'group/option grid w-full cursor-default grid-cols-[16px_1fr] items-center gap-2 rounded-md px-3 py-2',
        'text-[13px] text-fg-strong outline-none',
        'data-focus:bg-bg-hover',
        'data-selected:bg-bg-active',
        'data-disabled:opacity-50'
      )}
    >
      <CheckMark />
      <span className="min-w-0 truncate">{children}</span>
    </Headless.ListboxOption>
  );
}

// Reset row — the "Any" / "All" row at the top of single-select popovers.
// Functionally a ListboxOption with value=null, but visually muted and
// separated by a soft border so users read it as "clear the filter" rather
// than as a sibling of the real choices below.
function ChipResetRow({ children }: { children: ReactNode }) {
  return (
    <Headless.ListboxOption
      value={null}
      className={clsx(
        'group/option grid w-full cursor-default grid-cols-[16px_1fr] items-center gap-2 px-3 py-2',
        'mb-1 border-b border-border-soft',
        'text-[13px] text-fg-muted outline-none',
        'data-focus:bg-bg-hover',
        'data-selected:bg-bg-active'
      )}
    >
      <CheckMark />
      <span className="min-w-0 truncate">{children}</span>
    </Headless.ListboxOption>
  );
}

function CheckMark() {
  return (
    <svg
      className="size-4 stroke-current text-accent-600 opacity-0 group-data-selected/option:opacity-100"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 8.5l3 3L12 4" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
