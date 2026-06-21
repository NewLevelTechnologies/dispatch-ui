import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  equipmentTypesApi,
  equipmentCategoriesApi,
  type EquipmentType,
  type EquipmentCategory,
} from '../../../api';
import { Button } from '../../../components/catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '../../../components/catalyst/dialog';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
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
import CategoryFieldsDialog from '../../../components/settings/CategoryFieldsDialog';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { Card, CardBody } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ListSearch, ListToolbar } from '../../../components/ui/ListToolbar';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHead } from '../../../components/ui/PageHead';
import { Pill } from '../../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../../lib/toast';

const TYPES_KEY = ['equipment-types'] as const;
const CATEGORIES_KEY = ['equipment-categories', 'all'] as const;

interface TypeWithCategories extends EquipmentType {
  categories: EquipmentCategory[];
}

type DialogState =
  | { kind: 'addType' }
  | { kind: 'editType'; type: EquipmentType }
  | { kind: 'addCategory'; typeId: string; typeName: string }
  | { kind: 'editCategory'; category: EquipmentCategory }
  | null;

type PendingDelete =
  | { kind: 'type'; type: EquipmentType; categoryCount: number }
  | { kind: 'category'; category: EquipmentCategory }
  | null;

export default function EquipmentTaxonomyPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const equipmentName = getName('equipment');
  const equipmentNamePlural = getName('equipment', true);

  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const preSearchExpanded = useRef<Set<string> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  // Per-category custom-fields manager (its own dialog).
  const [fieldsCategory, setFieldsCategory] = useState<EquipmentCategory | null>(null);

  const {
    data: types,
    isLoading: typesLoading,
    error: typesError,
    refetch,
  } = useQuery({
    queryKey: TYPES_KEY,
    queryFn: () => equipmentTypesApi.getAll(),
  });

  const { data: allCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => equipmentCategoriesApi.getAll(),
  });

  const isLoading = typesLoading || categoriesLoading;

  // Compose: types with their sorted categories nested.
  const composed: TypeWithCategories[] = useMemo(() => {
    if (!types) return [];
    const byType = new Map<string, EquipmentCategory[]>();
    (allCategories ?? []).forEach((c) => {
      const list = byType.get(c.equipmentTypeId) ?? [];
      list.push(c);
      byType.set(c.equipmentTypeId, list);
    });
    return [...types]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((tp) => ({
        ...tp,
        categories: (byType.get(tp.id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
        ),
      }));
  }, [types, allCategories]);

  // Filter by search. When categories match but the type doesn't, keep the
  // type with only the matching categories. Auto-expand any type whose
  // categories contain a hit while a search is active.
  const filteredTypes = useMemo(() => {
    if (!q.trim()) return composed;
    const needle = q.toLowerCase();
    return composed
      .map((tp) => {
        const typeMatches = tp.name.toLowerCase().includes(needle);
        const matchingCats = tp.categories.filter((c) =>
          c.name.toLowerCase().includes(needle)
        );
        if (typeMatches) {
          // Type matches — show all its categories.
          return { ...tp, _matches: true };
        }
        if (matchingCats.length > 0) {
          return { ...tp, categories: matchingCats, _matches: true };
        }
        return { ...tp, _matches: false };
      })
      .filter((tp) => tp._matches);
  }, [composed, q]);

  const hasFilters = q.trim().length > 0;

  // When search becomes active, snapshot the prior expanded set and expand
  // any type that has matching categories so users see the hit. When search
  // clears, restore.
  useEffect(() => {
    if (!hasFilters) {
      if (preSearchExpanded.current) {
        setExpanded(preSearchExpanded.current);
        preSearchExpanded.current = null;
      }
      return;
    }
    if (!preSearchExpanded.current) {
      preSearchExpanded.current = new Set(expanded);
    }
    const next = new Set<string>();
    filteredTypes.forEach((tp) => {
      // Only auto-expand when the category list was the reason it survived
      // the filter — otherwise leave it collapsed.
      const fullCategories = composed.find((c) => c.id === tp.id)?.categories ?? [];
      if (tp.categories.length < fullCategories.length || tp.categories.length > 0) {
        next.add(tp.id);
      }
    });
    setExpanded(next);
    // We intentionally re-run only when search state changes or the
    // filtered shape changes — not when expanded changes (would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFilters, q]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(composed.map((tp) => tp.id)));
  const collapseAll = () => setExpanded(new Set());

  // ── Mutations ───────────────────────────────────────────────

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => equipmentTypesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TYPES_KEY });
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      showSuccess(t('settings.equipmentTaxonomy.toast.typeDeleted'));
    },
    onError: (err) => showError(t('settings.equipmentTaxonomy.toast.deleteTypeFailed'), extractApiError(err)),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => equipmentCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      showSuccess(t('settings.equipmentTaxonomy.toast.categoryDeleted'));
    },
    onError: (err) => showError(t('settings.equipmentTaxonomy.toast.deleteCategoryFailed'), extractApiError(err)),
  });

  const reorderTypesMutation = useMutation({
    mutationFn: (orderedIds: string[]) => equipmentTypesApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(TYPES_KEY, updated),
    onError: (err) => {
      showError(t('settings.equipmentTaxonomy.toast.reorderTypesFailed'), extractApiError(err));
      queryClient.invalidateQueries({ queryKey: TYPES_KEY });
    },
  });

  const reorderCategoriesMutation = useMutation({
    mutationFn: ({ typeId, orderedIds }: { typeId: string; orderedIds: string[] }) =>
      equipmentCategoriesApi.reorder(typeId, orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
    onError: (err) => {
      showError(t('settings.equipmentTaxonomy.toast.reorderCategoriesFailed'), extractApiError(err));
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });

  // ── Drag for types ──────────────────────────────────────────
  const [typeDragIndex, setTypeDragIndex] = useState<number | null>(null);
  const [typeDragOverIndex, setTypeDragOverIndex] = useState<number | null>(null);

  const reorderTypes = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= composed.length || to >= composed.length) return;
    const reordered = [...composed];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderTypesMutation.mutate(reordered.map((tp) => tp.id));
  };

  // Find nextSortOrder for a new category in a given type, given current data.
  const nextCategorySortOrder = (typeId: string): number => {
    const list = composed.find((tp) => tp.id === typeId)?.categories ?? [];
    return list.length > 0 ? Math.max(...list.map((c) => c.sortOrder)) + 1 : 0;
  };

  const nextTypeSortOrder =
    composed.length > 0 ? Math.max(...composed.map((tp) => tp.sortOrder)) + 1 : 0;

  // ── Delete confirm copy ─────────────────────────────────────
  const deleteConfirm = (() => {
    if (!pendingDelete) return null;
    if (pendingDelete.kind === 'type') {
      const { type, categoryCount } = pendingDelete;
      const title = t('settings.equipmentTaxonomy.delete.typeTitle', { name: type.name });
      const message =
        categoryCount === 0
          ? t('settings.equipmentTaxonomy.delete.typeMessageEmpty')
          : categoryCount === 1
            ? t('settings.equipmentTaxonomy.delete.typeMessageOne', { entity: equipmentNamePlural })
            : t('settings.equipmentTaxonomy.delete.typeMessage', {
                count: categoryCount,
                entity: equipmentNamePlural,
              });
      return { title, message };
    }
    const { category } = pendingDelete;
    return {
      title: t('settings.equipmentTaxonomy.delete.categoryTitle', { name: category.name }),
      message: t('settings.equipmentTaxonomy.delete.categoryMessage', { entity: equipmentNamePlural }),
    };
  })();

  const confirmPending = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'type') deleteTypeMutation.mutate(pendingDelete.type.id);
    else deleteCategoryMutation.mutate(pendingDelete.category.id);
  };

  return (
    <>
      <PageHead
        title={t('settings.equipmentTaxonomy.title')}
        sub={t('settings.equipmentTaxonomy.subtitle', { entity: equipmentName })}
        actions={
          <Button color="accent" size="xs" onClick={() => setDialog({ kind: 'addType' })}>
            <PlusIcon className="size-4" />
            {t('settings.equipmentTaxonomy.addType')}
          </Button>
        }
      />

      {composed.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.equipmentTaxonomy.searchPlaceholder')}
              value={q}
              onChange={setQ}
            />
          }
        >
          <Button outline onClick={expandAll}>
            {t('settings.equipmentTaxonomy.expandAll')}
          </Button>
          <Button outline onClick={collapseAll}>
            {t('settings.equipmentTaxonomy.collapseAll')}
          </Button>
        </ListToolbar>
      )}

      <div className="mt-4 max-w-[900px]">
        {isLoading ? (
          <LoadingState label={t('settings.equipmentTaxonomy.loading', { entity: equipmentName })} />
        ) : typesError ? (
          <ErrorState
            title={t('settings.equipmentTaxonomy.errorLoad', { entity: equipmentName })}
            description={extractApiError(typesError) ?? (typesError as Error).message}
            action={
              <Button outline onClick={() => refetch()}>
                {t('common.actions.tryAgain')}
              </Button>
            }
          />
        ) : filteredTypes.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<MagnifyingGlassIcon className="size-10 text-fg-dim" />}
              title={t('settings.equipmentTaxonomy.empty.noMatchTitle')}
              description={t('settings.equipmentTaxonomy.empty.noMatchDescription')}
              action={
                <Button outline onClick={() => setQ('')}>
                  {t('settings.equipmentTaxonomy.clearSearch')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Squares2X2Icon className="size-10 text-fg-dim" />}
              title={t('settings.equipmentTaxonomy.empty.noTypesTitle', { entity: equipmentName })}
              description={t('settings.equipmentTaxonomy.empty.noTypesDescription')}
              action={
                <Button color="accent" onClick={() => setDialog({ kind: 'addType' })}>
                  {t('settings.equipmentTaxonomy.addType')}
                </Button>
              }
            />
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredTypes.map((tp, index) => {
              // Move up/down operates on the unfiltered canonical order so
              // disabled state stays correct even when a search has hidden
              // siblings.
              const composedIndex = composed.findIndex((c) => c.id === tp.id);
              return (
              <TaxonomyBlock
                key={tp.id}
                type={tp}
                isExpanded={expanded.has(tp.id)}
                onToggle={() => toggle(tp.id)}
                onAddCategory={() =>
                  setDialog({ kind: 'addCategory', typeId: tp.id, typeName: tp.name })
                }
                onRenameType={() => setDialog({ kind: 'editType', type: tp })}
                onDeleteType={() =>
                  setPendingDelete({
                    kind: 'type',
                    type: tp,
                    categoryCount: tp.categories.length,
                  })
                }
                onMoveTypeUp={() => reorderTypes(composedIndex, composedIndex - 1)}
                onMoveTypeDown={() => reorderTypes(composedIndex, composedIndex + 1)}
                isFirstType={composedIndex === 0}
                isLastType={composedIndex === composed.length - 1}
                onRenameCategory={(c) => setDialog({ kind: 'editCategory', category: c })}
                onManageFields={(c) => setFieldsCategory(c)}
                onDeleteCategory={(c) => setPendingDelete({ kind: 'category', category: c })}
                onReorderCategory={(from, to) => {
                  if (from === to) return;
                  const reordered = [...tp.categories];
                  const [moved] = reordered.splice(from, 1);
                  reordered.splice(to, 0, moved);
                  reorderCategoriesMutation.mutate({
                    typeId: tp.id,
                    orderedIds: reordered.map((c) => c.id),
                  });
                }}
                onTypeDragStart={() => setTypeDragIndex(index)}
                onTypeDragOver={() => {
                  if (typeDragIndex === null) return;
                  if (typeDragOverIndex !== index) setTypeDragOverIndex(index);
                }}
                onTypeDragLeave={() => {
                  if (typeDragOverIndex === index) setTypeDragOverIndex(null);
                }}
                onTypeDrop={() => {
                  if (typeDragIndex !== null) reorderTypes(typeDragIndex, index);
                  setTypeDragIndex(null);
                  setTypeDragOverIndex(null);
                }}
                onTypeDragEnd={() => {
                  setTypeDragIndex(null);
                  setTypeDragOverIndex(null);
                }}
                isDragging={typeDragIndex === index}
                isDragOver={
                  typeDragOverIndex === index &&
                  typeDragIndex !== null &&
                  typeDragIndex !== index
                }
              />
              );
            })}

            {!hasFilters && (
              <button
                type="button"
                onClick={() => setDialog({ kind: 'addType' })}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3.5 py-3 text-[12.5px] text-fg-muted hover:border-fg-muted hover:bg-bg-elev hover:text-fg-strong"
              >
                <PlusIcon className="size-4" />
                {t('settings.equipmentTaxonomy.addType')}
              </button>
            )}
          </div>
        )}
      </div>

      <TaxonomyDialog
        state={dialog}
        onClose={() => setDialog(null)}
        nextTypeSortOrder={nextTypeSortOrder}
        nextCategorySortOrder={nextCategorySortOrder}
        onTypeCreated={(created) => {
          // Auto-expand the new type so the user can add categories.
          setExpanded((prev) => new Set(prev).add(created.id));
        }}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmPending}
        title={deleteConfirm?.title ?? ''}
        message={deleteConfirm?.message ?? ''}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteTypeMutation.isPending || deleteCategoryMutation.isPending}
      />

      <CategoryFieldsDialog category={fieldsCategory} onClose={() => setFieldsCategory(null)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// TaxonomyBlock — one card per type, with collapsed preview or
// expanded categories panel.
// ─────────────────────────────────────────────────────────────────

interface TaxonomyBlockProps {
  type: TypeWithCategories;
  isExpanded: boolean;
  onToggle: () => void;
  onAddCategory: () => void;
  onRenameType: () => void;
  onDeleteType: () => void;
  onMoveTypeUp: () => void;
  onMoveTypeDown: () => void;
  isFirstType: boolean;
  isLastType: boolean;
  onRenameCategory: (c: EquipmentCategory) => void;
  onManageFields: (c: EquipmentCategory) => void;
  onDeleteCategory: (c: EquipmentCategory) => void;
  onReorderCategory: (from: number, to: number) => void;
  onTypeDragStart: () => void;
  onTypeDragOver: () => void;
  onTypeDragLeave: () => void;
  onTypeDrop: () => void;
  onTypeDragEnd: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}

function TaxonomyBlock({
  type,
  isExpanded,
  onToggle,
  onAddCategory,
  onRenameType,
  onDeleteType,
  onMoveTypeUp,
  onMoveTypeDown,
  isFirstType,
  isLastType,
  onRenameCategory,
  onManageFields,
  onDeleteCategory,
  onReorderCategory,
  onTypeDragStart,
  onTypeDragOver,
  onTypeDragLeave,
  onTypeDrop,
  onTypeDragEnd,
  isDragging,
  isDragOver,
}: TaxonomyBlockProps) {
  const { t } = useTranslation();
  // Inner drag state for categories within this type.
  const [catDragIndex, setCatDragIndex] = useState<number | null>(null);
  const [catDragOverIndex, setCatDragOverIndex] = useState<number | null>(null);

  const preview = type.categories.map((c) => c.name).join(' · ');

  return (
    <Card
      className={[
        isDragging && 'opacity-50',
        isDragOver && 'outline outline-2 outline-accent-500/40 outline-offset-[-2px]',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onTypeDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onTypeDragOver();
      }}
      onDragLeave={onTypeDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onTypeDrop();
      }}
      onDragEnd={onTypeDragEnd}
    >
      <CardBody flush>
        {/* Header row — clickable div, not a button, so the kebab Menu inside
            can render its own <button> without nesting. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-controls={`taxonomy-block-${type.id}-categories`}
          onClick={onToggle}
          onKeyDown={(e) => {
            // Child interactives (drag handle, kebab) own their own key handling.
            if (e.currentTarget !== e.target) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          className="acc-type-row grid w-full cursor-pointer grid-cols-[20px_18px_1fr_auto_26px] items-center gap-2.5 px-3.5 py-3 text-left max-sm:grid-cols-[18px_1fr_auto_26px]"
        >
          <span className="max-sm:hidden">
            <DragHandle />
          </span>
          <ChevronDownIcon
            className={`size-4 text-fg-dim transition-transform ${
              isExpanded ? '' : '-rotate-90'
            }`}
          />
          <span
            className="min-w-0 truncate text-[15px] font-semibold text-fg-strong"
            title={type.name}
          >
            {type.name}
          </span>
          <span className="justify-self-end">
            <Pill tone="neutral" className="tnum">
              {type.categories.length}
            </Pill>
          </span>
          <span
            className="justify-self-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown>
              <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                <EllipsisVerticalIcon className="size-4" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                {/* Mobile-only reorder. Drag handles are sm:hidden so kebab
                    items are the only reorder affordance below the sm breakpoint. */}
                <span className="contents sm:hidden">
                  <DropdownItem onClick={onMoveTypeUp} disabled={isFirstType}>
                    <DropdownLabel>{t('common.moveUp')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem onClick={onMoveTypeDown} disabled={isLastType}>
                    <DropdownLabel>{t('common.moveDown')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                </span>
                <DropdownItem onClick={onRenameType}>
                  <DropdownLabel>{t('common.actions.rename')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={onDeleteType}>
                  <DropdownLabel>{t('common.delete')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </span>

          {/* Collapsed-state preview line — lives in the same grid as a second
              implicit row, spanning the name + count columns. */}
          {!isExpanded && type.categories.length > 0 && (
            <span className="col-start-2 col-span-2 -mt-0.5 min-w-0 truncate text-[11.5px] font-normal text-fg-muted sm:col-start-3">
              {preview}
            </span>
          )}
        </div>

        {isExpanded && (
          <div
            id={`taxonomy-block-${type.id}-categories`}
            className="border-t border-border-soft bg-bg-sunken pb-2 pt-1.5 pl-3.5 pr-3.5 sm:pl-[50px]"
          >
            {type.categories.length === 0 ? (
              <EmptyState
                compact
                title={t('settings.equipmentTaxonomy.empty.noCategoriesTitle')}
              />
            ) : (
              type.categories.map((c, idx) => {
                const isCatDragging = catDragIndex === idx;
                const isCatDragOver =
                  catDragOverIndex === idx && catDragIndex !== null && catDragIndex !== idx;
                const isFirstCat = idx === 0;
                const isLastCat = idx === type.categories.length - 1;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = 'move';
                      setCatDragIndex(idx);
                    }}
                    onDragOver={(e) => {
                      if (catDragIndex === null) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      if (catDragOverIndex !== idx) setCatDragOverIndex(idx);
                    }}
                    onDragLeave={() => {
                      if (catDragOverIndex === idx) setCatDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (catDragIndex !== null) onReorderCategory(catDragIndex, idx);
                      setCatDragIndex(null);
                      setCatDragOverIndex(null);
                    }}
                    onDragEnd={(e) => {
                      e.stopPropagation();
                      setCatDragIndex(null);
                      setCatDragOverIndex(null);
                    }}
                    className={[
                      'grid grid-cols-[18px_1fr_26px] items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-bg-elev max-sm:grid-cols-[1fr_26px]',
                      isCatDragging && 'opacity-50',
                      isCatDragOver && 'outline outline-2 outline-accent-500/40 outline-offset-[-2px]',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="max-sm:hidden">
                      <DragHandle />
                    </span>
                    <span
                      className="min-w-0 truncate text-[13px] text-fg-strong"
                      title={c.name}
                    >
                      {c.name}
                    </span>
                    <span className="justify-self-end">
                      <Dropdown>
                        <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                          <EllipsisVerticalIcon className="size-4" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <span className="contents sm:hidden">
                            <DropdownItem
                              onClick={() => onReorderCategory(idx, idx - 1)}
                              disabled={isFirstCat}
                            >
                              <DropdownLabel>{t('common.moveUp')}</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => onReorderCategory(idx, idx + 1)}
                              disabled={isLastCat}
                            >
                              <DropdownLabel>{t('common.moveDown')}</DropdownLabel>
                            </DropdownItem>
                            <DropdownDivider />
                          </span>
                          <DropdownItem onClick={() => onManageFields(c)}>
                            <DropdownLabel>{t('settings.equipmentTaxonomy.customFields')}</DropdownLabel>
                          </DropdownItem>
                          <DropdownItem onClick={() => onRenameCategory(c)}>
                            <DropdownLabel>{t('common.actions.rename')}</DropdownLabel>
                          </DropdownItem>
                          <DropdownItem onClick={() => onDeleteCategory(c)}>
                            <DropdownLabel>{t('common.delete')}</DropdownLabel>
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </span>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={onAddCategory}
              className="mx-2.5 my-1 flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 py-2 text-[12px] text-fg-muted hover:border-fg-muted hover:bg-bg-elev hover:text-fg-strong"
            >
              <PlusIcon className="size-3.5" />
              {t('settings.equipmentTaxonomy.addCategoryTo', { name: type.name })}
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// TaxonomyDialog — single dialog covering add/edit type and add/edit
// category. Renders only when `state` is non-null.
// ─────────────────────────────────────────────────────────────────

interface DialogProps {
  state: DialogState;
  onClose: () => void;
  nextTypeSortOrder: number;
  nextCategorySortOrder: (typeId: string) => number;
  onTypeCreated: (created: EquipmentType) => void;
}

function TaxonomyDialog({
  state,
  onClose,
  nextTypeSortOrder,
  nextCategorySortOrder,
  onTypeCreated,
}: DialogProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const equipmentName = getName('equipment');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form whenever the dialog opens or its target changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!state) return;
    setErrorMessage(null);
    if (state.kind === 'editType') setName(state.type.name);
    else if (state.kind === 'editCategory') setName(state.category.name);
    else setName('');
  }, [state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createTypeMutation = useMutation({
    mutationFn: () =>
      equipmentTypesApi.create({ name: name.trim(), sortOrder: nextTypeSortOrder }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: TYPES_KEY });
      onTypeCreated(created);
      onClose();
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('settings.equipmentTaxonomy.errorSaveType', { entity: equipmentName })),
  });

  const updateTypeMutation = useMutation({
    mutationFn: (id: string) => equipmentTypesApi.update(id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TYPES_KEY });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('settings.equipmentTaxonomy.errorSaveType', { entity: equipmentName })),
  });

  const createCategoryMutation = useMutation({
    mutationFn: ({ typeId }: { typeId: string }) =>
      equipmentCategoriesApi.create({
        equipmentTypeId: typeId,
        name: name.trim(),
        sortOrder: nextCategorySortOrder(typeId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('settings.equipmentTaxonomy.errorSaveCategory')),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (id: string) => equipmentCategoriesApi.update(id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('settings.equipmentTaxonomy.errorSaveCategory')),
  });

  const isSaving =
    createTypeMutation.isPending ||
    updateTypeMutation.isPending ||
    createCategoryMutation.isPending ||
    updateCategoryMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage(t('common.form.required', { field: t('common.form.name') }));
      return;
    }
    if (!state) return;
    if (state.kind === 'addType') createTypeMutation.mutate();
    else if (state.kind === 'editType') updateTypeMutation.mutate(state.type.id);
    else if (state.kind === 'addCategory')
      createCategoryMutation.mutate({ typeId: state.typeId });
    else if (state.kind === 'editCategory') updateCategoryMutation.mutate(state.category.id);
  };

  const title = (() => {
    if (!state) return '';
    switch (state.kind) {
      case 'addType':
        return t('settings.equipmentTaxonomy.dialog.addType', { entity: equipmentName });
      case 'editType':
        return t('settings.equipmentTaxonomy.dialog.editType', { entity: equipmentName });
      case 'addCategory':
        return t('settings.equipmentTaxonomy.dialog.addCategoryTo', {
          name: state.typeName,
        });
      case 'editCategory':
        return t('settings.equipmentTaxonomy.dialog.editCategory');
    }
  })();

  const isEdit = state?.kind === 'editType' || state?.kind === 'editCategory';

  return (
    <Dialog open={state !== null} onClose={onClose} size="md">
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup>
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
