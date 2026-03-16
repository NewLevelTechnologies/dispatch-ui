import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';
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
  equipmentApi,
  EquipmentStatus,
  type Equipment,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
} from '../api/equipmentApi';

interface Customer {
  id: string;
  name: string;
}

export default function EquipmentPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [formData, setFormData] = useState<CreateEquipmentRequest>({
    customerId: '',
    equipmentType: '',
    modelNumber: '',
    serialNumber: '',
    location: '',
    notes: '',
  });

  const { data: equipment = [], isLoading, error } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => equipmentApi.getAll(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
  });

  // Ensure all data is always an array
  const safeEquipment = Array.isArray(equipment) ? equipment : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const createMutation = useMutation({
    mutationFn: (request: CreateEquipmentRequest) => equipmentApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEquipmentRequest }) =>
      equipmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setIsDialogOpen(false);
      setSelectedEquipment(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedEquipment(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: Equipment) => {
    setSelectedEquipment(item);
    setFormData({
      customerId: item.customerId,
      equipmentType: item.equipmentType,
      modelNumber: item.modelNumber || '',
      serialNumber: item.serialNumber || '',
      location: item.location || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: Equipment) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.equipmentType }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEquipment) {
      updateMutation.mutate({ id: selectedEquipment.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      equipmentType: '',
      modelNumber: '',
      serialNumber: '',
      location: '',
      notes: '',
    });
  };

  const getStatusBadge = (status: EquipmentStatus) => {
    const colors: Record<EquipmentStatus, 'lime' | 'sky' | 'amber' | 'zinc'> = {
      ACTIVE: 'lime',
      INACTIVE: 'zinc',
      MAINTENANCE: 'amber',
      RETIRED: 'zinc',
    };
    return <Badge color={colors[status]}>{status}</Badge>;
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{t('entities.equipment')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('equipment.description')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('entities.equipment') })}
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20 mb-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('entities.equipment') })}: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.loading', { entities: t('entities.equipment') })}
            </p>
          </div>
        ) : safeEquipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <WrenchScrewdriverIcon className="h-12 w-12 text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.notFound', { entities: t('entities.equipment') })}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('equipment.table.equipmentType')}</TableHeader>
                <TableHeader>{t('equipment.table.customer')}</TableHeader>
                <TableHeader>{t('equipment.table.modelNumber')}</TableHeader>
                <TableHeader>{t('equipment.table.serialNumber')}</TableHeader>
                <TableHeader>{t('equipment.table.location')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {safeEquipment.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.equipmentType}</TableCell>
                  <TableCell>{item.customerName || item.customerId}</TableCell>
                  <TableCell>{item.modelNumber || '-'}</TableCell>
                  <TableCell>{item.serialNumber || '-'}</TableCell>
                  <TableCell>{item.location || '-'}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
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
          {selectedEquipment
            ? t('common.actions.edit', { entity: t('entities.equipment') })
            : t('common.actions.add', { entity: t('entities.equipment') })}
        </DialogTitle>
        <DialogDescription>
          {selectedEquipment
            ? t('common.form.descriptionEdit', { entity: t('entities.equipment') })
            : t('common.form.descriptionCreate', { entity: t('entities.equipment') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('equipment.form.customer')} *</Label>
                  <Select
                    name="customerId"
                    value={formData.customerId}
                    onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.form.select')}</option>
                    {safeCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{t('equipment.form.equipmentType')} *</Label>
                  <Input
                    name="equipmentType"
                    value={formData.equipmentType}
                    onChange={(e) => setFormData({ ...formData, equipmentType: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.modelNumber')}</Label>
                  <Input
                    name="modelNumber"
                    value={formData.modelNumber}
                    onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.serialNumber')}</Label>
                  <Input
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.location')}</Label>
                  <Input
                    name="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
            <Button type="submit">
              {selectedEquipment ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
