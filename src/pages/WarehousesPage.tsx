import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input, InputGroup } from '../components/catalyst/input';
import {
  warehousesApi,
  WarehouseStatus,
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

  // Ensure warehouses is always an array
  const safeWarehouses = useMemo(() => Array.isArray(warehouses) ? warehouses : [], [warehouses]);

  // Filter warehouses based on search query
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

  const getStatusBadge = (status: WarehouseStatus) => {
    const colors: Record<WarehouseStatus, 'lime' | 'zinc'> = {
      ACTIVE: 'lime',
      INACTIVE: 'zinc',
    };
    return <Badge color={colors[status]}>{status}</Badge>;
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{t('equipment.entities.warehouses')}</Heading>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('equipment.entities.warehouse') })}
        </Button>
      </div>

      {/* Quick Search Bar */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
        {safeWarehouses.length > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredWarehouses.length === safeWarehouses.length
              ? `${safeWarehouses.length} ${safeWarehouses.length === 1 ? t('equipment.entities.warehouse').toLowerCase() : t('equipment.entities.warehouses').toLowerCase()}`
              : `${filteredWarehouses.length} of ${safeWarehouses.length}`}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('equipment.entities.warehouses') })}: {(error as Error).message}
            </p>
          </div>
        )}

      {isLoading ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: t('equipment.entities.warehouses') })}
          </p>
        </div>
      ) : safeWarehouses.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: t('equipment.entities.warehouses') })}
          </p>
        </div>
      ) : filteredWarehouses.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.noMatchSearch', { entities: t('equipment.entities.warehouses') })}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('equipment.table.location')}</TableHeader>
                <TableHeader>{t('equipment.table.manager')}</TableHeader>
                <TableHeader>{t('common.form.phone')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWarehouses.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    {item.city && item.state ? `${item.city}, ${item.state}` : '-'}
                  </TableCell>
                  <TableCell>{item.managerName || '-'}</TableCell>
                  <TableCell>{item.phone || '-'}</TableCell>
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
        </div>
      )}

      {/* Dialog */}
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
