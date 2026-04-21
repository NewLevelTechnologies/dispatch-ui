import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';
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
  const { getName } = useGlossary();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
  const safeDispatches = useMemo(() => Array.isArray(dispatches) ? dispatches : [], [dispatches]);
  const safeWorkOrders = useMemo(() => Array.isArray(workOrders) ? workOrders : [], [workOrders]);

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getWorkOrderDescription = (workOrderId: string) => {
    const workOrder = safeWorkOrders.find((wo) => wo.id === workOrderId);
    return workOrder?.description || workOrderId;
  };

  // Filter dispatches based on search query
  const filteredDispatches = useMemo(() => {
    if (safeDispatches.length === 0) return [];
    if (!searchQuery.trim()) return safeDispatches;

    const query = searchQuery.toLowerCase();
    return safeDispatches.filter(
      (dispatch) => {
        const workOrderDesc = safeWorkOrders.find((wo) => wo.id === dispatch.workOrderId)?.description || dispatch.workOrderId;
        return (
          dispatch.id.toLowerCase().includes(query) ||
          dispatch.workOrderId.toLowerCase().includes(query) ||
          dispatch.assignedUserId.toLowerCase().includes(query) ||
          dispatch.status.toLowerCase().includes(query) ||
          dispatch.notes?.toLowerCase().includes(query) ||
          workOrderDesc.toLowerCase().includes(query)
        );
      }
    );
  }, [safeDispatches, safeWorkOrders, searchQuery]);

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

  const columns: DataTableColumn<Dispatch>[] = [
    {
      key: 'workOrder',
      header: t('scheduling.table.workOrder'),
      cellClassName: 'font-medium',
      cell: (item) => getWorkOrderDescription(item.workOrderId),
    },
    {
      key: 'assignedUser',
      header: t('scheduling.table.assignedUser'),
      cell: (item) => item.assignedUserId,
    },
    {
      key: 'scheduledDate',
      header: t('scheduling.table.scheduledDate'),
      cell: (item) => formatDateTime(item.scheduledDate),
    },
    {
      key: 'duration',
      header: t('scheduling.table.estimatedDuration'),
      cell: (item) => (item.estimatedDuration ? `${item.estimatedDuration} min` : '-'),
    },
    {
      key: 'status',
      header: t('common.form.status'),
      cell: (item) => <StatusBadge status={item.status.toLowerCase()} label={item.status} />,
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
        title={getName('dispatch', true)}
        actions={<Button color="accent" onClick={handleAdd}>{t('common.actions.add', { entity: getName('dispatch') })}</Button>}
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('common.search')}
        rowCount={
          safeDispatches.length > 0
            ? filteredDispatches.length === safeDispatches.length
              ? `${safeDispatches.length} ${safeDispatches.length === 1 ? getName('dispatch').toLowerCase() : getName('dispatch', true).toLowerCase()}`
              : `${filteredDispatches.length} of ${safeDispatches.length}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('dispatch', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {!isLoading && safeDispatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('dispatch', true) })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredDispatches}
          isLoading={isLoading}
          getRowKey={(d) => d.id}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('dispatch', true) })}
        />
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onClose={setIsDialogOpen}>
        <DialogTitle>
          {selectedDispatch
            ? t('common.actions.edit', { entity: getName('dispatch') })
            : t('common.actions.add', { entity: getName('dispatch') })}
        </DialogTitle>
        <DialogDescription>
          {selectedDispatch
            ? t('common.form.descriptionEdit', { entity: getName('dispatch') })
            : t('common.form.descriptionCreate', { entity: getName('dispatch') })}
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
