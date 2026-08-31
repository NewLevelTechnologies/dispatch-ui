import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EllipsisVerticalIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  tenantFilterSizesApi,
  type TenantFilterSize,
} from '../../../api/setup';
import { Button } from '../../../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '../../../components/catalyst/dialog';
import {
  Field,
  FieldGroup,
  Fieldset,
  Label,
} from '../../../components/catalyst/fieldset';
import { Input } from '../../../components/catalyst/input';
import ConfirmDialog from '../../../components/ConfirmDialog';
import IconButton from '../../../components/IconButton';
import { DragHandle } from '../../../components/settings/DragHandle';
import { Card, CardBody } from '../../../components/ui/Card';
import {
  DenseTable,
  DenseTHead,
  DenseRow,
} from '../../../components/ui/DenseTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import {
  ListSearch,
  ListToolbar,
} from '../../../components/ui/ListToolbar';
import { ListFooter } from '../../../components/ui/ListFooter';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHead } from '../../../components/ui/PageHead';
import { extractApiError, showError, showSuccess } from '../../../lib/toast';
import { formatFilterSize } from '@dispatch/utils';

const QUERY_KEY = ['tenant-filter-sizes'] as const;

export default function FilterSizesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  // null = closed; { item: null } = dialog open in create mode; { item: x } = edit.
  // Create mode is only used from the empty state — once the table has rows
  // the InlineAddRow handles new entries.
  const [formState, setFormState] = useState<{ item: TenantFilterSize | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TenantFilterSize | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const {
    data: items,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => tenantFilterSizesApi.getAll(),
  });

  const active = useMemo(
    () => (items ?? []).filter((s) => !s.archivedAt),
    [items],
  );

  const sorted = useMemo(
    () =>
      [...active].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.lengthIn - b.lengthIn ||
          a.widthIn - b.widthIn ||
          a.thicknessIn - b.thicknessIn,
      ),
    [active],
  );

  const nextSortOrder =
    sorted.length > 0 ? Math.max(...sorted.map((i) => i.sortOrder)) + 1 : 0;

  // Strip separators (×, x, *, whitespace, decimal point) so users can type
  // "1620", "16x20", or "16×20" and match the same record. We keep digits
  // and the literal `.` collapsed-out so `16.5×20×1` is searchable as
  // `16520` or `16.5x20x1` interchangeably.
  const filteredSizes = useMemo(() => {
    const needle = searchQuery
      .toLowerCase()
      .replace(/[×x*\s.]/g, '');
    if (!needle) return sorted;
    return sorted.filter((s) =>
      `${s.lengthIn}${s.widthIn}${s.thicknessIn}`
        .replace(/\./g, '')
        .includes(needle),
    );
  }, [sorted, searchQuery]);

  const hasFilters = searchQuery.trim().length > 0;
  const clearSearch = () => setSearchQuery('');

  // ── Mutations ───────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantFilterSizesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showSuccess(t('settings.filterSizes.toastDeleted'));
    },
    onError: (err) =>
      showError(t('settings.filterSizes.toastDeleteFailed'), extractApiError(err)),
  });

  const seedCommonMutation = useMutation({
    mutationFn: () => tenantFilterSizesApi.seedCommon(),
    onSuccess: ({ added }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (added > 0) {
        showSuccess(
          t('settings.filterSizes.seedSuccess', { count: added }),
        );
      } else {
        showSuccess(t('settings.filterSizes.seedSkipped'));
      }
    },
    onError: (err) =>
      showError(t('settings.filterSizes.toastSeedFailed'), extractApiError(err)),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => tenantFilterSizesApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
    onError: (err) => {
      showError(
        t('settings.filterSizes.toastReorderFailed'),
        extractApiError(err),
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const performReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= sorted.length || to >= sorted.length) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((i) => i.id));
  };

  // ── Subtitle ────────────────────────────────────────────────

  const subtitle = sorted.length > 0
    ? t('settings.filterSizes.subtitle', { count: sorted.length })
    : null;

  return (
    <>
      <PageHead
        title={t('settings.filterSizes.title')}
        sub={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              color="accent"
              size="xs"
              onClick={() => setFormState({ item: null })}
            >
              <PlusIcon className="size-4" />
              {t('settings.filterSizes.add')}
            </Button>
            <Dropdown>
              <DropdownButton
                as={IconButton}
                aria-label={t('common.moreOptions')}
              >
                <EllipsisVerticalIcon className="size-4" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                <DropdownItem onClick={() => setSeedDialogOpen(true)}>
                  <DropdownLabel>
                    {t('settings.filterSizes.seedCommon')}
                  </DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        }
      />

      {sorted.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.filterSizes.searchPlaceholder')}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          }
        />
      )}

      <div className="mt-4 max-w-[680px]">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('settings.filterSizes.loading')} />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', {
                  entities: t('settings.filterSizes.title'),
                })}
                description={
                  extractApiError(error) ?? (error as Error).message
                }
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={<FunnelIcon className="size-10 text-fg-dim" />}
                title={t('settings.filterSizes.emptyTitle')}
                description={t('settings.filterSizes.emptyDescription')}
                action={
                  <div className="flex gap-2">
                    <Button
                      color="accent"
                      onClick={() => setFormState({ item: null })}
                    >
                      {t('settings.filterSizes.add')}
                    </Button>
                    <Button outline onClick={() => setSeedDialogOpen(true)}>
                      {t('settings.filterSizes.seedCommonCta')}
                    </Button>
                  </div>
                }
              />
            ) : hasFilters && filteredSizes.length === 0 ? (
              <EmptyState
                icon={<MagnifyingGlassIcon className="size-10 text-fg-dim" />}
                title={t('settings.filterSizes.noMatchTitle')}
                description={t('settings.filterSizes.noMatchDescription')}
                action={
                  <Button outline onClick={clearSearch}>
                    {t('settings.filterSizes.clearSearch')}
                  </Button>
                }
              />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.filterSizes.size')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {filteredSizes.map((item, index) => {
                      const isDragging = dragIndex === index;
                      const isDragOver =
                        dragOverIndex === index &&
                        dragIndex !== null &&
                        dragIndex !== index;
                      const isFirst = index === 0;
                      const isLast = index === filteredSizes.length - 1;
                      return (
                        <DenseRow
                          key={item.id}
                          draggable
                          onDragStart={(e: React.DragEvent) => {
                            setDragIndex(index);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e: React.DragEvent) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIndex !== index)
                              setDragOverIndex(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverIndex === index)
                              setDragOverIndex(null);
                          }}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault();
                            if (dragIndex !== null)
                              performReorder(dragIndex, index);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={[
                            isDragging && 'opacity-50',
                            isDragOver &&
                              'outline outline-2 outline-accent-500/40 outline-offset-[-2px]',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td className="strong">
                            <span className="flex items-center gap-2">
                              <span className="hidden sm:flex">
                                <DragHandle />
                              </span>
                              {formatFilterSize(item)}
                            </span>
                          </td>
                          <td className="right">
                            <Dropdown>
                              <DropdownButton
                                as={IconButton}
                                aria-label={t('common.moreOptions')}
                              >
                                <EllipsisVerticalIcon className="size-4" />
                              </DropdownButton>
                              <DropdownMenu anchor="bottom end">
                                {/* Mobile-only reorder. Drag handle is sm:hidden
                                    so the kebab is the only reorder affordance
                                    below the sm breakpoint. */}
                                <span className="contents sm:hidden">
                                  <DropdownItem
                                    onClick={() =>
                                      performReorder(index, index - 1)
                                    }
                                    disabled={isFirst}
                                  >
                                    <DropdownLabel>
                                      {t('common.moveUp')}
                                    </DropdownLabel>
                                  </DropdownItem>
                                  <DropdownItem
                                    onClick={() =>
                                      performReorder(index, index + 1)
                                    }
                                    disabled={isLast}
                                  >
                                    <DropdownLabel>
                                      {t('common.moveDown')}
                                    </DropdownLabel>
                                  </DropdownItem>
                                  <DropdownDivider />
                                </span>
                                <DropdownItem
                                  onClick={() => setFormState({ item })}
                                >
                                  <DropdownLabel>
                                    {t('common.edit')}
                                  </DropdownLabel>
                                </DropdownItem>
                                <DropdownItem
                                  onClick={() => setPendingDelete(item)}
                                >
                                  <DropdownLabel>
                                    {t('common.delete')}
                                  </DropdownLabel>
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </td>
                        </DenseRow>
                      );
                    })}
                    {!hasFilters && (
                      <InlineAddRow
                        existing={sorted}
                        nextSortOrder={nextSortOrder}
                      />
                    )}
                  </tbody>
                </DenseTable>
                <ListFooter
                  left={t('settings.showingCount', {
                    count: filteredSizes.length,
                    noun: t('settings.filterSizes.nounPlural'),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <FilterSizeFormDialog
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        item={formState?.item ?? null}
        nextSortOrder={nextSortOrder}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
        }}
        title={t('settings.filterSizes.deleteTitle', {
          name: pendingDelete ? formatFilterSize(pendingDelete) : '',
        })}
        message={t('settings.filterSizes.deleteBody')}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />

      <ConfirmDialog
        isOpen={seedDialogOpen}
        onClose={() => setSeedDialogOpen(false)}
        onConfirm={() => seedCommonMutation.mutate()}
        title={t('settings.filterSizes.seedCommonConfirmTitle')}
        message={t('settings.filterSizes.seedCommonConfirmBody')}
        confirmLabel={t('settings.filterSizes.seedCommon')}
        isPending={seedCommonMutation.isPending}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// InlineAddRow — last row in the table. Tap to expand into three
// numeric fields (L × W × T inches). Tab moves between fields,
// Enter submits, Esc cancels. After a successful save the fields
// clear and focus returns to Length — rapid bulk-entry loop.
//
// Mirrors the FilterSizeFormDialog's validation shape: three positive
// numbers, no free-text strings ever reach the API.
// ─────────────────────────────────────────────────────────────────

interface InlineAddRowProps {
  existing: TenantFilterSize[];
  nextSortOrder: number;
}

type Draft = { length: string; width: string; thickness: string };
const emptyDraft: Draft = { length: '', width: '', thickness: '' };

function InlineAddRow({ existing, nextSortOrder }: InlineAddRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [err, setErr] = useState<string | null>(null);
  const lengthRef = useRef<HTMLInputElement>(null);
  const widthRef = useRef<HTMLInputElement>(null);
  const thicknessRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation({
    mutationFn: (dims: {
      lengthIn: number;
      widthIn: number;
      thicknessIn: number;
    }) =>
      tenantFilterSizesApi.create({
        ...dims,
        sortOrder: nextSortOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDraft(emptyDraft);
      setErr(null);
      // Stay in adding mode and refocus Length — rapid bulk-entry loop.
      requestAnimationFrame(() => lengthRef.current?.focus());
    },
    onError: (e) => {
      setErr(extractApiError(e) ?? t('settings.filterSizes.errorSave'));
    },
  });

  const reset = () => {
    setAdding(false);
    setDraft(emptyDraft);
    setErr(null);
  };

  const submit = () => {
    setErr(null);
    const L = Number(draft.length);
    const W = Number(draft.width);
    const T = Number(draft.thickness);
    const filled =
      draft.length.trim() !== '' &&
      draft.width.trim() !== '' &&
      draft.thickness.trim() !== '';
    const allPositive =
      [L, W, T].every((n) => Number.isFinite(n) && n > 0);

    if (!filled || !allPositive) {
      setErr(t('settings.filterSizes.invalidDimensions'));
      // Focus the first invalid field.
      if (!draft.length.trim() || !Number.isFinite(L) || L <= 0) {
        lengthRef.current?.focus();
      } else if (!draft.width.trim() || !Number.isFinite(W) || W <= 0) {
        widthRef.current?.focus();
      } else {
        thicknessRef.current?.focus();
      }
      return;
    }

    const isDup = existing.some(
      (s) => s.lengthIn === L && s.widthIn === W && s.thicknessIn === T,
    );
    if (isDup) {
      setErr(
        t('settings.filterSizes.duplicateError', {
          name: formatFilterSize({
            lengthIn: L,
            widthIn: W,
            thicknessIn: T,
          }),
        }),
      );
      return;
    }

    createMutation.mutate({ lengthIn: L, widthIn: W, thicknessIn: T });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      reset();
    }
    // Enter is handled by the form's onSubmit — don't double-handle.
  };

  const updateField = (field: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    if (err) setErr(null);
  };

  if (!adding) {
    return (
      <tr>
        <td colSpan={2}>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="m-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 py-2 text-[12.5px] text-fg-muted hover:border-fg-muted hover:bg-bg-elev hover:text-fg-strong"
          >
            <PlusIcon className="size-3.5" />
            {t('settings.filterSizes.add')}
          </button>
        </td>
      </tr>
    );
  }

  const disabled = createMutation.isPending;
  // Catalyst <Input> wraps the <input> in a `block w-full` <span>, so a
  // fixed-width sibling wrapper around each Input is what actually pins
  // the dimension boxes to 56 px. Don't use <Field> here — Field's block
  // rhythm stretches each input across the row.
  const dimInputClass =
    'text-center tabular-nums ' +
    // Hide the number-spinner arrows so 1- to 2-digit dimensions read clean.
    '[&_input]:[-moz-appearance:textfield] ' +
    '[&_input::-webkit-outer-spin-button]:m-0 ' +
    '[&_input::-webkit-outer-spin-button]:appearance-none ' +
    '[&_input::-webkit-inner-spin-button]:m-0 ' +
    '[&_input::-webkit-inner-spin-button]:appearance-none';
  const dimWrap = 'inline-block w-14 shrink-0';

  return (
    <tr>
      <td colSpan={2}>
        <form
          role="group"
          aria-label={t('settings.filterSizes.addRowLabel')}
          onSubmit={handleSubmit}
          className="flex flex-nowrap items-center gap-2 px-2 py-1.5 max-sm:flex-wrap"
        >
          <label className="sr-only" htmlFor="fs-length">
            {t('settings.filterSizes.length')}
          </label>
          <span className={dimWrap}>
            <Input
              id="fs-length"
              ref={lengthRef}
              size="xs"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="1"
              max="96"
              autoFocus
              className={dimInputClass}
              value={draft.length}
              onChange={(e) => updateField('length', e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('settings.filterSizes.dimAbbrev.length')}
              disabled={disabled}
            />
          </span>
          <span className="text-fg-muted" aria-hidden>×</span>

          <label className="sr-only" htmlFor="fs-width">
            {t('settings.filterSizes.width')}
          </label>
          <span className={dimWrap}>
            <Input
              id="fs-width"
              ref={widthRef}
              size="xs"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="1"
              max="96"
              className={dimInputClass}
              value={draft.width}
              onChange={(e) => updateField('width', e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('settings.filterSizes.dimAbbrev.width')}
              disabled={disabled}
            />
          </span>
          <span className="text-fg-muted" aria-hidden>×</span>

          <label className="sr-only" htmlFor="fs-thickness">
            {t('settings.filterSizes.thickness')}
          </label>
          <span className={dimWrap}>
            <Input
              id="fs-thickness"
              ref={thicknessRef}
              size="xs"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0.5"
              max="12"
              className={dimInputClass}
              value={draft.thickness}
              onChange={(e) => updateField('thickness', e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('settings.filterSizes.dimAbbrev.thickness')}
              disabled={disabled}
            />
          </span>

          <span className="ml-2 text-[11px] text-fg-dim max-sm:w-full">
            {t('settings.filterSizes.dimensionsHint')}
          </span>
          {/* Allow Enter from any input to submit the row. */}
          <button type="submit" className="sr-only">
            {t('common.add')}
          </button>
        </form>
        {err && (
          <div
            role="alert"
            className="px-2 pb-1.5 text-[11px] text-danger-500"
          >
            {err}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────
// FilterSizeFormDialog — edit (rename) flow, plus create mode from
// the empty-state Add button. Inline-add (table footer) is the
// rapid-entry path once at least one size exists.
// ─────────────────────────────────────────────────────────────────

interface FormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: TenantFilterSize | null;
  nextSortOrder: number;
}

function FilterSizeFormDialog({
  isOpen,
  onClose,
  item,
  nextSortOrder,
}: FormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(item);

  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setLength(item ? String(item.lengthIn) : '');
    setWidth(item ? String(item.widthIn) : '');
    setThickness(item ? String(item.thicknessIn) : '');
  }, [isOpen, item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = useMutation({
    mutationFn: () =>
      tenantFilterSizesApi.create({
        lengthIn: Number(length),
        widthIn: Number(width),
        thicknessIn: Number(thickness),
        sortOrder: nextSortOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(
        extractApiError(err) ?? t('settings.filterSizes.errorSave'),
      ),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      tenantFilterSizesApi.update(item!.id, {
        lengthIn: Number(length),
        widthIn: Number(width),
        thicknessIn: Number(thickness),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(
        extractApiError(err) ?? t('settings.filterSizes.errorSave'),
      ),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const l = Number(length);
    const w = Number(width);
    const th = Number(thickness);
    if (![l, w, th].every((n) => Number.isFinite(n) && n > 0)) {
      setErrorMessage(t('settings.filterSizes.invalidDimensions'));
      return;
    }
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>
        {isEdit
          ? t('settings.filterSizes.titleEdit')
          : t('settings.filterSizes.titleAdd')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label>{t('settings.filterSizes.length')} *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <Label>{t('settings.filterSizes.width')} *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <Label>{t('settings.filterSizes.thickness')} *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={thickness}
                    onChange={(e) => setThickness(e.target.value)}
                    required
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={isSaving}>
            {isSaving
              ? t('common.saving')
              : isEdit
                ? t('common.update')
                : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
