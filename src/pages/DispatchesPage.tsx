import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, CalendarIcon } from '@heroicons/react/24/outline';
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
  dispatchesApi,
  type Dispatch,
  type CreateDispatchRequest,
  type UpdateDispatchRequest,
} from '../api/schedulingApi';

interface WorkOrder {
  id: string;
  description: string;
}

export default function DispatchesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [formData, setFormData] = useState<CreateDispatchRequest>({
    workOrderId: '',
    assignedUserId: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    estimatedDuration: 60,
    notes: '',
  });

  const { data: dispatches = [], isLoading, error } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => dispatchesApi.getAll(),
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ['work-orders'],
    queryFn: async () => {
      const response = await apiClient.get<WorkOrder[]>('/work-orders');
      return response.data;
    },
  });

  // Ensure all data is always an array
  const safeDispatches = Array.isArray(dispatches) ? dispatches : [];
  const safeWorkOrders = Array.isArray(workOrders) ? workOrders : [];

  const createMutation = useMutation({
    mutationFn: (request: CreateDispatchRequest) => dispatchesApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDispatchRequest }) =>
      dispatchesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setIsDialogOpen(false);
      setSelectedDispatch(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dispatchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedDispatch(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: Dispatch) => {
    setSelectedDispatch(item);
    setFormData({
      workOrderId: item.workOrderId,
      assignedUserId: item.assignedUserId,
      scheduledDate: new Date(item.scheduledDate).toISOString().split('T')[0],
      estimatedDuration: item.estimatedDuration || 60,
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: Dispatch) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: `Dispatch ${item.id.slice(0, 8)}` }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const request = {
      ...formData,
      scheduledDate: new Date(formData.scheduledDate).toISOString(),
    };
    if (selectedDispatch) {
      updateMutation.mutate({ id: selectedDispatch.id, data: request });
    } else {
      createMutation.mutate(request);
    }
  };

  const resetForm = () => {
    setFormData({
      workOrderId: '',
      assignedUserId: '',
      scheduledDate: new Date().toISOString().split('T')[0],
      estimatedDuration: 60,
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, 'lime' | 'sky' | 'amber' | 'rose' | 'zinc'> = {
      SCHEDULED: 'sky',
      IN_PROGRESS: 'amber',
      COMPLETED: 'lime',
      CANCELLED: 'zinc',
    };
    return <Badge color={colors[status] || 'zinc'}>{status}</Badge>;
  };

  const getWorkOrderDescription = (workOrderId: string) => {
    const workOrder = safeWorkOrders.find((wo) => wo.id === workOrderId);
    return workOrder?.description || workOrderId;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{t('scheduling.entities.dispatches')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('scheduling.descriptionDispatches')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('scheduling.entities.dispatch') })}
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20 mb-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('scheduling.entities.dispatches') })}: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.loading', { entities: t('scheduling.entities.dispatches') })}
            </p>
          </div>
        ) : safeDispatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.notFound', { entities: t('scheduling.entities.dispatches') })}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('scheduling.table.workOrder')}</TableHeader>
                <TableHeader>{t('scheduling.table.assignedUser')}</TableHeader>
                <TableHeader>{t('scheduling.table.scheduledDate')}</TableHeader>
                <TableHeader>{t('scheduling.table.estimatedDuration')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {safeDispatches.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {getWorkOrderDescription(item.workOrderId)}
                  </TableCell>
                  <TableCell>{item.assignedUserId}</TableCell>
                  <TableCell>{formatDateTime(item.scheduledDate)}</TableCell>
                  <TableCell>
                    {item.estimatedDuration ? `${item.estimatedDuration} min` : '-'}
                  </TableCell>
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
          {selectedDispatch
            ? t('common.actions.edit', { entity: t('scheduling.entities.dispatch') })
            : t('common.actions.add', { entity: t('scheduling.entities.dispatch') })}
        </DialogTitle>
        <DialogDescription>
          {selectedDispatch
            ? t('common.form.descriptionEdit', { entity: t('scheduling.entities.dispatch') })
            : t('common.form.descriptionCreate', { entity: t('scheduling.entities.dispatch') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('scheduling.form.workOrder')} *</Label>
                  <Select
                    name="workOrderId"
                    value={formData.workOrderId}
                    onChange={(e) => setFormData({ ...formData, workOrderId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.form.select')}</option>
                    {safeWorkOrders.map((wo) => (
                      <option key={wo.id} value={wo.id}>
                        {wo.description || wo.id}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{t('scheduling.form.assignedUser')} *</Label>
                  <Input
                    name="assignedUserId"
                    value={formData.assignedUserId}
                    onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                    placeholder="User ID"
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('scheduling.form.scheduledDate')} *</Label>
                  <Input
                    type="date"
                    name="scheduledDate"
                    value={formData.scheduledDate}
                    onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('scheduling.form.estimatedDuration')}</Label>
                  <Input
                    type="number"
                    name="estimatedDuration"
                    value={formData.estimatedDuration}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estimatedDuration: parseInt(e.target.value),
                      })
                    }
                    placeholder={t('scheduling.form.durationPlaceholder')}
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
              {selectedDispatch ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
