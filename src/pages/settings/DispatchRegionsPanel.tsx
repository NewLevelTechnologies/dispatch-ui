import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dispatchRegionApi, getApiErrorMessage, type DispatchRegion } from '../../api';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useGlossary } from '../../contexts/GlossaryContext';
import DispatchRegionFormDialog from '../../components/DispatchRegionFormDialog';
import { Heading } from '../../components/catalyst/heading';
import IconButton from '../../components/IconButton';
import { Text } from '../../components/catalyst/text';
import { Button } from '../../components/catalyst/button';
import { Badge } from '../../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/catalyst/table';
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '../../components/catalyst/dropdown';
import { ChevronUpIcon, ChevronDownIcon, EllipsisVerticalIcon } from '@heroicons/react/16/solid';

export default function DispatchRegionsPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canView = useHasCapability('VIEW_SETTINGS');
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [selectedRegion, setSelectedRegion] = useState<DispatchRegion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: regions, isLoading, error } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
    enabled: canView,
  });

  const deleteRegionMutation = useMutation({
    mutationFn: (id: string) => dispatchRegionApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] }),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || 'Failed to delete dispatch region');
    },
  });

  const reactivateRegionMutation = useMutation({
    mutationFn: (id: string) => dispatchRegionApi.reactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] }),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || 'Failed to reactivate dispatch region');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => dispatchRegionApi.reorder(orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] }),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || 'Failed to reorder region');
      queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] });
    },
  });

  const handleAdd = () => {
    setSelectedRegion(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (region: DispatchRegion) => {
    setSelectedRegion(region);
    setIsDialogOpen(true);
  };

  const handleDelete = (region: DispatchRegion) => {
    if (window.confirm(t('dispatchRegions.actions.deactivateConfirm', { name: region.name }))) {
      deleteRegionMutation.mutate(region.id);
    }
  };

  const handleReactivate = (region: DispatchRegion) => {
    reactivateRegionMutation.mutate(region.id);
  };

  const sorted = regions
    ? [...regions].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    : [];

  const activeSorted = sorted.filter((r) => r.isActive);

  const nextSortOrder = sorted.length > 0
    ? Math.max(...sorted.map((r) => r.sortOrder)) + 1
    : 0;

  const moveUp = (region: DispatchRegion) => {
    const i = activeSorted.findIndex((r) => r.id === region.id);
    if (i <= 0) return;
    const reordered = [...activeSorted];
    [reordered[i], reordered[i - 1]] = [reordered[i - 1], reordered[i]];
    reorderMutation.mutate(reordered.map((r) => r.id));
  };

  const moveDown = (region: DispatchRegion) => {
    const i = activeSorted.findIndex((r) => r.id === region.id);
    if (i < 0 || i >= activeSorted.length - 1) return;
    const reordered = [...activeSorted];
    [reordered[i], reordered[i + 1]] = [reordered[i + 1], reordered[i]];
    reorderMutation.mutate(reordered.map((r) => r.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <Heading>{getName('dispatch')} {t('entities.regions')}</Heading>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('dispatchRegions.description', { dispatch: getName('dispatch') })}
          </Text>
        </div>
        {canEdit && (
          <Button onClick={handleAdd}>
            {t('common.actions.add', { entity: `${getName('dispatch')} ${t('entities.region')}` })}
          </Button>
        )}
      </div>

      {isLoading && <Text>{t('dispatchRegions.loading', { dispatch: getName('dispatch') })}</Text>}
      {error && (
        <Text className="text-red-600">
          {getApiErrorMessage(error) || t('common.actions.errorLoading', { entities: `${getName('dispatch')} ${t('entities.regions')}` })}
        </Text>
      )}
      {regions && regions.length === 0 && <Text>{t('dispatchRegions.empty', { dispatch: getName('dispatch') })}</Text>}

      {sorted.length > 0 && (
        <div>
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('dispatchRegions.table.name')}</TableHeader>
                <TableHeader>{t('dispatchRegions.table.abbreviation')}</TableHeader>
                <TableHeader>{t('dispatchRegions.table.state')}</TableHeader>
                <TableHeader className="w-24"></TableHeader>
                <TableHeader>{t('dispatchRegions.table.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((region) => {
                const activeIndex = region.isActive
                  ? activeSorted.findIndex((r) => r.id === region.id)
                  : -1;
                const canMoveUp = activeIndex > 0;
                const canMoveDown = activeIndex >= 0 && activeIndex < activeSorted.length - 1;
                return (
                <TableRow key={region.id}>
                  <TableCell className="font-medium">
                    {region.name}
                    {region.description && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">
                        {region.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">{region.abbreviation}</TableCell>
                  <TableCell className="text-zinc-500">{region.state || '-'}</TableCell>
                  <TableCell>
                    {canEdit && region.isActive && (
                      <div className="flex items-center gap-0.5">
                        <IconButton
                          onClick={() => moveUp(region)}
                          disabled={!canMoveUp || reorderMutation.isPending}
                          title={t('common.moveUp')}
                          aria-label={t('common.moveUp')}
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => moveDown(region)}
                          disabled={!canMoveDown || reorderMutation.isPending}
                          title={t('common.moveDown')}
                          aria-label={t('common.moveDown')}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </IconButton>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {region.isActive ? (
                      /* eslint-disable-next-line i18next/no-literal-string */
                      <Badge color="lime">Active</Badge>
                    ) : (
                      /* eslint-disable-next-line i18next/no-literal-string */
                      <Badge color="zinc">Inactive</Badge>
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
                            <DropdownItem onClick={() => handleEdit(region)}>
                              {t('common.edit')}
                            </DropdownItem>
                            {region.isActive ? (
                              <DropdownItem onClick={() => handleDelete(region)}>
                                {t('dispatchRegions.actions.deactivate')}
                              </DropdownItem>
                            ) : (
                              <DropdownItem onClick={() => handleReactivate(region)}>
                                {t('dispatchRegions.actions.reactivate')}
                              </DropdownItem>
                            )}
                          </DropdownMenu>
                        </Dropdown>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-2 flex items-center justify-between text-sm">
            <Text>
              {t('common.show')} {sorted.length} {getName('dispatch').toLowerCase()} {t('entities.regions').toLowerCase()} ({sorted.filter(r => r.isActive).length} {t('common.active').toLowerCase()})
            </Text>
          </div>
        </div>
      )}

      <DispatchRegionFormDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setSelectedRegion(null); }}
        region={selectedRegion || undefined}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}
