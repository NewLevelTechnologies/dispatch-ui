import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { dispatchRegionApi, type DispatchRegion } from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../components/catalyst/dropdown';
import DispatchRegionFormDialog from '../../components/DispatchRegionFormDialog';
import ConfirmDialog from '../../components/ConfirmDialog';
import IconButton from '../../components/IconButton';
import { DragHandle } from '../../components/settings/DragHandle';
import { Card, CardBody } from '../../components/ui/Card';
import {
  DenseRow,
  DenseTable,
  DenseTHead,
} from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  ListSearch,
  ListToolbar,
} from '../../components/ui/ListToolbar';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill } from '../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

const QUERY_KEY = ['dispatch-regions'] as const;

export default function DispatchRegionsPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [formState, setFormState] = useState<{ region: DispatchRegion | null } | null>(null);
  const [pendingDisable, setPendingDisable] = useState<DispatchRegion | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const dispatchName = getName('dispatch');
  const regionSingular = getName('dispatch_region');
  const regionsPlural = getName('dispatch_region', true);
  const regionsNoun = regionsPlural.toLowerCase();

  const {
    data: regions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => dispatchRegionApi.getAll(true),
  });

  const sorted = useMemo(
    () =>
      [...(regions ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [regions],
  );
  const activeSorted = useMemo(() => sorted.filter((r) => r.isActive), [sorted]);

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.abbreviation.toLowerCase().includes(needle),
    );
  }, [sorted, searchQuery]);

  const nextSortOrder =
    sorted.length > 0 ? Math.max(...sorted.map((r) => r.sortOrder)) + 1 : 0;
  const hasFilters = searchQuery.trim().length > 0;

  // Mutations ────────────────────────────────────────────────

  const disableMutation = useMutation({
    mutationFn: (id: string) => dispatchRegionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showSuccess(t('settings.dispatchRegions.toast.disabled'));
    },
    onError: (err) =>
      showError(t('settings.dispatchRegions.toast.disableFailed'), extractApiError(err)),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => dispatchRegionApi.reactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showSuccess(t('settings.dispatchRegions.toast.enabled'));
    },
    onError: (err) =>
      showError(t('settings.dispatchRegions.toast.enableFailed'), extractApiError(err)),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => dispatchRegionApi.reorder(orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => {
      showError(t('settings.dispatchRegions.toast.reorderFailed'), extractApiError(err));
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const performReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= activeSorted.length || to >= activeSorted.length) return;
    const reordered = [...activeSorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((r) => r.id));
  };

  const subtitle =
    sorted.length > 0
      ? t('settings.dispatchRegions.subtitle', {
          count: sorted.length,
          regions: regionsNoun,
        })
      : null;

  return (
    <>
      <PageHead
        title={regionsPlural}
        sub={subtitle}
        actions={
          <Button color="accent" size="xs" onClick={() => setFormState({ region: null })}>
            <PlusIcon className="size-4" />
            {t('common.actions.add', { entity: regionSingular })}
          </Button>
        }
      />

      {sorted.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.dispatchRegions.searchPlaceholder', { regions: regionsNoun })}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          }
        />
      )}

      <div className="mt-4">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState
                label={t('settings.dispatchRegions.loading', { regions: regionsNoun })}
              />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: regionsPlural })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={<MapPinIcon className="size-10 text-fg-dim" />}
                title={t('settings.dispatchRegions.emptyTitle', { regions: regionsPlural })}
                description={t('settings.dispatchRegions.emptyDescription')}
                action={
                  <Button color="accent" onClick={() => setFormState({ region: null })}>
                    {t('common.actions.add', { entity: regionSingular })}
                  </Button>
                }
              />
            ) : hasFilters && filtered.length === 0 ? (
              <EmptyState
                icon={<MagnifyingGlassIcon className="size-10 text-fg-dim" />}
                title={t('common.actions.noMatchFilters', { entities: regionsPlural })}
                description={t('common.actions.tryAdjustingFilters')}
                action={
                  <Button outline onClick={() => setSearchQuery('')}>
                    {t('settings.dispatchRegions.clearSearch')}
                  </Button>
                }
              />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.dispatchRegions.col.name')}</th>
                      <th>{t('settings.dispatchRegions.col.abbreviation')}</th>
                      <th>{t('settings.dispatchRegions.col.status')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {filtered.map((region) => {
                      const activeIndex = region.isActive
                        ? activeSorted.findIndex((r) => r.id === region.id)
                        : -1;
                      const draggable = region.isActive && !hasFilters;
                      const isDragging = draggable && dragIndex === activeIndex;
                      const isDragOver =
                        draggable &&
                        dragOverIndex === activeIndex &&
                        dragIndex !== null &&
                        dragIndex !== activeIndex;
                      const isFirst = activeIndex === 0;
                      const isLast = activeIndex === activeSorted.length - 1;
                      return (
                        <DenseRow
                          key={region.id}
                          draggable={draggable}
                          onDragStart={(e: React.DragEvent) => {
                            if (!draggable) return;
                            setDragIndex(activeIndex);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e: React.DragEvent) => {
                            if (dragIndex === null || activeIndex < 0) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIndex !== activeIndex) setDragOverIndex(activeIndex);
                          }}
                          onDragLeave={() => {
                            if (dragOverIndex === activeIndex) setDragOverIndex(null);
                          }}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault();
                            if (dragIndex !== null && activeIndex >= 0) {
                              performReorder(dragIndex, activeIndex);
                            }
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={[
                            !region.isActive && 'opacity-55',
                            isDragging && 'opacity-50',
                            isDragOver &&
                              'outline outline-2 outline-accent-500/40 outline-offset-[-2px]',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td className="strong">
                            <span className="flex items-center gap-2">
                              {draggable && (
                                <span className="hidden sm:flex">
                                  <DragHandle />
                                </span>
                              )}
                              {region.name}
                            </span>
                          </td>
                          <td className="muted font-mono tabular-nums">
                            {region.abbreviation}
                          </td>
                          <td>
                            {region.isActive ? (
                              <Pill tone="success" dot live>
                                {t('common.active')}
                              </Pill>
                            ) : (
                              <Pill tone="neutral" dot>
                                {t('common.disabled')}
                              </Pill>
                            )}
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
                                {/* Mobile-only reorder. The drag handle is
                                    sm:hidden so the kebab is the only reorder
                                    affordance below the sm breakpoint. */}
                                {draggable && (
                                  <span className="contents sm:hidden">
                                    <DropdownItem
                                      onClick={() =>
                                        performReorder(activeIndex, activeIndex - 1)
                                      }
                                      disabled={isFirst}
                                    >
                                      <DropdownLabel>{t('common.moveUp')}</DropdownLabel>
                                    </DropdownItem>
                                    <DropdownItem
                                      onClick={() =>
                                        performReorder(activeIndex, activeIndex + 1)
                                      }
                                      disabled={isLast}
                                    >
                                      <DropdownLabel>{t('common.moveDown')}</DropdownLabel>
                                    </DropdownItem>
                                    <DropdownDivider />
                                  </span>
                                )}
                                <DropdownItem onClick={() => setFormState({ region })}>
                                  <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                </DropdownItem>
                                {region.isActive ? (
                                  <DropdownItem onClick={() => setPendingDisable(region)}>
                                    <DropdownLabel>{t('common.disable')}</DropdownLabel>
                                  </DropdownItem>
                                ) : (
                                  <DropdownItem
                                    onClick={() => enableMutation.mutate(region.id)}
                                  >
                                    <DropdownLabel>{t('common.enable')}</DropdownLabel>
                                  </DropdownItem>
                                )}
                              </DropdownMenu>
                            </Dropdown>
                          </td>
                        </DenseRow>
                      );
                    })}
                  </tbody>
                </DenseTable>
                <ListFooter
                  left={t('settings.showingCount', {
                    count: filtered.length,
                    noun: regionsNoun,
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <DispatchRegionFormDialog
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        region={formState?.region ?? undefined}
        nextSortOrder={nextSortOrder}
      />

      <ConfirmDialog
        isOpen={pendingDisable !== null}
        onClose={() => setPendingDisable(null)}
        onConfirm={() => {
          if (pendingDisable) disableMutation.mutate(pendingDisable.id);
        }}
        title={t('settings.dispatchRegions.disableConfirm.title', {
          name: pendingDisable?.name ?? '',
        })}
        message={t('settings.dispatchRegions.disableConfirm.body', {
          name: pendingDisable?.name ?? '',
          dispatch: dispatchName,
        })}
        confirmLabel={t('common.disable')}
        isDestructive
        isPending={disableMutation.isPending}
      />
    </>
  );
}
