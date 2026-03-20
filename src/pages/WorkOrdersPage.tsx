import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { workOrderApi, type WorkOrder } from '../api';
import AppLayout from '../components/AppLayout';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';

const STATUS_COLORS = {
  PENDING: 'amber',
  SCHEDULED: 'sky',
  IN_PROGRESS: 'blue',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
} as const;

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: workOrders, isLoading, error } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => workOrderApi.getAll(),
  });

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
    if (window.confirm(t('common.actions.deleteConfirmGeneric', { entity: t('entities.workOrder') }))) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedWorkOrder(null);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{t('entities.workOrders')}</Heading>
        <Button onClick={handleAdd}>{t('common.actions.create', { entity: t('entities.workOrder') })}</Button>
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
        {workOrders && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredWorkOrders.length === workOrders.length
              ? `${workOrders.length} ${workOrders.length === 1 ? t('entities.workOrder').toLowerCase() : t('entities.workOrders').toLowerCase()}`
              : `${filteredWorkOrders.length} of ${workOrders.length}`}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: t('entities.workOrders') })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('entities.workOrders') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {workOrders && workOrders.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.notFound', { entities: t('entities.workOrders') })}</p>
          <Button className="mt-2" onClick={handleAdd}>
            {t('common.actions.createFirst', { entity: t('entities.workOrder') })}
          </Button>
        </div>
      )}

      {filteredWorkOrders.length === 0 && workOrders && workOrders.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.noMatchSearch', { entities: t('entities.workOrders') })}</p>
        </div>
      )}

      {filteredWorkOrders.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('workOrders.table.id')}</TableHeader>
                <TableHeader>{t('entities.customer')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader>{t('workOrders.table.scheduled')}</TableHeader>
                <TableHeader>{t('workOrders.table.amount')}</TableHeader>
                <TableHeader>{t('common.form.description')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWorkOrders.map((workOrder) => (
                <TableRow key={workOrder.id}>
                  <TableCell className="font-mono text-sm text-zinc-500">
                    {workOrder.id.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="font-medium">
                    {workOrder.customerId.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <Badge color={STATUS_COLORS[workOrder.status]}>
                      {t(`workOrders.status.${STATUS_TRANSLATION_KEYS[workOrder.status]}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDate(workOrder.scheduledDate)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatCurrency(workOrder.totalAmount)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {workOrder.description
                      ? workOrder.description.substring(0, 50) + (workOrder.description.length > 50 ? '...' : '')
                      : '-'}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <WorkOrderFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        workOrder={selectedWorkOrder}
      />
    </AppLayout>
  );
}
