import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
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
    return <Pill tone={status === 'ACTIVE' ? 'success' : 'neutral'}>{status}</Pill>;
  };

  const warehouseCount = safeWarehouses.length;
  const subtitle = warehouseCount > 0
    ? (filteredWarehouses.length === warehouseCount
        ? `${warehouseCount.toLocaleString()} ${warehouseCount === 1 ? t('equipment.entities.warehouse').toLowerCase() : t('equipment.entities.warehouses').toLowerCase()}`
        : `${filteredWarehouses.length} of ${warehouseCount}`)
    : null;

  return (
    <AppLayout>
      <div>
        <PageHead
          title={t('equipment.entities.warehouses')}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={handleAdd}>
              {t('common.actions.add', { entity: t('equipment.entities.warehouse') })}
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
                {t('common.actions.errorLoading', { entities: t('equipment.entities.warehouses') })}: {(error as Error).message}
              </p>
            </CardBody>
          </Card>
        )}

        {isLoading ? (
          <Card>
            <CardBody>
              <p className="text-center text-[12.5px] text-fg-muted">
                {t('common.actions.loading', { entities: t('equipment.entities.warehouses') })}
              </p>
            </CardBody>
          </Card>
        ) : safeWarehouses.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.notFound', { entities: t('equipment.entities.warehouses') })}
              </p>
            </CardBody>
          </Card>
        ) : filteredWarehouses.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.noMatchSearch', { entities: t('equipment.entities.warehouses') })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('common.form.name')}</th>
                    <th>{t('equipment.table.location')}</th>
                    <th>{t('equipment.table.manager')}</th>
                    <th>{t('common.form.phone')}</th>
                    <th>{t('common.form.status')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {filteredWarehouses.map((item) => (
                    <DenseRow key={item.id}>
                      <td className="strong">{item.name}</td>
                      <td
                        className={clsx(!(item.city && item.state) && 'dt-empty')}
                        data-label={t('equipment.table.location')}
                      >
                        {item.city && item.state ? `${titleCaseAddress(item.city)}, ${item.state}` : '-'}
                      </td>
                      <td className={clsx(!item.managerName && 'dt-empty')} data-label={t('equipment.table.manager')}>{item.managerName || '-'}</td>
                      <td className={clsx(!item.phone && 'dt-empty')} data-label={t('common.form.phone')}>{item.phone || '-'}</td>
                      <td>{getStatusBadge(item.status)}</td>
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
