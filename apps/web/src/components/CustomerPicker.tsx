import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { customerApi, type CustomerSearchResult } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Input } from './catalyst/input';

interface Props {
  /** Currently selected customer (id + name). null when nothing is chosen. */
  value: CustomerSearchResult | null;
  onChange: (customer: CustomerSearchResult | null) => void;
  /**
   * Optional placeholder override. Defaults to a glossary-aware
   * "Search {{customers}}…" string.
   */
  placeholder?: string;
  /** Accessible label, falls back to placeholder. */
  ariaLabel?: string;
  /** When true the input is disabled. */
  disabled?: boolean;
}

/**
 * Typeahead customer picker backed by `customerApi.search`. Mirrors the
 * `ServiceLocationPicker` pattern (manual Input + dropdown, not Catalyst
 * Combobox) so server-side typeahead and debounce behave correctly without
 * fighting Combobox's client-side filtering assumptions.
 *
 * The picker is type-agnostic — it surfaces every Customer in the tenant,
 * which (post backend's `CustomerType` addition) includes BILLING_ONLY
 * customers like warranty / insurance companies that have no service
 * locations. Type-aware filtering / grouping can be layered on later if
 * volume justifies it.
 */
export default function CustomerPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const customersLabel = getName('customer', true);
  const resolvedPlaceholder =
    placeholder ??
    t('common.customerPicker.placeholder', { entities: customersLabel });
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce query (300ms) — same cadence as ServiceLocationPicker.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchData, isLoading } = useQuery({
    queryKey: ['customer-search', debounced],
    queryFn: () => customerApi.search({ q: debounced, page: 0, size: 25 }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  // Close the dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (customer: CustomerSearchResult) => {
    onChange(customer);
    setQuery('');
    setOpen(false);
  };

  const results = searchData?.content ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  // Show the selected customer name as the input's resting display
  // (both closed AND when the picker is open without an active query).
  // Standard typeahead pattern — focus doesn't blank the selection, it
  // just opens the dropdown; typing replaces. Backspacing back to empty
  // snaps the display to value.name again rather than leaving it blank.
  const inputValue = query !== '' ? query : (value?.name ?? '');

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        placeholder={resolvedPlaceholder}
        aria-label={ariaLabel ?? resolvedPlaceholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          // Select existing text so typing replaces in one keystroke
          // instead of appending to the customer name.
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
      />
      {open && (
        // top-full anchors to the bottom edge of the relative parent;
        // `mt-1` alone wasn't reliably positioning below the Input
        // (absolute-without-top defaults to the static position which
        // can collapse into the Input's box). z-50 keeps the panel above
        // sibling form rows when the picker lives inside a Catalyst
        // Dialog with its own stacking context.
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900"
          style={{ maxHeight: 280 }}
        >
          {debounced.length < 2 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {t('common.customerPicker.typeToSearch')}
            </div>
          ) : isLoading ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {t('common.customerPicker.searching')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {t('common.customerPicker.noResults', {
                entities: customersLabel,
                query: debounced,
              })}
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {results.map((c) => {
                const isSelected = c.id === value?.id;
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c)}
                    className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-white/5 ${
                      isSelected
                        ? 'bg-zinc-50 dark:bg-white/5'
                        : ''
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.type === 'BILLING_ONLY' && (
                      <span className="flex-shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {t('customers.detail.billingOnlyBadge')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
