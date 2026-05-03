import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentTypesApi,
  getApiErrorMessage,
  type EquipmentType,
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

const QUERY_KEY = ['equipment-types'] as const;

export default function EquipmentTypesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<EquipmentType | null>(null);

  const { data: items, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => equipmentTypesApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentTypesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.equipmentTypes.errorDelete'));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => equipmentTypesApi.reorder(orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.equipmentTypes.errorReorder'));
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const sorted = items
    ? [...items].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      )
    : [];
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
  const handleEdit = (item: EquipmentType) => {
    setSelected(item);
    setIsDialogOpen(true);
  };
  const handleDelete = (item: EquipmentType) => {
    if (window.confirm(t('settings.taxonomy.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <Heading>{t('settings.equipmentTypes.title')}</Heading>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings.equipmentTypes.description')}
          </Text>
        </div>
        {canEdit && (
          <Button onClick={handleAdd}>{t('settings.equipmentTypes.add')}</Button>
        )}
      </div>

      {isLoading && <Text>{t('settings.equipmentTypes.loading')}</Text>}
      {error && (
        <Text className="text-red-600">
          {getApiErrorMessage(error) || t('settings.equipmentTypes.errorLoad')}
        </Text>
      )}
      {items && items.length === 0 && <Text>{t('settings.equipmentTypes.empty')}</Text>}

      {sorted.length > 0 && (
        <Table dense className="[--gutter:theme(spacing.1)] text-sm">
          <TableHead>
            <TableRow>
              <TableHeader>{t('common.form.name')}</TableHeader>
              <TableHeader className="w-24"></TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
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

      <EquipmentTypeFormDialog
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
  item: EquipmentType | null;
  nextSortOrder: number;
}

function EquipmentTypeFormDialog({ isOpen, onClose, item, nextSortOrder }: FormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(item);

  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setName(item?.name ?? '');
  }, [isOpen, item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = useMutation({
    mutationFn: () => equipmentTypesApi.create({ name: name.trim(), sortOrder: nextSortOrder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.equipmentTypes.errorSave'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => equipmentTypesApi.update(item!.id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.equipmentTypes.errorSave'));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage(t('common.form.required', { field: t('common.form.name') }));
      return;
    }
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>
        {isEdit ? t('settings.equipmentTypes.titleEdit') : t('settings.equipmentTypes.titleAdd')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
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
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
