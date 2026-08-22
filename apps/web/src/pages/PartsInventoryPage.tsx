import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill } from '../components/ui/Pill';
import {
  DenseTable, DenseTHead, DenseRow,
} from '../components/ui/DenseTable';
import { dense } from '../components/ui/dense';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input, InputGroup } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import {
  partsInventoryApi,
  warehousesApi,
  type PartsInventory,
  type CreatePartsInventoryRequest,
  type UpdatePartsInventoryRequest,
} from '../api/setup';

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

  // Ensure all data is always an array
  const safePartsInventory = useMemo(() => Array.isArray(partsInventory) ? partsInventory : [], [partsInventory]);
  const safeWarehouses = useMemo(() => Array.isArray(warehouses) ? warehouses : [], [warehouses]);

  const formatCurrency = (amount?: number) => {
    if (amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // Filter parts based on search query
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

  const partCount = safePartsInventory.length;
  const subtitle = partCount > 0
    ? (filteredParts.length === partCount
        ? `${partCount.toLocaleString()} ${partCount === 1 ? t('equipment.entities.part').toLowerCase() : t('equipment.entities.parts').toLowerCase()}`
        : `${filteredParts.length} of ${partCount}`)
    : null;

  return (
    <AppLayout>
      <div>
        <PageHead
          title={t('equipment.entities.parts')}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={handleAdd}>
              {t('common.actions.add', { entity: t('equipment.entities.part') })}
            </Button>
          }
        />

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <InputGroup className="min-w-[260px] flex-1">
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              type="text"
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={dense.input}
            />
          </InputGroup>
        </div>

        {error && (
          <Card className="border-danger-500/40 bg-danger-100/40">
            <CardBody>
              <p className="text-[12.5px] text-danger-500">
                {t('common.actions.errorLoading', { entities: t('equipment.entities.parts') })}: {(error as Error).message}
              </p>
            </CardBody>
          </Card>
        )}

        {isLoading ? (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: t('equipment.entities.parts') })} />
            </CardBody>
          </Card>
        ) : safePartsInventory.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.notFound', { entities: t('equipment.entities.parts') })}
              </p>
            </CardBody>
          </Card>
        ) : filteredParts.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.noMatchSearch', { entities: t('equipment.entities.parts') })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('equipment.table.partNumber')}</th>
                    <th>{t('equipment.table.partName')}</th>
                    <th>{t('equipment.table.warehouse')}</th>
                    <th className="right">{t('equipment.table.quantity')}</th>
                    <th className="right">{t('equipment.table.reorderPoint')}</th>
                    <th className="right">{t('equipment.table.unitCost')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {filteredParts.map((item) => (
                    <DenseRow key={item.id}>
                      <td><span className="id-mono text-fg-muted">{item.partNumber}</span></td>
                      <td className="strong" data-label={t('equipment.table.partName')}>{item.partName}</td>
                      <td data-label={t('equipment.table.warehouse')}>{item.warehouseName || item.warehouseId}</td>
                      <td className="right num" data-label={t('equipment.table.quantity')}>
                        <span className={item.needsReorder ? 'font-semibold text-danger-500' : 'strong'}>
                          {item.quantityOnHand}
                        </span>
                        {item.needsReorder && (
                          <Pill tone="danger" dot className="ml-2">{t('equipment.lowStock')}</Pill>
                        )}
                      </td>
                      <td className="right num" data-label={t('equipment.table.reorderPoint')}>{item.reorderPoint}</td>
                      <td className={clsx('right num strong', item.unitCost === undefined && 'dt-empty')} data-label={t('equipment.table.unitCost')}>{formatCurrency(item.unitCost)}</td>
                      <td>
                        <Dropdown>
                          <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                            <EllipsisVerticalIcon className="size-4" />
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
                      </td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
            </CardBody>
          </Card>
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
