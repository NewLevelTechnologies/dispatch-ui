import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '../../api';
import type {
  TaxonomyItem,
  CreateTaxonomyItemRequest,
  UpdateTaxonomyItemRequest,
} from '../../api';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Heading } from '../catalyst/heading';
import { Text } from '../catalyst/text';
import { Button } from '../catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../catalyst/table';
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '../catalyst/dropdown';
import { ChevronUpIcon, ChevronDownIcon, EllipsisVerticalIcon } from '@heroicons/react/16/solid';
import IconButton from '../IconButton';
import TaxonomyFormDialog from './TaxonomyFormDialog';

interface TaxonomyApi {
  getAll: () => Promise<TaxonomyItem[]>;
  create: (req: CreateTaxonomyItemRequest) => Promise<TaxonomyItem>;
  update: (id: string, req: UpdateTaxonomyItemRequest) => Promise<TaxonomyItem>;
  delete: (id: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<TaxonomyItem[]>;
}

interface Props {
  title: string;
  description: string;
  entityLabel: string;
  entityLabelPlural: string;
  api: TaxonomyApi;
  queryKey: string[];
}

export default function TaxonomyManager({
  title,
  description,
  entityLabel,
  entityLabelPlural,
  api,
  queryKey,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [selectedItem, setSelectedItem] = useState<TaxonomyItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: items, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || `Failed to delete ${entityLabel.toLowerCase()}`);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(queryKey, updated),
    onError: (error: unknown) => {
      alert(getApiErrorMessage(error) || `Failed to reorder ${entityLabel.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleAdd = () => {
    setSelectedItem(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: TaxonomyItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleDelete = (item: TaxonomyItem) => {
    if (window.confirm(t('settings.taxonomy.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const sorted = items
    ? [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    : [];

  const nextSortOrder = sorted.length > 0
    ? Math.max(...sorted.map((i) => i.sortOrder)) + 1
    : 0;

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...sorted];
    [reordered[index], reordered[index - 1]] = [reordered[index - 1], reordered[index]];
    reorderMutation.mutate(reordered.map((i) => i.id));
  };

  const moveDown = (index: number) => {
    if (index >= sorted.length - 1) return;
    const reordered = [...sorted];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    reorderMutation.mutate(reordered.map((i) => i.id));
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <Heading>{title}</Heading>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{description}</Text>
        </div>
        {canEdit && (
          <Button onClick={handleAdd}>
            {t('common.actions.add', { entity: entityLabel })}
          </Button>
        )}
      </div>

      {isLoading && <Text>{t('common.actions.loading', { entities: entityLabelPlural })}</Text>}
      {error && (
        <Text className="text-red-600">
          {getApiErrorMessage(error) || t('common.actions.errorLoading', { entities: entityLabelPlural })}
        </Text>
      )}
      {items && items.length === 0 && (
        <Text>{t('common.actions.notFound', { entities: entityLabelPlural })}</Text>
      )}

      {sorted.length > 0 && (
        <div>
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.code')}</TableHeader>
                <TableHeader className="w-24"></TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-zinc-200 dark:border-zinc-700 shrink-0"
                        style={{ backgroundColor: item.color || 'transparent' }}
                      />
                      <span>{item.name}</span>
                    </div>
                    {item.description && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5 ml-5">
                        {item.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500 font-mono text-xs">{item.code}</TableCell>
                  <TableCell>
                    {canEdit && (
                      <div className="flex items-center gap-0.5">
                        <IconButton
                          onClick={() => moveUp(index)}
                          disabled={index === 0 || reorderMutation.isPending}
                          title={t('common.moveUp')}
                          aria-label={t('common.moveUp')}
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => moveDown(index)}
                          disabled={index === sorted.length - 1 || reorderMutation.isPending}
                          title={t('common.moveDown')}
                          aria-label={t('common.moveDown')}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </IconButton>
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
                            <DropdownItem onClick={() => handleEdit(item)}>
                              {t('common.edit')}
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDelete(item)}>
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
              {t('common.show')} {sorted.length} {entityLabelPlural.toLowerCase()}
            </Text>
          </div>
        </div>
      )}

      <TaxonomyFormDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setSelectedItem(null); }}
        entityLabel={entityLabel}
        api={api}
        queryKey={queryKey}
        item={selectedItem || undefined}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}
