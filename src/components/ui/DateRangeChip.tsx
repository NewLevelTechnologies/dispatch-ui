// ─────────────────────────────────────────────────────────────────────────────
// DateRangeChip — the date filter for list toolbars, as a single popover chip.
//
// Closed: one chip, identical height/treatment to FilterChipListbox, reading
// `Label: Any ▾` when unset and `Label: May 1 – May 31 ▾` when set (year only
// when it isn't the current one; open-ended ranges read "After May 1" /
// "Before May 31"). An × clears a set range. Nothing renders in the page flow.
//
// Open: a popover anchored under the chip (same shell as the chip listbox).
// Presets lead — they're what people actually click — with the manual From/To
// day fields below as the fallback. Presets apply immediately and close;
// manual fields apply on change and keep the popover open so the second
// boundary can be set. Native date inputs get our field chrome + a
// color-scheme that follows .theme-dark so the picker glyph stays visible.
//
// Value contract: inclusive yyyy-mm-dd day strings, either side '' for
// open-ended. Presets RESOLVE to concrete dates at click time (the filter IS
// a date range, not a live "last 30 days" rule). Hosts convert to their wire
// format — day-string endpoints pass through, timestamp endpoints go through
// instantRangeForDays.
// ─────────────────────────────────────────────────────────────────────────────
import * as Headless from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_DATE_RANGE,
  formatDateRange,
  rangeForPreset,
  type DatePreset,
  type DateRange,
} from '../../lib/dateRangePresets';

// Ordered by how often they're reached for; "All time" (= clear) closes the set.
const PRESETS: { id: Exclude<DatePreset, '' | 'custom'>; labelKey: string }[] = [
  { id: 'last7', labelKey: 'workOrders.dates.last7' },
  { id: 'last30', labelKey: 'workOrders.dates.last30' },
  { id: 'thisMonth', labelKey: 'workOrders.dates.thisMonth' },
  { id: 'lastMonth', labelKey: 'workOrders.dates.lastMonth' },
  { id: 'thisYear', labelKey: 'workOrders.dates.thisYear' },
];

const INPUT_CLASS =
  'h-8 w-full rounded-md border border-border bg-bg-elev px-2 text-[12px] text-fg outline-none ' +
  'hover:border-border-strong focus:border-accent-500/60 ' +
  '[color-scheme:light] [.theme-dark_&]:[color-scheme:dark]';

export function DateRangeChip({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  const isSet = Boolean(value.from || value.to);

  return (
    <Headless.Popover>
      <span
        className={clsx(
          'inline-flex h-8 items-center overflow-hidden rounded-md border bg-bg-elev text-[12px] transition-colors',
          isSet
            ? 'border-accent-500/35 bg-accent-500/5 hover:bg-[color-mix(in_oklch,var(--accent-500)_12%,var(--bg-elev))]'
            : 'border-border hover:bg-bg-hover'
        )}
      >
        <Headless.PopoverButton
          aria-label={ariaLabel}
          className="flex h-full items-center gap-1.5 px-2.5 font-medium text-fg outline-none focus:outline-none"
        >
          <span className="text-fg-muted">{label}</span>
          {isSet ? (
            <span className="font-semibold text-fg-strong">{formatDateRange(value)}</span>
          ) : (
            <span className="text-fg-muted">{t('workOrders.dates.anyRange')}</span>
          )}
          <ChevronDownIcon className="size-3 text-fg-muted" aria-hidden="true" />
        </Headless.PopoverButton>
        {isSet && (
          <button
            type="button"
            aria-label={`${ariaLabel} — clear`}
            onClick={() => onChange(EMPTY_DATE_RANGE)}
            className="flex h-full items-center border-l border-accent-500/20 px-1.5 text-fg-dim hover:bg-bg-hover hover:text-fg-strong"
          >
            ×
          </button>
        )}
      </span>

      <Headless.PopoverPanel
        transition
        anchor="bottom start"
        className={clsx(
          '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] [--anchor-offset:-6px]',
          'isolate w-[300px] max-w-[calc(100vw-1rem)] rounded-lg p-3',
          'bg-bg-elev/95 backdrop-blur-xl',
          'shadow-lg ring-1 ring-border',
          'transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0'
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-3">
            {/* Presets — the primary affordance; apply immediately. */}
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(rangeForPreset(p.id));
                    close();
                  }}
                  className="h-7 rounded-md border border-border bg-bg-elev px-2 text-[11.5px] font-medium text-fg hover:bg-bg-hover"
                >
                  {t(p.labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onChange(EMPTY_DATE_RANGE);
                  close();
                }}
                className="h-7 rounded-md border border-border bg-bg-elev px-2 text-[11.5px] font-medium text-fg hover:bg-bg-hover"
              >
                {t('workOrders.dates.allTime')}
              </button>
            </div>

            {/* Manual range — the fallback. Applies on change, stays open. */}
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  {t('workOrders.dates.from')}
                </span>
                <input
                  type="date"
                  value={value.from}
                  max={value.to || undefined}
                  onChange={(e) => onChange({ ...value, from: e.target.value })}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  {t('workOrders.dates.to')}
                </span>
                <input
                  type="date"
                  value={value.to}
                  min={value.from || undefined}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            {/* aria-label disambiguates from a host toolbar's own "Clear". */}
            <button
              type="button"
              aria-label={`${ariaLabel} — clear range`}
              onClick={() => {
                onChange(EMPTY_DATE_RANGE);
                close();
              }}
              className="self-start text-[11.5px] font-medium text-fg-muted underline-offset-2 hover:text-fg-strong hover:underline"
            >
              {t('common.clear')}
            </button>
          </div>
        )}
      </Headless.PopoverPanel>
    </Headless.Popover>
  );
}
