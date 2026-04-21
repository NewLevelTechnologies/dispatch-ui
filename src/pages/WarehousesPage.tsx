import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import {
  warehousesApi,
  type Warehouse,
  type CreateWarehouseRequest,
  type UpdateWarehouseRequest,
} from '../api/equipmentApi';

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<CreateWarehouseRequest>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    managerName: '',
    phone: '',
  });

  const { data: warehouses = [], isLoading, error } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.getAll(),
  });

  const safeWarehouses = useMemo(() => Array.isArray(warehouses) ? warehouses : [], [warehouses]);

  const filteredWarehouses = useMemo(() => {
    if (safeWarehouses.length === 0) return [];
    if (!searchQuery.trim()) return safeWarehouses;

    const query = searchQuery.toLowerCase();
    return safeWarehouses.filter(
      (warehouse) =>
        warehouse.name.toLowerCase().includes(query) ||
        warehouse.address?.toLowerCase().includes(query) ||
        warehouse.city?.toLowerCase().includes(query) ||
        warehouse.state?.toLowerCase().includes(query) ||
        warehouse.managerName?.toLowerCase().includes(query)
    );
  }, [safeWarehouses, searchQuery]);

  const createMutation = useMutation({
    mutationFn: (request: CreateWarehouseRequest) => warehousesApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWarehouseRequest }) =>
      warehousesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setIsDialogOpen(false);
      setSelectedWarehouse(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehousesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedWarehouse(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: Warehouse) => {
    setSelectedWarehouse(item);
    setFormData({
      name: item.name,
      address: item.address || '',
      city: item.city || '',
      state: item.state || '',
      zipCode: item.zipCode || '',
      managerName: item.managerName || '',
      phone: item.phone || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: Warehouse) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWarehouse) {
      updateMutation.mutate({ id: selectedWarehouse.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      managerName: '',
      phone: '',
    });
  };

  const columns: DataTableColumn<Warehouse>[] = [
    {
      key: 'name',
      header: t('common.form.name'),
      cellClassName: 'font-medium',
      cell: (item) => item.name,
    },
    {
      key: 'location',
      header: t('equipment.table.location'),
      cell: (item) => (item.city && item.state ? `${item.city}, ${item.state}` : '-'),
    },
    {
      key: 'manager',
      header: t('equipment.table.manager'),
      cell: (item) => item.managerName || '-',
    },
    {
      key: 'phone',
      header: t('common.form.phone'),
      cell: (item) => item.phone || '-',
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
        title={t('equipment.entities.warehouses')}
        actions={
          <Button color="accent" onClick={handleAdd}>
            {t('common.actions.add', { entity: t('equipment.entities.warehouse') })}
          </Button>
        }
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('common.search')}
        rowCount={
          safeWarehouses.length > 0
            ? filteredWarehouses.length === safeWarehouses.length
              ? `${safeWarehouses.length} ${safeWarehouses.length === 1 ? t('equipment.entities.warehouse').toLowerCase() : t('equipment.entities.warehouses').toLowerCase()}`
              : `${filteredWarehouses.length} of ${safeWarehouses.length}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('equipment.entities.warehouses') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {safeWarehouses.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: t('equipment.entities.warehouses') })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredWarehouses}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          emptyState={t('common.actions.noMatchSearch', { entities: t('equipment.entities.warehouses') })}
        />
      )}

      <Dialog open={isDialogOpen} onClose={setIsDialogOpen}>
        <DialogTitle>
          {selectedWarehouse
            ? t('common.actions.edit', { entity: t('equipment.entities.warehouse') })
            : t('common.actions.add', { entity: t('equipment.entities.warehouse') })}
        </DialogTitle>
        <DialogDescription>
          {selectedWarehouse
            ? t('common.form.descriptionEdit', { entity: t('equipment.entities.warehouse') })
            : t('common.form.descriptionCreate', { entity: t('equipment.entities.warehouse') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('common.form.name')} *</Label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.address')}</Label>
                  <Input
                    name="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label>{t('common.form.city')}</Label>
                    <Input
                      name="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.state')}</Label>
                    <Input
                      name="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('common.form.zipCode')}</Label>
                  <Input
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.manager')}</Label>
                  <Input
                    name="managerName"
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.phone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    name="phone"
                    value={formData.phone}
                    onValueChange={(values) => setFormData({ ...formData, phone: values.formattedValue })}
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
              {selectedWarehouse ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
