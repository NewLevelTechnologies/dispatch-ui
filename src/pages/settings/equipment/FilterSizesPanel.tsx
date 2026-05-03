import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  tenantFilterSizesApi,
  getApiErrorMessage,
  type TenantFilterSize,
} from '../../../api';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Heading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Button } from '../../../components/catalyst/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/catalyst/table';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../../../components/catalyst/fieldset';
import { Input } from '../../../components/catalyst/input';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/16/solid';

const QUERY_KEY = ['tenant-filter-sizes'] as const;

function formatInches(n: number): string {
  return String(n);
}
function formatSize(s: TenantFilterSize): string {
  return `${formatInches(s.lengthIn)} × ${formatInches(s.widthIn)} × ${formatInches(s.thicknessIn)}`;
}

export default function FilterSizesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<TenantFilterSize | null>(null);

  const { data: items, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => tenantFilterSizesApi.getAll(),
  });
  const active = (items ?? []).filter((s) => !s.archivedAt);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantFilterSizesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.filterSizes.errorDelete'));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => tenantFilterSizesApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.filterSizes.errorReorder'));
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const sorted = [...active].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.lengthIn - b.lengthIn ||
      a.widthIn - b.widthIn ||
      a.thicknessIn - b.thicknessIn
  );
  const nextSortOrder =
    sorted.length > 0 ? Math.max(...sorted.map((i) => i.sortOrder)) + 1 : 0;

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

  const handleAdd = () => {
    setSelected(null);
    setIsDialogOpen(true);
  };
  const handleEdit = (item: TenantFilterSize) => {
    setSelected(item);
    setIsDialogOpen(true);
  };
  const handleDelete = (item: TenantFilterSize) => {
    if (window.confirm(t('settings.taxonomy.deleteConfirm', { name: formatSize(item) }))) {
      deleteMutation.mutate(item.id);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <Heading>{t('settings.filterSizes.title')}</Heading>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings.filterSizes.description')}
          </Text>
        </div>
        {canEdit && <Button onClick={handleAdd}>{t('settings.filterSizes.add')}</Button>}
      </div>

      {isLoading && <Text>{t('settings.filterSizes.loading')}</Text>}
      {error && (
        <Text className="text-red-600">
          {getApiErrorMessage(error) || t('settings.filterSizes.errorLoad')}
        </Text>
      )}
      {items && active.length === 0 && <Text>{t('settings.filterSizes.empty')}</Text>}

      {sorted.length > 0 && (
        <Table dense className="[--gutter:theme(spacing.1)] text-sm">
          <TableHead>
            <TableRow>
              <TableHeader>{t('settings.filterSizes.size')}</TableHeader>
              <TableHeader className="w-24"></TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono">{formatSize(item)}</TableCell>
                <TableCell>
                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveUp(index)}
                        disabled={index === 0 || reorderMutation.isPending}
                        title={t('common.moveUp')}
                        aria-label={t('common.moveUp')}
                        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <ChevronUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(index)}
                        disabled={index === sorted.length - 1 || reorderMutation.isPending}
                        title={t('common.moveDown')}
                        aria-label={t('common.moveDown')}
                        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <ChevronDownIcon className="h-4 w-4" />
                      </button>
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
      )}

      <FilterSizeFormDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelected(null);
        }}
        item={selected}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}

interface FormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: TenantFilterSize | null;
  nextSortOrder: number;
}

function FilterSizeFormDialog({ isOpen, onClose, item, nextSortOrder }: FormDialogProps) {
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
      queryClient.invalidateQueries({ queryKey: ['tenant-filter-sizes'] });
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.filterSizes.errorSave'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      tenantFilterSizesApi.update(item!.id, {
        lengthIn: Number(length),
        widthIn: Number(width),
        thicknessIn: Number(thickness),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-filter-sizes'] });
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.filterSizes.errorSave'));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
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
        {isEdit ? t('settings.filterSizes.titleEdit') : t('settings.filterSizes.titleAdd')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
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
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
