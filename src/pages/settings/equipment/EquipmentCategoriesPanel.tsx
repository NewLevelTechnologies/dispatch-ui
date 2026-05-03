import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentTypesApi,
  equipmentCategoriesApi,
  getApiErrorMessage,
  type EquipmentCategory,
} from '../../../api';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Heading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Button } from '../../../components/catalyst/button';
import { Select } from '../../../components/catalyst/select';
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
import IconButton from '../../../components/IconButton';
import { Field, FieldGroup, Fieldset, Label } from '../../../components/catalyst/fieldset';
import { Input } from '../../../components/catalyst/input';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/16/solid';

const TYPES_KEY = ['equipment-types'] as const;
const categoriesKey = (typeId: string) => ['equipment-categories', typeId] as const;

export default function EquipmentCategoriesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [typeId, setTypeId] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<EquipmentCategory | null>(null);

  const { data: types } = useQuery({
    queryKey: TYPES_KEY,
    queryFn: () => equipmentTypesApi.getAll(),
  });

  // Default the type selector to the first type once types load.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!typeId && types && types.length > 0) {
      setTypeId(types[0].id);
    }
  }, [types, typeId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: categories, isLoading, error } = useQuery({
    queryKey: categoriesKey(typeId),
    queryFn: () => equipmentCategoriesApi.getAll(typeId),
    enabled: Boolean(typeId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentCategoriesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey(typeId) }),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.equipmentCategories.errorDelete'));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => equipmentCategoriesApi.reorder(typeId, orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(categoriesKey(typeId), updated),
    onError: (err: unknown) => {
      alert(getApiErrorMessage(err) || t('settings.equipmentCategories.errorReorder'));
      queryClient.invalidateQueries({ queryKey: categoriesKey(typeId) });
    },
  });

  const sorted = categories
    ? [...categories].sort(
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
  const handleEdit = (item: EquipmentCategory) => {
    setSelected(item);
    setIsDialogOpen(true);
  };
  const handleDelete = (item: EquipmentCategory) => {
    if (window.confirm(t('settings.taxonomy.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const noTypes = types && types.length === 0;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Heading>{t('settings.equipmentCategories.title')}</Heading>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings.equipmentCategories.description')}
          </Text>
        </div>
        {canEdit && !noTypes && (
          <Button onClick={handleAdd} disabled={!typeId}>
            {t('settings.equipmentCategories.add')}
          </Button>
        )}
      </div>

      {noTypes ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {t('settings.equipmentCategories.noTypesYet')}
          </Text>
        </div>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <Field>
              <Label className="text-xs">
                {t('settings.equipmentCategories.parentType')}
              </Label>
              <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {(types ?? []).map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {isLoading && <Text>{t('settings.equipmentCategories.loading')}</Text>}
          {error && (
            <Text className="text-red-600">
              {getApiErrorMessage(error) || t('settings.equipmentCategories.errorLoad')}
            </Text>
          )}
          {categories && categories.length === 0 && (
            <Text>{t('settings.equipmentCategories.empty')}</Text>
          )}

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
                            disabled={
                              index === sorted.length - 1 || reorderMutation.isPending
                            }
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
          )}
        </>
      )}

      <EquipmentCategoryFormDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelected(null);
        }}
        equipmentTypeId={typeId}
        item={selected}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}

interface FormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentTypeId: string;
  item: EquipmentCategory | null;
  nextSortOrder: number;
}

function EquipmentCategoryFormDialog({
  isOpen,
  onClose,
  equipmentTypeId,
  item,
  nextSortOrder,
}: FormDialogProps) {
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['equipment-categories', equipmentTypeId] });

  const createMutation = useMutation({
    mutationFn: () =>
      equipmentCategoriesApi.create({
        equipmentTypeId,
        name: name.trim(),
        sortOrder: nextSortOrder,
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.equipmentCategories.errorSave'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => equipmentCategoriesApi.update(item!.id, { name: name.trim() }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMessage(getApiErrorMessage(err) || t('settings.equipmentCategories.errorSave'));
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
        {isEdit
          ? t('settings.equipmentCategories.titleEdit')
          : t('settings.equipmentCategories.titleAdd')}
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
