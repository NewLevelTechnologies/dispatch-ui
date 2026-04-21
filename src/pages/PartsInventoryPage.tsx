import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { PageHeader, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import {
  partsInventoryApi,
  warehousesApi,
  type PartsInventory,
  type CreatePartsInventoryRequest,
  type UpdatePartsInventoryRequest,
} from '../api/equipmentApi';

export default function PartsInventoryPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartsInventory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<CreatePartsInventoryRequest>({
    warehouseId: '',
    partNumber: '',
    partName: '',
    quantityOnHand: 0,
    reorderPoint: 0,
    reorderQuantity: 1,
  });

  const { data: partsInventory = [], isLoading, error } = useQuery({
    queryKey: ['parts-inventory'],
    queryFn: () => partsInventoryApi.getAll(),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.getAll(),
  });

  const safePartsInventory = useMemo(() => Array.isArray(partsInventory) ? partsInventory : [], [partsInventory]);
  const safeWarehouses = useMemo(() => Array.isArray(warehouses) ? warehouses : [], [warehouses]);

  const formatCurrency = (amount?: number) => {
    if (amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const filteredParts = useMemo(() => {
    if (safePartsInventory.length === 0) return [];
    if (!searchQuery.trim()) return safePartsInventory;

    const query = searchQuery.toLowerCase();
    return safePartsInventory.filter(
      (part) =>
        part.partNumber.toLowerCase().includes(query) ||
        part.partName.toLowerCase().includes(query) ||
        part.warehouseId.toLowerCase().includes(query) ||
        part.warehouseName?.toLowerCase().includes(query)
    );
  }, [safePartsInventory, searchQuery]);

  const createMutation = useMutation({
    mutationFn: (request: CreatePartsInventoryRequest) => partsInventoryApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts-inventory'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePartsInventoryRequest }) =>
      partsInventoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts-inventory'] });
      setIsDialogOpen(false);
      setSelectedPart(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => partsInventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts-inventory'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedPart(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: PartsInventory) => {
    setSelectedPart(item);
    setFormData({
      warehouseId: item.warehouseId,
      partNumber: item.partNumber,
      partName: item.partName,
      quantityOnHand: item.quantityOnHand,
      reorderPoint: item.reorderPoint,
      reorderQuantity: item.reorderQuantity,
      unitCost: item.unitCost,
      locationBin: item.locationBin || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: PartsInventory) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.partName }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPart) {
      updateMutation.mutate({ id: selectedPart.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      warehouseId: '',
      partNumber: '',
      partName: '',
      quantityOnHand: 0,
      reorderPoint: 0,
      reorderQuantity: 1,
    });
  };

  const columns: DataTableColumn<PartsInventory>[] = [
    {
      key: 'partNumber',
      header: t('equipment.table.partNumber'),
      cellClassName: 'font-medium',
      cell: (item) => item.partNumber,
    },
    {
      key: 'partName',
      header: t('equipment.table.partName'),
      cell: (item) => item.partName,
    },
    {
      key: 'warehouse',
      header: t('equipment.table.warehouse'),
      cell: (item) => item.warehouseName || item.warehouseId,
    },
    {
      key: 'quantity',
      header: t('equipment.table.quantity'),
      cell: (item) => (
        <>
          {item.quantityOnHand}
          {item.needsReorder && (
            <Badge color="rose" className="ml-2">{t('equipment.lowStock')}</Badge>
          )}
        </>
      ),
    },
    {
      key: 'reorderPoint',
      header: t('equipment.table.reorderPoint'),
      cell: (item) => item.reorderPoint,
    },
    {
      key: 'unitCost',
      header: t('equipment.table.unitCost'),
      cell: (item) => formatCurrency(item.unitCost),
    },
    {
      key: 'actions',
      header: '',
      cell: (item) => (
        <div className="-mx-3 -my-1.5 sm:-mx-2.5">
          <Dropdown>
            <DropdownButton plain aria-label={t('common.moreOptions')}>
              <EllipsisVerticalIcon className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={() => handleEdit(item)}>
                <DropdownLabel>{t('common.edit')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={() => handleDelete(item)}>
                <DropdownLabel>{t('common.delete')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={t('equipment.entities.parts')}
        actions={
          <Button color="accent" onClick={handleAdd}>
            {t('common.actions.add', { entity: t('equipment.entities.part') })}
          </Button>
        }
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('common.search')}
        rowCount={
          safePartsInventory.length > 0
            ? filteredParts.length === safePartsInventory.length
              ? `${safePartsInventory.length} ${safePartsInventory.length === 1 ? t('equipment.entities.part').toLowerCase() : t('equipment.entities.parts').toLowerCase()}`
              : `${filteredParts.length} of ${safePartsInventory.length}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('equipment.entities.parts') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {safePartsInventory.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: t('equipment.entities.parts') })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredParts}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          emptyState={t('common.actions.noMatchSearch', { entities: t('equipment.entities.parts') })}
        />
      )}

      <Dialog open={isDialogOpen} onClose={setIsDialogOpen}>
        <DialogTitle>
          {selectedPart
            ? t('common.actions.edit', { entity: t('equipment.entities.part') })
            : t('common.actions.add', { entity: t('equipment.entities.part') })}
        </DialogTitle>
        <DialogDescription>
          {selectedPart
            ? t('common.form.descriptionEdit', { entity: t('equipment.entities.part') })
            : t('common.form.descriptionCreate', { entity: t('equipment.entities.part') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('equipment.form.warehouse')} *</Label>
                  <Select
                    name="warehouseId"
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.form.select')}</option>
                    {safeWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label>{t('equipment.form.partNumber')} *</Label>
                    <Input
                      name="partNumber"
                      value={formData.partNumber}
                      onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('equipment.form.partName')} *</Label>
                    <Input
                      name="partName"
                      value={formData.partName}
                      onChange={(e) => setFormData({ ...formData, partName: e.target.value })}
                      required
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Field>
                    <Label>{t('equipment.form.quantityOnHand')}</Label>
                    <Input
                      type="number"
                      name="quantityOnHand"
                      value={formData.quantityOnHand}
                      onChange={(e) =>
                        setFormData({ ...formData, quantityOnHand: parseInt(e.target.value) })
                      }
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('equipment.form.reorderPoint')}</Label>
                    <Input
                      type="number"
                      name="reorderPoint"
                      value={formData.reorderPoint}
                      onChange={(e) =>
                        setFormData({ ...formData, reorderPoint: parseInt(e.target.value) })
                      }
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('equipment.form.reorderQuantity')}</Label>
                    <Input
                      type="number"
                      name="reorderQuantity"
                      value={formData.reorderQuantity}
                      onChange={(e) =>
                        setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) })
                      }
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('equipment.form.unitCost')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="unitCost"
                    value={formData.unitCost}
                    onChange={(e) =>
                      setFormData({ ...formData, unitCost: parseFloat(e.target.value) })
                    }
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.locationBin')}</Label>
                  <Input
                    name="locationBin"
                    value={formData.locationBin}
                    onChange={(e) => setFormData({ ...formData, locationBin: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{selectedPart ? t('common.update') : t('common.create')}</Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
