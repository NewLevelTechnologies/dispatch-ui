import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
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
  recurringOrdersApi,
  type RecurringOrder,
  type CreateRecurringOrderRequest,
  type UpdateRecurringOrderRequest,
} from '../api/schedulingApi';
import { equipmentApi } from '../api/equipmentApi';

interface Customer {
  id: string;
  name: string;
}

export default function RecurringOrdersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<RecurringOrder | null>(null);
  const [formData, setFormData] = useState<CreateRecurringOrderRequest>({
    customerId: '',
    equipmentId: '',
    frequency: 'MONTHLY',
    nextScheduledDate: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
  });

  const { data: recurringOrders = [], isLoading, error } = useQuery({
    queryKey: ['recurring-orders'],
    queryFn: () => recurringOrdersApi.getAll(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => equipmentApi.getAll(),
  });

  // Ensure all data is always an array
  const safeOrders = Array.isArray(recurringOrders) ? recurringOrders : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeEquipment = Array.isArray(equipment) ? equipment : [];

  const createMutation = useMutation({
    mutationFn: (request: CreateRecurringOrderRequest) => recurringOrdersApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecurringOrderRequest }) =>
      recurringOrdersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
      setIsDialogOpen(false);
      setSelectedOrder(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringOrdersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedOrder(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: RecurringOrder) => {
    setSelectedOrder(item);
    setFormData({
      customerId: item.customerId,
      equipmentId: item.equipmentId,
      frequency: item.frequency,
      nextScheduledDate: new Date(item.nextScheduledDate).toISOString().split('T')[0],
      description: item.description || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: RecurringOrder) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: `Order ${item.id.slice(0, 8)}` }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const request = {
      ...formData,
      nextScheduledDate: new Date(formData.nextScheduledDate).toISOString(),
      description: formData.description || undefined,
      notes: formData.notes || undefined,
    };
    if (selectedOrder) {
      updateMutation.mutate({ id: selectedOrder.id, data: request });
    } else {
      createMutation.mutate(request);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      equipmentId: '',
      frequency: 'MONTHLY',
      nextScheduledDate: new Date().toISOString().split('T')[0],
      description: '',
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, 'lime' | 'sky' | 'amber' | 'zinc'> = {
      ACTIVE: 'lime',
      INACTIVE: 'zinc',
      PAUSED: 'amber',
      COMPLETED: 'sky',
    };
    return <Badge color={colors[status] || 'zinc'}>{status}</Badge>;
  };

  const getFrequencyBadge = (frequency: string) => {
    const colors: Record<string, 'lime' | 'sky' | 'amber' | 'rose'> = {
      WEEKLY: 'rose',
      MONTHLY: 'amber',
      QUARTERLY: 'sky',
      ANNUALLY: 'lime',
    };
    return <Badge color={colors[frequency] || 'zinc'}>{frequency}</Badge>;
  };

  const getCustomerName = (customerId: string) => {
    const customer = safeCustomers.find(c => c.id === customerId);
    return customer?.name || customerId;
  };

  const getEquipmentType = (equipmentId: string) => {
    const eq = safeEquipment.find(e => e.id === equipmentId);
    return eq?.equipmentType || equipmentId;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{t('scheduling.entities.recurringOrders')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('scheduling.descriptionRecurringOrders')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('scheduling.entities.recurringOrder') })}
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20 mb-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('scheduling.entities.recurringOrders') })}: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.loading', { entities: t('scheduling.entities.recurringOrders') })}
            </p>
          </div>
        ) : safeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <ArrowPathIcon className="h-12 w-12 text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.notFound', { entities: t('scheduling.entities.recurringOrders') })}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('scheduling.table.customer')}</TableHeader>
                <TableHeader>{t('scheduling.table.equipment')}</TableHeader>
                <TableHeader>{t('scheduling.table.frequency')}</TableHeader>
                <TableHeader>{t('scheduling.table.nextScheduled')}</TableHeader>
                <TableHeader>{t('common.form.description')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {safeOrders.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{getCustomerName(item.customerId)}</TableCell>
                  <TableCell>{getEquipmentType(item.equipmentId)}</TableCell>
                  <TableCell>{getFrequencyBadge(item.frequency)}</TableCell>
                  <TableCell>{formatDate(item.nextScheduledDate)}</TableCell>
                  <TableCell>{item.description || '-'}</TableCell>
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
          {selectedOrder
            ? t('common.actions.edit', { entity: t('scheduling.entities.recurringOrder') })
            : t('common.actions.add', { entity: t('scheduling.entities.recurringOrder') })}
        </DialogTitle>
        <DialogDescription>
          {selectedOrder
            ? t('common.form.descriptionEdit', { entity: t('scheduling.entities.recurringOrder') })
            : t('common.form.descriptionCreate', { entity: t('scheduling.entities.recurringOrder') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('scheduling.form.customer')} *</Label>
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
                  <Label>{t('scheduling.form.equipment')} *</Label>
                  <Select
                    name="equipmentId"
                    value={formData.equipmentId}
                    onChange={(e) => setFormData({ ...formData, equipmentId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.form.select')}</option>
                    {safeEquipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.equipmentType} - {eq.modelNumber || eq.serialNumber || eq.id}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{t('scheduling.form.frequency')} *</Label>
                  <Select
                    name="frequency"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    required
                  >
                    <option value="WEEKLY">{t('scheduling.frequency.weekly')}</option>
                    <option value="MONTHLY">{t('scheduling.frequency.monthly')}</option>
                    <option value="QUARTERLY">{t('scheduling.frequency.quarterly')}</option>
                    <option value="ANNUALLY">{t('scheduling.frequency.annually')}</option>
                  </Select>
                </Field>

                <Field>
                  <Label>{t('scheduling.form.nextScheduledDate')} *</Label>
                  <Input
                    type="date"
                    name="nextScheduledDate"
                    value={formData.nextScheduledDate}
                    onChange={(e) => setFormData({ ...formData, nextScheduledDate: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.description')}</Label>
                  <Input
                    name="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('scheduling.form.descriptionPlaceholder')}
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
              {selectedOrder ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
