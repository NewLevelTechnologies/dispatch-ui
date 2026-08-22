import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EllipsisVerticalIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import { useGlossary } from '../../../contexts/GlossaryContext';
import {
  workOrderTypesApi,
  type WorkOrderType,
} from '../../../api/setup';
import { showError, showSuccess, extractApiError } from '../../../lib/toast';
import { PageHead } from '../../../components/ui/PageHead';
import { Button } from '../../../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
import IconButton from '../../../components/IconButton';
import { Card, CardBody } from '../../../components/ui/Card';
import {
  DenseTable,
  DenseTHead,
  DenseRow,
} from '../../../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../../../components/ui/ListToolbar';
import { ListFooter } from '../../../components/ui/ListFooter';
import { LoadingState } from '../../../components/ui/LoadingState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DragHandle } from '../../../components/settings/DragHandle';
import { roleAccent } from '../../../utils/roleColor';
import ConfirmDialog from '../../../components/ConfirmDialog';
import WorkOrderTypeFormDialog from '../../../components/settings/WorkOrderTypeFormDialog';

const QUERY_KEY = ['work-order-types'] as const;

function WorkOrderTypeSwatch({ accentId }: { accentId: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
      style={{ background: roleAccent(accentId) }}
    />
  );
}

export default function WorkOrderTypesPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const workOrder = getName('work_order');

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogItem, setDialogItem] = useState<WorkOrderType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WorkOrderType | null>(null);

  // Drag state — index-based, like the original TaxonomyManager.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => workOrderTypesApi.list(),
  });

  const types = useMemo(() => {
    const list = data?.workOrderTypes ?? [];
    return [...list].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [data?.workOrderTypes]);

  const colorsInUse = data?.colorsInUse ?? {};

  // Client-side filter — list is small (~10 types per tenant), no server search.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return types;
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    );
  }, [types, searchQuery]);

  const nextSortOrder =
    types.length > 0 ? Math.max(...types.map((t) => t.sortOrder)) + 1 : 0;

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => workOrderTypesApi.reorder(orderedIds),
    onSuccess: (updated) => {
      const previous = queryClient.getQueryData<{
        workOrderTypes: WorkOrderType[];
        colorsInUse: typeof colorsInUse;
      }>([...QUERY_KEY]);
      if (previous) {
        queryClient.setQueryData([...QUERY_KEY], {
          ...previous,
          workOrderTypes: updated,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      }
    },
    onError: (err) => {
      showError(t('settings.taxonomy.errorReorder', { entity: workOrder }), extractApiError(err));
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workOrderTypesApi.delete(id),
    onSuccess: (_, _id, ctx) => {
      const name = (ctx as { name?: string } | undefined)?.name;
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      if (name) showSuccess(`${name} deleted`);
    },
    onError: (err) => {
      showError(
        t('settings.taxonomy.errorDelete', { entity: workOrder }),
        extractApiError(err)
      );
    },
  });

  const handleAdd = () => {
    setDialogItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: WorkOrderType) => {
    setDialogItem(item);
    setDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id, {
      onSettled: () => setPendingDelete(null),
    });
  };

  const performReorder = (from: number, to: number) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= types.length ||
      to >= types.length
    )
      return;
    const reordered = [...types];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((t) => t.id));
  };

  // Mobile-only kebab actions: drag handles are hidden on small screens.
  const indexOf = (item: WorkOrderType) => types.findIndex((t) => t.id === item.id);

  const showEmpty = !isLoading && !error && types.length === 0;
  const showNoMatches =
    !isLoading && !error && types.length > 0 && filtered.length === 0;

  return (
    <>
      <PageHead
        title={`${workOrder} ${t('settings.nav.types')}`}
        sub={
          types.length > 0
            ? t('settings.workOrderTypes.subtitle', { count: types.length, workOrder })
            : null
        }
        actions={
          <Button color="accent" size="xs" onClick={handleAdd}>
            {t('common.actions.add', { entity: t('settings.workOrderTypes.singular') })}
          </Button>
        }
      />

      {types.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.workOrderTypes.searchPlaceholder')}
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
              <LoadingState />
            ) : error ? (
              <ErrorState
                title={t('settings.workOrderTypes.couldNotLoad', { workOrder })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : showEmpty ? (
              <EmptyState
                icon={<RectangleStackIcon className="size-10 text-fg-dim" />}
                title={t('settings.workOrderTypes.emptyTitle', { workOrder })}
                description={t('settings.workOrderTypes.emptyDescription', { workOrder })}
                action={
                  <Button color="accent" onClick={handleAdd}>
                    {t('common.actions.add', { entity: t('settings.workOrderTypes.singular') })}
                  </Button>
                }
              />
            ) : showNoMatches ? (
              <EmptyState title={t('settings.workOrderTypes.noMatches', { workOrder })} />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.workOrderTypes.colName')}</th>
                      <th>{t('settings.workOrderTypes.colCode')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {filtered.map((item) => {
                      const idx = indexOf(item);
                      const isDragging = dragIndex === idx;
                      const isDragOver =
                        dragOverIndex === idx &&
                        dragIndex !== null &&
                        dragIndex !== idx;
                      const isFirst = idx === 0;
                      const isLast = idx === types.length - 1;
                      return (
                        <DenseRow
                          key={item.id}
                          draggable
                          onDragStart={(e: React.DragEvent) => {
                            setDragIndex(idx);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e: React.DragEvent) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIndex !== idx) setDragOverIndex(idx);
                          }}
                          onDragLeave={() => {
                            if (dragOverIndex === idx) setDragOverIndex(null);
                          }}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault();
                            if (dragIndex !== null) performReorder(dragIndex, idx);
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
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="hidden sm:inline-flex">
                                <DragHandle />
                              </span>
                              <WorkOrderTypeSwatch accentId={item.accentId} />
                              <span className="font-medium text-fg-strong">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="font-mono text-fg-muted tabular-nums">
                              {item.code}
                            </span>
                          </td>
                          <td className="right">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownButton
                                  as={IconButton}
                                  aria-label={t('common.moreOptions')}
                                >
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <span className="contents sm:hidden">
                                    <DropdownItem
                                      onClick={() => performReorder(idx, idx - 1)}
                                      disabled={isFirst}
                                    >
                                      <DropdownLabel>
                                        {t('common.moveUp')}
                                      </DropdownLabel>
                                    </DropdownItem>
                                    <DropdownItem
                                      onClick={() => performReorder(idx, idx + 1)}
                                      disabled={isLast}
                                    >
                                      <DropdownLabel>
                                        {t('common.moveDown')}
                                      </DropdownLabel>
                                    </DropdownItem>
                                    <DropdownDivider />
                                  </span>
                                  <DropdownItem onClick={() => handleEdit(item)}>
                                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                  </DropdownItem>
                                  <DropdownDivider />
                                  <DropdownItem onClick={() => setPendingDelete(item)}>
                                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                  </DropdownItem>
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          </td>
                        </DenseRow>
                      );
                    })}
                  </tbody>
                </DenseTable>
                <ListFooter
                  left={t('settings.workOrderTypes.rowsCount', {
                    count: filtered.length,
                    noun: t('settings.nav.types').toLowerCase(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <WorkOrderTypeFormDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogItem(null);
        }}
        item={dialogItem ?? undefined}
        nextSortOrder={nextSortOrder}
        colorsInUse={colorsInUse}
        queryKey={QUERY_KEY}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('settings.workOrderTypes.deleteConfirm', {
          name: pendingDelete?.name ?? '',
        })}
        message={t('settings.workOrderTypes.deleteWarning', { workOrder })}
        confirmLabel={
          deleteMutation.isPending ? t('common.deleting') : t('common.delete')
        }
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
