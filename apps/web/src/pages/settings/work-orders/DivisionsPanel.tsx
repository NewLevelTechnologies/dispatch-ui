import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EllipsisVerticalIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import { useGlossary } from '../../../contexts/GlossaryContext';
import {
  divisionsApi,
  type Division,
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
import ConfirmDialog from '../../../components/ConfirmDialog';
import DivisionFormDialog from '../../../components/settings/DivisionFormDialog';

const QUERY_KEY = ['divisions'] as const;

export default function DivisionsPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const divisionLabel = getName('division');
  const divisionsLabel = getName('division', true);

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogItem, setDialogItem] = useState<Division | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Division | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: rawDivisions, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => divisionsApi.getAll(),
  });

  const divisions = useMemo(() => {
    const list = rawDivisions ?? [];
    return [...list].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [rawDivisions]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return divisions;
    return divisions.filter(
      (d) =>
        d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
    );
  }, [divisions, searchQuery]);

  const nextSortOrder =
    divisions.length > 0
      ? Math.max(...divisions.map((d) => d.sortOrder)) + 1
      : 0;

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => divisionsApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData([...QUERY_KEY], updated),
    onError: (err) => {
      showError(
        t('settings.taxonomy.errorReorder', { entity: divisionLabel }),
        extractApiError(err)
      );
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => divisionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      if (pendingDelete) showSuccess(`${pendingDelete.name} deleted`);
    },
    onError: (err) => {
      showError(
        t('settings.taxonomy.errorDelete', { entity: divisionLabel }),
        extractApiError(err)
      );
    },
  });

  const handleAdd = () => {
    setDialogItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: Division) => {
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
      from >= divisions.length ||
      to >= divisions.length
    )
      return;
    const reordered = [...divisions];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((d) => d.id));
  };

  const indexOf = (item: Division) =>
    divisions.findIndex((d) => d.id === item.id);

  const showEmpty = !isLoading && !error && divisions.length === 0;
  const showNoMatches =
    !isLoading && !error && divisions.length > 0 && filtered.length === 0;

  return (
    <>
      <PageHead
        title={divisionsLabel}
        sub={
          divisions.length > 0
            ? t('settings.divisions.subtitle', { count: divisions.length })
            : null
        }
        actions={
          <Button color="accent" size="xs" onClick={handleAdd}>
            {t('common.actions.add', { entity: divisionLabel })}
          </Button>
        }
      />

      {divisions.length > 0 && (
        <ListToolbar
          search={
            <ListSearch
              placeholder={t('settings.divisions.searchPlaceholder')}
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
                title={t('settings.divisions.couldNotLoad')}
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
                title={t('settings.divisions.emptyTitle')}
                description={t('settings.divisions.emptyDescription')}
                action={
                  <Button color="accent" onClick={handleAdd}>
                    {t('common.actions.add', { entity: divisionLabel })}
                  </Button>
                }
              />
            ) : showNoMatches ? (
              <EmptyState title={t('settings.divisions.noMatches')} />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.divisions.colName')}</th>
                      <th>{t('settings.divisions.colCode')}</th>
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
                      const isLast = idx === divisions.length - 1;
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
                  left={t('settings.divisions.rowsCount', {
                    count: filtered.length,
                    noun: divisionsLabel.toLowerCase(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <DivisionFormDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogItem(null);
        }}
        item={dialogItem ?? undefined}
        nextSortOrder={nextSortOrder}
        queryKey={QUERY_KEY}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('settings.divisions.deleteConfirm', {
          name: pendingDelete?.name ?? '',
        })}
        message={t('settings.divisions.deleteWarning')}
        confirmLabel={
          deleteMutation.isPending ? t('common.deleting') : t('common.delete')
        }
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
