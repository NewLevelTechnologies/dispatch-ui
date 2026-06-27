import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { userApi, type AssignableUser } from '../api';
import { Input } from './catalyst/input';

export interface AccountManagerValue {
  id: string;
  name: string;
}

interface Props {
  /** Currently selected user (id + name). null = Unassigned. */
  value: AccountManagerValue | null;
  onChange: (user: AccountManagerValue | null) => void;
  placeholder?: string;
  /** Accessible label, falls back to placeholder. */
  ariaLabel?: string;
  disabled?: boolean;
}

// Display name = firstName + lastName (the assignable response carries no
// combined `name` field; both name parts are required on a user).
const fullName = (u: AssignableUser) => `${u.firstName} ${u.lastName}`.trim();

/**
 * Typeahead account-manager picker backed by `userApi.getAssignable` (server-side
 * name/email search via GET /users/assignable). Mirrors CustomerPicker (manual
 * Input + dropdown, not Catalyst Combobox) so server typeahead + debounce work
 * without fighting Combobox's client-side filtering.
 *
 * Why not `userApi.getAll()`: it caps at the first 100 users, so a client-side
 * picker over it silently hides everyone past #100. This endpoint searches the
 * full set server-side and is VIEW_CUSTOMERS-gated (customer editors can assign).
 */
export default function AccountManagerPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('common.accountManagerPicker.placeholder');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce query (300ms) — same cadence as CustomerPicker.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch whenever open — empty query returns the first page of assignable
  // users so the dropdown is browsable on focus; typing narrows it server-side.
  const { data, isLoading } = useQuery({
    queryKey: ['assignable-users', debounced],
    queryFn: () => userApi.getAssignable(debounced),
    enabled: open,
    staleTime: 30_000,
  });

  // Close on outside click.
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

  const handleSelect = (user: AssignableUser) => {
    onChange({ id: user.id, name: fullName(user) });
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const results = data?.content ?? [];
  // Selected name is the resting display; typing replaces it (typeahead).
  const inputValue = query !== '' ? query : value?.name ?? '';

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
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={t('common.clear')}
          className="absolute inset-y-0 right-2 my-auto flex size-5 items-center justify-center rounded text-fg-dim hover:text-fg-strong"
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900"
          style={{ maxHeight: 280 }}
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {t('common.accountManagerPicker.searching')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {debounced
                ? t('common.accountManagerPicker.noResults', { query: debounced })
                : t('common.accountManagerPicker.noUsers')}
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {results.map((u) => {
                const isSelected = u.id === value?.id;
                const display = fullName(u);
                return (
                  <li
                    key={u.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(u)}
                    className={`flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-white/5 ${
                      isSelected ? 'bg-zinc-50 dark:bg-white/5' : ''
                    }`}
                  >
                    <span className="truncate text-fg-strong">{display || u.email}</span>
                    {display && u.email && <span className="truncate text-xs text-fg-muted">{u.email}</span>}
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
