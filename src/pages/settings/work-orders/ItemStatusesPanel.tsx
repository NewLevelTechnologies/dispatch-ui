import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workItemStatusesApi, getApiErrorMessage, type WorkItemStatus, type StatusCategory } from '../../../api';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Heading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Button } from '../../../components/catalyst/button';
import { Badge } from '../../../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/catalyst/table';
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '../../../components/catalyst/dropdown';
import { ChevronUpIcon, ChevronDownIcon, EllipsisVerticalIcon } from '@heroicons/react/16/solid';
import ItemStatusFormDialog, { CATEGORY_LABELS } from '../../../components/settings/ItemStatusFormDialog';

const QUERY_KEY = ['work-item-statuses'];

const CATEGORY_COLORS: Record<StatusCategory, 'zinc' | 'blue' | 'lime' | 'amber' | 'rose'> = {
  NOT_STARTED: 'zinc',
  IN_PROGRESS: 'blue',
  COMPLETED: 'lime',
  BLOCKED: 'amber',
  CANCELLED: 'rose',
};

export default function ItemStatusesPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [selectedStatus, setSelectedStatus] = useState<WorkItemStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: statuses, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => workItemStatusesApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workItemStatusesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || 'Failed to delete status');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => workItemStatusesApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || 'Failed to reorder status');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const handleAdd = () => {
    setSelectedStatus(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (status: WorkItemStatus) => {
    setSelectedStatus(status);
    setIsDialogOpen(true);
  };

  const handleDelete = (status: WorkItemStatus) => {
    if (window.confirm(t('settings.taxonomy.deleteConfirm', { name: status.name }))) {
      deleteMutation.mutate(status.id);
    }
  };

  const sorted = statuses
    ? [...statuses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    : [];

  const nextSortOrder = sorted.length > 0
    ? Math.max(...sorted.map((s) => s.sortOrder)) + 1
    : 0;

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...sorted];
    [reordered[index], reordered[index - 1]] = [reordered[index - 1], reordered[index]];
    reorderMutation.mutate(reordered.map((s) => s.id));
  };

  const moveDown = (index: number) => {
    if (index >= sorted.length - 1) return;
    const reordered = [...sorted];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    reorderMutation.mutate(reordered.map((s) => s.id));
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <Heading>{t('settings.nav.itemStatuses')}</Heading>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            {t('settings.itemStatuses.description')}
          </Text>
        </div>
        {canEdit && (
          <Button onClick={handleAdd}>
            {t('common.actions.add', { entity: t('settings.nav.itemStatuses').replace(/es$/, '') })}
          </Button>
        )}
      </div>

      {isLoading && <Text>{t('common.actions.loading', { entities: t('settings.nav.itemStatuses') })}</Text>}
      {error && (
        <Text className="text-red-600">
          {getApiErrorMessage(error) || t('common.actions.errorLoading', { entities: t('settings.nav.itemStatuses') })}
        </Text>
      )}
      {statuses && statuses.length === 0 && (
        <Text>{t('common.actions.notFound', { entities: t('settings.nav.itemStatuses') })}</Text>
      )}

      {sorted.length > 0 && (
        <div>
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.code')}</TableHeader>
                <TableHeader>{t('settings.itemStatuses.table.category')}</TableHeader>
                <TableHeader>{t('settings.itemStatuses.table.terminal')}</TableHeader>
                <TableHeader className="w-24"></TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((status, index) => (
                <TableRow key={status.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-zinc-200 dark:border-zinc-700 shrink-0"
                        style={{ backgroundColor: status.color || 'transparent' }}
                      />
                      <span>{status.name}</span>
                    </div>
                    {status.description && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5 ml-5">
                        {status.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500 font-mono text-xs">{status.code}</TableCell>
                  <TableCell>
                    <Badge color={CATEGORY_COLORS[status.statusCategory]}>
                      {CATEGORY_LABELS[status.statusCategory]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {status.isTerminal ? t('common.enabled') : '—'}
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          plain
                          onClick={() => moveUp(index)}
                          disabled={index === 0 || reorderMutation.isPending}
                          title={t('common.moveUp')}
                          aria-label={t('common.moveUp')}
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          plain
                          onClick={() => moveDown(index)}
                          disabled={index === sorted.length - 1 || reorderMutation.isPending}
                          title={t('common.moveDown')}
                          aria-label={t('common.moveDown')}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5 flex items-center justify-end">
                      {canEdit && (
                        <Dropdown>
                          <DropdownButton plain aria-label={t('common.moreOptions')}>
                            <EllipsisVerticalIcon />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => handleEdit(status)}>
                              {t('common.edit')}
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDelete(status)}>
                              {t('common.delete')}
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-2 text-sm">
            <Text>
              {t('common.show')} {sorted.length} {t('settings.nav.itemStatuses').toLowerCase()}
            </Text>
          </div>
        </div>
      )}

      <ItemStatusFormDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setSelectedStatus(null); }}
        status={selectedStatus || undefined}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}
