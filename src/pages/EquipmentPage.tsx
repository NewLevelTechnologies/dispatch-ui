import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { customerApi } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import {
  equipmentApi,
  type Equipment,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
} from '../api/equipmentApi';

export default function EquipmentPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
      const response = await customerApi.getAllPaginated({ limit: 500 });
      return response.content;
    },
  });

  const safeEquipment = useMemo(() => Array.isArray(equipment) ? equipment : [], [equipment]);
  const safeCustomers = useMemo(() => Array.isArray(customers) ? customers : [], [customers]);

  const filteredEquipment = useMemo(() => {
    if (safeEquipment.length === 0) return [];
    if (!searchQuery.trim()) return safeEquipment;

    const query = searchQuery.toLowerCase();
    return safeEquipment.filter(
      (item) =>
        item.equipmentType.toLowerCase().includes(query) ||
        item.customerId.toLowerCase().includes(query) ||
        item.customerName?.toLowerCase().includes(query) ||
        item.modelNumber?.toLowerCase().includes(query) ||
        item.serialNumber?.toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
    );
  }, [safeEquipment, searchQuery]);

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

  const columns: DataTableColumn<Equipment>[] = [
    {
      key: 'equipmentType',
      header: t('equipment.table.equipmentType'),
      cellClassName: 'font-medium',
      cell: (item) => item.equipmentType,
    },
    {
      key: 'customer',
      header: t('equipment.table.customer'),
      cell: (item) => item.customerName || item.customerId,
    },
    {
      key: 'modelNumber',
      header: t('equipment.table.modelNumber'),
      cell: (item) => item.modelNumber || '-',
    },
    {
      key: 'serialNumber',
      header: t('equipment.table.serialNumber'),
      cell: (item) => item.serialNumber || '-',
    },
    {
      key: 'location',
      header: t('equipment.table.location'),
      cell: (item) => item.location || '-',
    },
    {
      key: 'status',
      header: t('common.form.status'),
      cell: (item) => <StatusBadge status={item.status} />,
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
        title={getName('equipment', true)}
        actions={
          <Button color="accent" onClick={handleAdd}>
            {t('common.actions.add', { entity: getName('equipment') })}
          </Button>
        }
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('common.search')}
        rowCount={
          safeEquipment.length > 0
            ? filteredEquipment.length === safeEquipment.length
              ? `${safeEquipment.length} ${safeEquipment.length === 1 ? getName('equipment').toLowerCase() : getName('equipment', true).toLowerCase()}`
              : `${filteredEquipment.length} of ${safeEquipment.length}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('equipment', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {safeEquipment.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('equipment', true) })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredEquipment}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('equipment', true) })}
        />
      )}

      <Dialog open={isDialogOpen} onClose={setIsDialogOpen}>
        <DialogTitle>
          {selectedEquipment
            ? t('common.actions.edit', { entity: getName('equipment') })
            : t('common.actions.add', { entity: getName('equipment') })}
        </DialogTitle>
        <DialogDescription>
          {selectedEquipment
            ? t('common.form.descriptionEdit', { entity: getName('equipment') })
            : t('common.form.descriptionCreate', { entity: getName('equipment') })}
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
