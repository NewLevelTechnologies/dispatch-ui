import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  equipmentApi,
  EquipmentStatus,
  type EquipmentSummary,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface EquipmentPickerProps {
  /** The selected equipment, or null when no equipment is linked. */
  value: EquipmentSummary | null;
  onChange: (next: EquipmentSummary | null) => void;
  /** Service location to scope search results / quick-create to. */
  serviceLocationId: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Typeahead picker for selecting equipment scoped to a service location, with
 * an inline "Create new equipment" footer that opens a stacked quick-create
 * dialog. Matches the UX described in EQUIPMENT_FRONTEND_HANDOFF.md §5.
 */
export default function EquipmentPicker({
  value,
  onChange,
  serviceLocationId,
  label,
  disabled = false,
}: EquipmentPickerProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  // Anchor the dropdown above the input when there isn't enough room below —
  // inside dialogs the body clips an "absolute mt-1" panel onto the action row.
  const [anchorUp, setAnchorUp] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateInitialName, setQuickCreateInitialName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    const input = containerRef.current?.querySelector('input');
    if (input) {
      const rect = input.getBoundingClientRect();
      setAnchorUp(window.innerHeight - rect.bottom < 280);
    }
    setIsOpen(true);
  };

  // Debounce query → backend search.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close the dropdown when focus moves outside the picker.
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ['equipment-picker', serviceLocationId, debouncedQuery],
    queryFn: () =>
      equipmentApi.list({
        serviceLocationId,
        search: debouncedQuery || undefined,
        status: EquipmentStatus.ACTIVE,
        size: 20,
      }),
    enabled: isOpen && Boolean(serviceLocationId),
    staleTime: 30000,
  });

  const results = useMemo(() => data?.content ?? [], [data]);
  const trimmedQuery = query.trim();

  const handleSelect = (item: EquipmentSummary) => {
    onChange(item);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
  };

  const handleOpenQuickCreate = () => {
    setQuickCreateInitialName(trimmedQuery);
    setQuickCreateOpen(true);
    setIsOpen(false);
  };

  const handleQuickCreated = (created: EquipmentSummary) => {
    onChange(created);
    setQuickCreateOpen(false);
    setQuery('');
  };

  // The visible input value: free-text query when the user is typing, otherwise
  // the selected equipment's display name. Empty when nothing is selected.
  const inputValue = isOpen
    ? query
    : value
      ? formatDisplay(value)
      : query;

  return (
    <Field>
      {label && <Label>{label}</Label>}
      <div ref={containerRef} className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setQuery(e.target.value);
            openDropdown();
          }}
          onFocus={() => {
            // Clear the displayed selection so the user can search; selection
            // is preserved unless they pick something else.
            if (value) setQuery('');
            openDropdown();
          }}
          placeholder={t('equipment.picker.placeholder')}
          disabled={disabled || !serviceLocationId}
        />
        {value && !isOpen && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="absolute inset-y-0 right-2 my-auto h-fit text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            aria-label={t('equipment.picker.clear')}
          >
            ×
          </button>
        )}

        {isOpen && (
          <div
            className={`absolute z-10 w-full rounded-lg bg-white shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10 ${
              anchorUp ? 'bottom-full mb-1' : 'mt-1'
            }`}
          >
            {isFetching && (
              <div className="p-3 text-sm text-zinc-600 dark:text-zinc-400">
                {t('common.actions.loading', { entities: getName('equipment', true) })}
              </div>
            )}

            {!isFetching && results.length > 0 && (
              <div className="max-h-60 overflow-y-auto p-1">
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-500 hover:text-white dark:text-white"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 group-hover:text-white">
                      {formatSecondaryLine(item) || ' '}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!isFetching && results.length === 0 && (
              <div className="p-3 text-sm text-zinc-600 dark:text-zinc-400">
                {t('equipment.picker.noResults')}
              </div>
            )}

            {/* Always-visible quick-create footer when the user has typed something. */}
            {trimmedQuery.length > 0 && (
              <button
                type="button"
                onClick={handleOpenQuickCreate}
                className="block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 dark:border-zinc-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
              >
                {t('equipment.picker.createNew', { name: trimmedQuery })}
              </button>
            )}
          </div>
        )}
      </div>

      <EquipmentQuickCreateDialog
        isOpen={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        initialName={quickCreateInitialName}
        serviceLocationId={serviceLocationId}
        onCreated={handleQuickCreated}
      />
    </Field>
  );
}

function formatDisplay(item: EquipmentSummary): string {
  const tail = formatSecondaryLine(item);
  return tail ? `${item.name} — ${tail}` : item.name;
}

function formatSecondaryLine(item: EquipmentSummary): string {
  const parts: string[] = [];
  if (item.make || item.model) {
    parts.push([item.make, item.model].filter(Boolean).join(' '));
  }
  if (item.serialNumber) parts.push(`SN ${item.serialNumber}`);
  if (item.locationOnSite) parts.push(item.locationOnSite);
  return parts.join(' · ');
}

interface QuickCreateProps {
  isOpen: boolean;
  onClose: () => void;
  initialName: string;
  serviceLocationId: string;
  onCreated: (eq: EquipmentSummary) => void;
}

function EquipmentQuickCreateDialog({
  isOpen,
  onClose,
  initialName,
  serviceLocationId,
  onCreated,
}: QuickCreateProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- standard form-init pattern */
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setErrorMessage(null);
    }
  }, [isOpen, initialName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = useMutation({
    mutationFn: () =>
      equipmentApi.create({
        name: name.trim(),
        serviceLocationId,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-picker'] });
      // The list endpoint returns Equipment (full record); project to EquipmentSummary.
      onCreated({
        id: created.id,
        name: created.name,
        equipmentTypeName: created.equipmentTypeName ?? null,
        equipmentCategoryName: created.equipmentCategoryName ?? null,
        make: created.make ?? null,
        model: created.model ?? null,
        serialNumber: created.serialNumber ?? null,
        locationOnSite: created.locationOnSite ?? null,
      });
    },
    onError: (error: unknown) => {
      const data =
        error instanceof Error && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data
          : undefined;
      setErrorMessage(data?.message || t('common.form.errorCreate', { entity: getName('equipment') }));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>
        {t('common.actions.add', { entity: getName('equipment') })}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
            </div>
          )}
          <Field>
            <Label>{t('common.form.name')} *</Label>
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {t('equipment.picker.quickCreateHint')}
          </p>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={createMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
            {createMutation.isPending ? t('common.saving') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
