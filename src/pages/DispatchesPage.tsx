import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
import { LoadingState } from '../components/ui/LoadingState';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input, InputGroup } from '../components/catalyst/input';
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
  // Form state stores a date-only string for the window start (the form input
  // is `<Input type="date" />`); on submit we convert to an ISO instant and
  // derive `arrivalWindowEnd` as start + 2h. This page's CRUD is a stop-gap
  // surface — the dispatch board (PR #380) is the real UX. The WO detail
  // page's AssignTechnicianDialog handles full window editing.
  const [formData, setFormData] = useState<{
    workOrderId: string;
    assignedUserId: string;
    arrivalWindowStart: string;
    estimatedDuration: number;
    notes: string;
  }>({
    workOrderId: '',
    assignedUserId: '',
    arrivalWindowStart: new Date().toISOString().split('T')[0],
    estimatedDuration: 60,
    notes: '',
  });

  const { data: dispatches = [], isLoading, error } = useQuery({
    queryKey: ['dispatches'],
    // Board endpoint is paged now; this legacy list does client-side search, so
    // pull a large first page (server caps at 200) and read .content. A proper
    // server-filtered board is the planned follow-up.
    queryFn: () => dispatchesApi.getAll({ size: 200 }).then((p) => p.content),
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
      arrivalWindowStart: new Date(item.arrivalWindowStart).toISOString().split('T')[0],
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
    // Date-only input → ISO instant at midnight local; window end = start + 2h
    // (placeholder default; the WO detail page is the real edit surface).
    const startInstant = new Date(formData.arrivalWindowStart);
    const endInstant = new Date(startInstant.getTime() + 2 * 60 * 60 * 1000);
    const request = {
      workOrderId: formData.workOrderId,
      assignedUserId: formData.assignedUserId,
      arrivalWindowStart: startInstant.toISOString(),
      arrivalWindowEnd: endInstant.toISOString(),
      estimatedDuration: formData.estimatedDuration,
      notes: formData.notes,
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
      arrivalWindowStart: new Date().toISOString().split('T')[0],
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

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('dispatch', true)}</Heading>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: getName('dispatch') })}
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
        {safeDispatches.length > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredDispatches.length === safeDispatches.length
              ? `${safeDispatches.length} ${safeDispatches.length === 1 ? getName('dispatch').toLowerCase() : getName('dispatch', true).toLowerCase()}`
              : `${filteredDispatches.length} of ${safeDispatches.length}`}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('dispatch', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-4">
          <LoadingState label={t('common.actions.loading', { entities: getName('dispatch', true) })} />
        </div>
      ) : safeDispatches.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('dispatch', true) })}
          </p>
        </div>
      ) : filteredDispatches.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.noMatchSearch', { entities: getName('dispatch', true) })}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('scheduling.table.workOrder')}</TableHeader>
                <TableHeader>{t('scheduling.table.assignedUser')}</TableHeader>
                <TableHeader>{t('scheduling.table.arrivalWindowStart')}</TableHeader>
                <TableHeader>{t('scheduling.table.estimatedDuration')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDispatches.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {getWorkOrderDescription(item.workOrderId)}
                  </TableCell>
                  <TableCell>{item.assignedUserId}</TableCell>
                  <TableCell>{formatDateTime(item.arrivalWindowStart)}</TableCell>
                  <TableCell>
                    {item.estimatedDuration ? `${item.estimatedDuration} min` : '-'}
                  </TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5">
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
                  <Label>{t('scheduling.form.arrivalWindowStart')} *</Label>
                  <Input
                    type="date"
                    name="arrivalWindowStart"
                    value={formData.arrivalWindowStart}
                    onChange={(e) => setFormData({ ...formData, arrivalWindowStart: e.target.value })}
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
