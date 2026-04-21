import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { workOrderApi, type WorkOrder } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: workOrders, isLoading, error } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => workOrderApi.getAll(),
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Filter work orders based on search query
  const filteredWorkOrders = useMemo(() => {
    if (!workOrders) return [];
    if (!searchQuery.trim()) return workOrders;

    const query = searchQuery.toLowerCase();
    return workOrders.filter(
      (workOrder) =>
        workOrder.workOrderNumber?.toLowerCase().includes(query) ||
        workOrder.id.toLowerCase().includes(query) ||
        workOrder.customerId.toLowerCase().includes(query) ||
        workOrder.status.toLowerCase().includes(query) ||
        workOrder.description?.toLowerCase().includes(query)
    );
  }, [workOrders, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workOrderApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });

  const handleAdd = () => {
    setSelectedWorkOrder(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsDialogOpen(true);
  };

  const handleDelete = (workOrder: WorkOrder) => {
    if (window.confirm(t('common.actions.deleteConfirmGeneric', { entity: getName('work_order') }))) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedWorkOrder(null);
  };

  const columns: DataTableColumn<WorkOrder>[] = [
    {
      key: 'id',
      header: t('workOrders.table.id'),
      cellClassName: 'font-mono text-sm text-zinc-500',
      cell: (workOrder) => workOrder.workOrderNumber || `#${workOrder.id.substring(0, 8)}`,
    },
    {
      key: 'location',
      header: getName('service_location'),
      cellClassName: 'font-medium',
      cell: (workOrder) => (
        <div className="flex flex-col">
          <span>{workOrder.serviceLocation?.locationName || workOrder.customer?.name || '-'}</span>
          <span className="text-sm text-zinc-500">
            {workOrder.serviceLocation?.address.streetAddress || ''}{' '}
            {workOrder.serviceLocation?.address.city || ''}, {workOrder.serviceLocation?.address.state || ''}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('common.form.status'),
      cell: (workOrder) => (
        <StatusBadge
          status={workOrder.status.toLowerCase()}
          label={t(`workOrders.status.${STATUS_TRANSLATION_KEYS[workOrder.status]}`)}
        />
      ),
    },
    {
      key: 'scheduled',
      header: t('workOrders.table.scheduled'),
      cellClassName: 'text-zinc-500',
      cell: (workOrder) => formatDate(workOrder.scheduledDate),
    },
    {
      key: 'description',
      header: t('common.form.description'),
      cellClassName: 'text-zinc-500',
      cell: (workOrder) =>
        workOrder.description
          ? workOrder.description.substring(0, 50) + (workOrder.description.length > 50 ? '...' : '')
          : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (workOrder) => (
        <div className="-mx-3 -my-1.5 sm:-mx-2.5">
          <Dropdown>
            <DropdownButton plain aria-label={t('common.moreOptions')}>
              <EllipsisVerticalIcon className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={() => handleEdit(workOrder)}>
                <DropdownLabel>{t('common.edit')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={() => handleDelete(workOrder)}>
                <DropdownLabel>{t('common.delete')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      ),
    },
  ];

  const totalCount = workOrders?.length ?? 0;
  const filteredCount = filteredWorkOrders.length;

  return (
    <AppLayout>
      <PageHeader
        title={getName('work_order', true)}
        actions={<Button color="accent" onClick={handleAdd}>{t('common.actions.create', { entity: getName('work_order') })}</Button>}
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('common.search')}
        rowCount={
          workOrders
            ? filteredCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? getName('work_order').toLowerCase() : getName('work_order', true).toLowerCase()}`
              : `${filteredCount} of ${totalCount}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('work_order', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {!isLoading && totalCount === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('common.actions.notFound', { entities: getName('work_order', true) })}</p>
          <Button className="mt-2" onClick={handleAdd}>
            {t('common.actions.createFirst', { entity: getName('work_order') })}
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredWorkOrders}
          isLoading={isLoading}
          getRowKey={(w) => w.id}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('work_order', true) })}
        />
      )}

      <WorkOrderFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        workOrder={selectedWorkOrder}
      />
    </AppLayout>
  );
}
