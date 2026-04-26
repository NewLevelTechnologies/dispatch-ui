import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  workOrderApi,
  type WorkOrder,
  type ProgressCategory,
  type ListWorkOrdersParams,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import CancelWorkOrderDialog from '../components/CancelWorkOrderDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';
import { Checkbox, CheckboxField } from '../components/catalyst/checkbox';
import { Label } from '../components/catalyst/fieldset';

type FilterId = 'active' | 'notStarted' | 'inProgress' | 'blocked' | 'completed' | 'cancelled' | 'all';

interface FilterDef {
  id: FilterId;
  labelKey: string;
  params: ListWorkOrdersParams;
}

const FILTERS: FilterDef[] = [
  { id: 'active', labelKey: 'workOrders.filters.open', params: { lifecycleState: 'ACTIVE' } },
  { id: 'notStarted', labelKey: 'workOrders.filters.notStarted', params: { progressCategory: 'NOT_STARTED' } },
  { id: 'inProgress', labelKey: 'workOrders.filters.inProgress', params: { progressCategory: 'IN_PROGRESS' } },
  { id: 'blocked', labelKey: 'workOrders.filters.blocked', params: { progressCategory: 'BLOCKED' } },
  { id: 'completed', labelKey: 'workOrders.filters.completed', params: { progressCategory: 'COMPLETED' } },
  { id: 'cancelled', labelKey: 'workOrders.filters.cancelled', params: { lifecycleState: 'CANCELLED' } },
  { id: 'all', labelKey: 'workOrders.filters.all', params: {} },
];

const PROGRESS_COLORS: Record<ProgressCategory, 'zinc' | 'sky' | 'blue' | 'amber' | 'lime'> = {
  NOT_STARTED: 'zinc',
  IN_PROGRESS: 'blue',
  BLOCKED: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const PRIORITY_COLORS = {
  LOW: 'zinc',
  NORMAL: 'sky',
  HIGH: 'amber',
  URGENT: 'rose',
} as const;

const PRIORITY_TRANSLATION_KEYS: Record<string, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

function formatDate(dateString?: string | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isCancelled(wo: WorkOrder): boolean {
  return wo.lifecycleState === 'CANCELLED';
}

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterId, setFilterId] = useState<FilterId>('active');
  const [includeArchived, setIncludeArchived] = useState(false);

  const filterDef = useMemo(() => FILTERS.find((f) => f.id === filterId) ?? FILTERS[0], [filterId]);
  const queryParams: ListWorkOrdersParams = useMemo(
    () => ({ ...filterDef.params, includeArchived: includeArchived || undefined }),
    [filterDef, includeArchived]
  );

  const { data: workOrders, isLoading, error } = useQuery({
    queryKey: ['work-orders', queryParams],
    queryFn: () => workOrderApi.getAll(queryParams),
  });

  const filteredWorkOrders = useMemo(() => {
    if (!workOrders) return [];
    if (!searchQuery.trim()) return workOrders;

    const query = searchQuery.toLowerCase();
    return workOrders.filter(
      (workOrder) =>
        workOrder.workOrderNumber?.toLowerCase().includes(query) ||
        workOrder.id.toLowerCase().includes(query) ||
        workOrder.customerId.toLowerCase().includes(query) ||
        workOrder.description?.toLowerCase().includes(query) ||
        workOrder.customerOrderNumber?.toLowerCase().includes(query) ||
        workOrder.customer?.name.toLowerCase().includes(query) ||
        workOrder.serviceLocation?.locationName?.toLowerCase().includes(query)
    );
  }, [workOrders, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workOrderApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => workOrderApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(message || t('workOrders.actions.archiveError', { entity: getName('work_order') }));
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => workOrderApi.unarchive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(message || t('workOrders.actions.unarchiveError', { entity: getName('work_order') }));
    },
  });

  const handleAdd = () => {
    setSelectedWorkOrder(null);
    setIsFormOpen(true);
  };

  const handleEdit = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsFormOpen(true);
  };

  const handleCancel = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsCancelOpen(true);
  };

  const handleArchiveToggle = (workOrder: WorkOrder) => {
    if (workOrder.archivedAt) {
      unarchiveMutation.mutate(workOrder.id);
    } else {
      if (window.confirm(t('workOrders.actions.archiveConfirm', { entity: getName('work_order') }))) {
        archiveMutation.mutate(workOrder.id);
      }
    }
  };

  const handleDelete = (workOrder: WorkOrder) => {
    if (window.confirm(t('common.actions.deleteConfirmGeneric', { entity: getName('work_order') }))) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const handleCloseForm = () => setIsFormOpen(false);
  const handleCloseCancel = () => setIsCancelOpen(false);

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('work_order', true)}</Heading>
        <Button onClick={handleAdd}>{t('common.actions.create', { entity: getName('work_order') })}</Button>
      </div>

      {/* Filter tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => {
          const isActive = f.id === filterId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterId(f.id)}
              className={[
                'rounded px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                isActive
                  ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100'
                  : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Search + show-archived */}
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
        <CheckboxField className="flex-none">
          <Checkbox
            name="includeArchived"
            checked={includeArchived}
            onChange={(checked) => setIncludeArchived(checked)}
          />
          <Label className="text-sm">{t('workOrders.actions.showArchived')}</Label>
        </CheckboxField>
        {workOrders && (
          <div className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">
            {filteredWorkOrders.length === workOrders.length
              ? `${workOrders.length} ${workOrders.length === 1 ? getName('work_order').toLowerCase() : getName('work_order', true).toLowerCase()}`
              : `${filteredWorkOrders.length} of ${workOrders.length}`}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: getName('work_order', true) })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('work_order', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {workOrders && workOrders.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.notFound', { entities: getName('work_order', true) })}</p>
          <Button className="mt-2" onClick={handleAdd}>
            {t('common.actions.createFirst', { entity: getName('work_order') })}
          </Button>
        </div>
      )}

      {filteredWorkOrders.length === 0 && workOrders && workOrders.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.noMatchSearch', { entities: getName('work_order', true) })}</p>
        </div>
      )}

      {filteredWorkOrders.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('workOrders.table.id')}</TableHeader>
                <TableHeader>{getName('service_location')}</TableHeader>
                <TableHeader>{t('workOrders.table.statusHeader')}</TableHeader>
                <TableHeader>{t('workOrders.table.priority')}</TableHeader>
                <TableHeader>{t('workOrders.table.scheduled')}</TableHeader>
                <TableHeader>{t('workOrders.table.customerPO')}</TableHeader>
                <TableHeader>{t('common.form.description')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWorkOrders.map((workOrder) => {
                const cancelled = isCancelled(workOrder);
                const archived = !!workOrder.archivedAt;
                const completed = workOrder.progressCategory === 'COMPLETED';
                const rowClass = [
                  cancelled || archived ? 'opacity-60' : '',
                ].filter(Boolean).join(' ');
                return (
                  <TableRow key={workOrder.id} className={rowClass}>
                    <TableCell className="font-mono text-sm text-zinc-500">
                      <div className="flex flex-col">
                        <span>{workOrder.workOrderNumber || `#${workOrder.id.substring(0, 8)}`}</span>
                        {archived && (
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                            {t('workOrders.actions.archived')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>
                          {workOrder.serviceLocation?.locationName || workOrder.customer?.name || '-'}
                        </span>
                        <span className="text-sm text-zinc-500">
                          {workOrder.serviceLocation?.address.streetAddress || ''}{' '}
                          {workOrder.serviceLocation?.address.city || ''}, {workOrder.serviceLocation?.address.state || ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {cancelled ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge color="zinc">{t('workOrders.actions.cancelledBadge')}</Badge>
                          {workOrder.cancelledAt && (
                            <span className="text-[10px] text-zinc-500">
                              {t('workOrders.table.cancelledOn', { date: formatDate(workOrder.cancelledAt) })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge color={PROGRESS_COLORS[workOrder.progressCategory]}>
                          {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge color={PRIORITY_COLORS[workOrder.priority ?? 'NORMAL']}>
                        {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[workOrder.priority ?? 'NORMAL']}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(workOrder.scheduledDate)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {workOrder.customerOrderNumber || '-'}
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
                              <DropdownLabel>{cancelled ? t('common.view') : t('common.edit')}</DropdownLabel>
                            </DropdownItem>
                            {!cancelled && !completed && (
                              <DropdownItem onClick={() => handleCancel(workOrder)}>
                                <DropdownLabel>{t('workOrders.actions.cancel', { entity: getName('work_order') })}</DropdownLabel>
                              </DropdownItem>
                            )}
                            <DropdownItem onClick={() => handleArchiveToggle(workOrder)}>
                              <DropdownLabel>
                                {archived ? t('workOrders.actions.unarchive') : t('workOrders.actions.archive')}
                              </DropdownLabel>
                            </DropdownItem>
                            <DropdownDivider />
                            <DropdownItem onClick={() => handleDelete(workOrder)}>
                              <DropdownLabel>{t('common.delete')}</DropdownLabel>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <WorkOrderFormDialog
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        workOrder={selectedWorkOrder}
      />

      <CancelWorkOrderDialog
        isOpen={isCancelOpen}
        onClose={handleCloseCancel}
        workOrder={selectedWorkOrder}
      />
    </AppLayout>
  );
}
