import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { tagApi, type Tag, type TagScope } from '../api/setup';
import { TagPill } from './ui/TagPill';
import { Input } from './catalyst/input';

interface Props {
  /**
   * Vocabulary this picker draws from / creates into — GENERAL for customers +
   * service locations, PAYER for billing-only payers. Keeps the lists tight and
   * matches the server-side assignment scope (wrong scope → 400).
   */
  scope: TagScope;
  /** Tag ids already applied to the record. */
  appliedTagIds: string[];
  /** An existing tag was chosen from the list. */
  onApply: (tag: Tag) => void;
  /** The "Create '{query}'" row was chosen. Parent creates + applies. */
  onCreate: (name: string) => void;
  /**
   * Uncheck an applied tag → remove the assignment. When provided, the
   * applied tags render at the top of the list with checkmarks; when
   * absent, applied tags are simply excluded from the options (read-only
   * apply-only contexts).
   */
  onRemove?: (tag: Tag) => void;
  /** Dismiss the picker (outside click / Escape / blur). */
  onClose: () => void;
  /**
   * Whether the user may create new tags inline. When false the create-row is
   * hidden and they can only pick from the existing library. (Tag creation is
   * gated by the same edit capability today; a dedicated MANAGE_TAGS gate can
   * be layered here if the backend adds one.)
   */
  canCreate: boolean;
  /** A mutation (apply/create/remove) is in flight — disables commits. */
  busy?: boolean;
}

// One keyboard-navigable list spanning the applied section, the unapplied
// matches, and the create affordance.
type Option = { kind: 'applied'; tag: Tag } | { kind: 'apply'; tag: Tag } | { kind: 'create' };

/**
 * Inline tag picker — manual Input + custom listbox, mirroring CustomerPicker
 * (Catalyst Combobox's internal query state can't surface a live "Create
 * '{text}'" row). The tenant tag library is small (<50, hard cap 200) so it's
 * loaded once and filtered client-side.
 */
export default function TagPicker({ scope, appliedTagIds, onApply, onCreate, onRemove, onClose, canCreate, busy }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // -1 = "no explicit choice yet" — resolved to the default index below.
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tags } = useQuery({
    // Scope in the key so the GENERAL and PAYER pick-lists cache separately.
    queryKey: ['tags', scope],
    queryFn: () => tagApi.getAll({ scope }),
    staleTime: 60_000,
  });

  const applied = useMemo(() => new Set(appliedTagIds), [appliedTagIds]);
  const trimmed = query.trim();

  // Offer create only when there's a query with no exact (ci) name collision —
  // typing "vip" when "VIP" exists should match the existing tag, not create a
  // duplicate (the backend enforces case-insensitive uniqueness too).
  const exactExists = useMemo(
    () => (tags ?? []).some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase()),
    [tags, trimmed]
  );
  const showCreate = canCreate && trimmed !== '' && !exactExists;

  const options = useMemo<Option[]>(() => {
    const q = trimmed.toLowerCase();
    const matchesQuery = (tag: Tag) => q === '' || tag.name.toLowerCase().includes(q);
    const list: Option[] = [];
    if (onRemove) {
      for (const tag of tags ?? []) {
        if (applied.has(tag.id) && matchesQuery(tag)) list.push({ kind: 'applied', tag });
      }
    }
    for (const tag of tags ?? []) {
      if (!applied.has(tag.id) && matchesQuery(tag)) list.push({ kind: 'apply', tag });
    }
    if (showCreate) list.push({ kind: 'create' });
    return list;
  }, [tags, applied, trimmed, onRemove, showCreate]);

  // Default highlight lands on the first non-applied option so a bare Enter
  // applies (or creates) — never silently removes. Arrow keys can still walk
  // up into the applied section to uncheck.
  const defaultIndex = Math.max(
    0,
    options.findIndex((o) => o.kind !== 'applied')
  );
  const active = highlight >= 0 && highlight < options.length ? highlight : defaultIndex;

  // Autofocus on mount so "+ Add" lands the cursor straight in the field.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const commit = (index: number) => {
    if (busy) return;
    const option = options[index];
    if (!option) return;
    if (option.kind === 'create') onCreate(trimmed);
    else if (option.kind === 'applied') onRemove?.(option.tag);
    else onApply(option.tag);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    // Comma commits the highlighted option (don't let it type into the field).
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      // A bare Enter (no explicit arrow/mouse selection) never removes — when
      // the resolved default is an applied row it means there was nothing to
      // apply, so do nothing rather than uncheck by accident.
      if (highlight < 0 && options[active]?.kind === 'applied') return;
      commit(active);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(Math.min(options.length - 1, active + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(Math.max(0, active - 1));
    }
  };

  // Section break before the first row whose kind differs from the previous —
  // separates applied / apply / create visually without extra wrappers.
  const sectionBreak = (i: number) => i > 0 && options[i - 1].kind !== options[i].kind;

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={t('tags.searchPlaceholder')}
        aria-label={t('tags.searchPlaceholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      <div
        className="absolute top-full left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-border bg-bg-elev shadow-lg"
        style={{ maxHeight: 240 }}
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-fg-muted">
            {trimmed === '' ? t('tags.allApplied') : t('tags.noMatches')}
          </div>
        ) : (
          <ul role="listbox" className="py-1">
            {options.map((option, i) => (
              <li
                key={option.kind === 'create' ? '__create' : option.tag.id}
                role="option"
                aria-selected={active === i}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] ${
                  sectionBreak(i) ? 'border-t border-border-soft' : ''
                } ${active === i ? 'bg-bg-hover' : ''}`}
              >
                {option.kind === 'create' ? (
                  <>
                    <span className="text-fg-muted">+</span>
                    <span className="text-fg">{t('tags.createOption', { name: trimmed })}</span>
                  </>
                ) : (
                  <>
                    {onRemove && (
                      <span aria-hidden className="w-3 text-center text-fg-muted">
                        {option.kind === 'applied' ? '✓' : ''}
                      </span>
                    )}
                    <TagPill color={option.tag.color} name={option.tag.name} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
