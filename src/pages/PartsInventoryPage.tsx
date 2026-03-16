import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
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

  // Ensure all data is always an array
  const safePartsInventory = Array.isArray(partsInventory) ? partsInventory : [];
  const safeWarehouses = Array.isArray(warehouses) ? warehouses : [];

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

  const formatCurrency = (amount?: number) => {
    if (amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{t('equipment.entities.parts')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Manage parts inventory across warehouses
          </p>
        </div>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('equipment.entities.part') })}
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20 mb-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('equipment.entities.parts') })}: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.loading', { entities: t('equipment.entities.parts') })}
            </p>
          </div>
        ) : safePartsInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <WrenchScrewdriverIcon className="h-12 w-12 text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.notFound', { entities: t('equipment.entities.parts') })}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('equipment.table.partNumber')}</TableHeader>
                <TableHeader>{t('equipment.table.partName')}</TableHeader>
                <TableHeader>{t('equipment.table.warehouse')}</TableHeader>
                <TableHeader>{t('equipment.table.quantity')}</TableHeader>
                <TableHeader>{t('equipment.table.reorderPoint')}</TableHeader>
                <TableHeader>{t('equipment.table.unitCost')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {safePartsInventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.partNumber}</TableCell>
                  <TableCell>{item.partName}</TableCell>
                  <TableCell>{item.warehouseName || item.warehouseId}</TableCell>
                  <TableCell>
                    {item.quantityOnHand}
                    {item.needsReorder && (
                      <Badge color="rose" className="ml-2">Low Stock</Badge>
                    )}
                  </TableCell>
                  <TableCell>{item.reorderPoint}</TableCell>
                  <TableCell>{formatCurrency(item.unitCost)}</TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog */}
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
