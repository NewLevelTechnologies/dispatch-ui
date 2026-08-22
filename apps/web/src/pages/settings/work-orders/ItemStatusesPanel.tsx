import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EllipsisVerticalIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { useGlossary } from '../../../contexts/GlossaryContext';
import {
  workItemStatusesApi,
  type WorkItemStatus,
  type StatusCategory,
} from '../../../api/setup';
import { showError, showSuccess, extractApiError } from '../../../lib/toast';
import { PageHead } from '../../../components/ui/PageHead';
import { Button } from '../../../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
import IconButton from '../../../components/IconButton';
import { Pill } from '../../../components/ui/Pill';
import { Card, CardBody } from '../../../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow } from '../../../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../../../components/ui/ListToolbar';
import { ListFooter } from '../../../components/ui/ListFooter';
import { LoadingState } from '../../../components/ui/LoadingState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DragHandle } from '../../../components/settings/DragHandle';
import { roleAccent } from '../../../utils/roleColor';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ItemStatusFormDialog from '../../../components/settings/ItemStatusFormDialog';

const QUERY_KEY = ['work-item-statuses'] as const;

const CATEGORY_TONES: Record<StatusCategory, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'accent',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  NOT_STARTED: 'Not Started',
  AWAITING_SCHEDULE: 'Awaiting Schedule',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function StatusSwatch({ accentId }: { accentId: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
      style={{ background: roleAccent(accentId) }}
    />
  );
}

function CategoryPill({ category }: { category: StatusCategory }) {
  return (
    <Pill tone={CATEGORY_TONES[category]} dot>
      {CATEGORY_LABELS[category]}
    </Pill>
  );
}

export default function ItemStatusesPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const workItem = getName('work_item');

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogItem, setDialogItem] = useState<WorkItemStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WorkItemStatus | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => workItemStatusesApi.getAll(),
  });

  const statuses = useMemo(() => {
    const list = data ?? [];
    return [...list].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [data]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [statuses, searchQuery]);

  const nextSortOrder =
    statuses.length > 0 ? Math.max(...statuses.map((s) => s.sortOrder)) + 1 : 0;

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => workItemStatusesApi.reorder(orderedIds),
    onSuccess: (updated) => {
      queryClient.setQueryData([...QUERY_KEY], updated);
    },
    onError: (err) => {
      showError(t('settings.itemStatuses.errorReorder'), extractApiError(err));
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workItemStatusesApi.delete(id),
    onSuccess: (_, _id, ctx) => {
      const name = (ctx as { name?: string } | undefined)?.name;
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      if (name) showSuccess(`${name} deleted`);
    },
    onError: (err) => {
      showError(t('settings.itemStatuses.errorDelete'), extractApiError(err));
    },
  });

  const handleAdd = () => {
    setDialogItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: WorkItemStatus) => {
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
      from >= statuses.length ||
      to >= statuses.length
    )
      return;
    const reordered = [...statuses];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((s) => s.id));
  };

  const indexOf = (item: WorkItemStatus) => statuses.findIndex((s) => s.id === item.id);

  const showEmpty = !isLoading && !error && statuses.length === 0;
  const showNoMatches =
    !isLoading && !error && statuses.length > 0 && filtered.length === 0;

  return (
    <>
      <PageHead
        title={t('settings.itemStatuses.title', { workItem })}
        sub={
          statuses.length > 0
            ? t('settings.itemStatuses.subtitle', {
                count: statuses.length,
                workItem,
              })
            : null
        }
        actions={
          <Button color="accent" size="xs" onClick={handleAdd}>
            {t('common.actions.add', {
              entity: t('settings.itemStatuses.singular'),
            })}
          </Button>
        }
      />

      {statuses.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.itemStatuses.searchPlaceholder')}
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
                title={t('settings.itemStatuses.couldNotLoad', { workItem })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : showEmpty ? (
              <EmptyState
                icon={<Squares2X2Icon className="size-10 text-fg-dim" />}
                title={t('settings.itemStatuses.emptyTitle', { workItem })}
                description={t('settings.itemStatuses.emptyDescription', { workItem })}
                action={
                  <Button color="accent" onClick={handleAdd}>
                    {t('common.actions.add', {
                      entity: t('settings.itemStatuses.singular'),
                    })}
                  </Button>
                }
              />
            ) : showNoMatches ? (
              <EmptyState title={t('settings.itemStatuses.noMatches')} />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.itemStatuses.colName')}</th>
                      <th>{t('settings.itemStatuses.colCode')}</th>
                      <th>{t('settings.itemStatuses.colCategory')}</th>
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
                      const isLast = idx === statuses.length - 1;
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
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="hidden sm:inline-flex">
                                <DragHandle />
                              </span>
                              <StatusSwatch accentId={item.accentId} />
                              <span className="font-medium text-fg-strong">
                                {item.name}
                              </span>
                              {item.isSeeded && (
                                <Pill tone="neutral" inline>
                                  {t('settings.itemStatuses.builtInBadge')}
                                </Pill>
                              )}
                              {item.isTerminal && (
                                <Pill tone="neutral" inline>
                                  {t('settings.itemStatuses.terminalBadge')}
                                </Pill>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="font-mono text-fg-muted tabular-nums">
                              {item.code}
                            </span>
                          </td>
                          <td>
                            <CategoryPill category={item.statusCategory} />
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
                                  <DropdownItem
                                    onClick={() => setPendingDelete(item)}
                                    disabled={item.isSeeded}
                                  >
                                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                    {item.isSeeded && (
                                      <DropdownDescription>
                                        {t('settings.itemStatuses.builtInCantDelete')}
                                      </DropdownDescription>
                                    )}
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
                  left={t('settings.itemStatuses.rowsCount', {
                    count: filtered.length,
                    noun: t('settings.itemStatuses.singular').toLowerCase() + (filtered.length === 1 ? '' : 'es'),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <ItemStatusFormDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogItem(null);
        }}
        status={dialogItem ?? undefined}
        nextSortOrder={nextSortOrder}
        queryKey={QUERY_KEY}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('settings.itemStatuses.deleteConfirm', {
          name: pendingDelete?.name ?? '',
        })}
        message={t('settings.itemStatuses.deleteWarning', { workItem })}
        confirmLabel={
          deleteMutation.isPending ? t('common.deleting') : t('common.delete')
        }
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
