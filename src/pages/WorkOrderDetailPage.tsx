import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  statusWorkflowsApi,
  workflowConfigApi,
  type ProgressCategory,
  type WorkItemResponse,
  type WorkOrderPriority,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import WorkItemFormDialog from '../components/WorkItemFormDialog';
import WorkItemsTable from '../components/WorkItemsTable';
import WorkOrderActivityRail from '../components/WorkOrderActivityRail';
import { SlideOver } from '../components/catalyst/slideover';
import { formatPhone } from '../utils/formatPhone';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from '../components/catalyst/description-list';
import { Link as CatLink } from '../components/catalyst/link';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

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

const PRIORITY_COLORS: Record<WorkOrderPriority, 'zinc' | 'sky' | 'amber' | 'rose'> = {
  LOW: 'zinc',
  NORMAL: 'sky',
  HIGH: 'amber',
  URGENT: 'rose',
};

const PRIORITY_TRANSLATION_KEYS: Record<WorkOrderPriority, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

const MONEY_CHIPS: { key: string; labelKey: string }[] = [
  { key: 'quoted', labelKey: 'workOrders.detail.money.quoted' },
  { key: 'invoiced', labelKey: 'workOrders.detail.money.invoiced' },
  { key: 'paid', labelKey: 'workOrders.detail.money.paid' },
  { key: 'nte', labelKey: 'workOrders.detail.money.nte' },
  { key: 'balance', labelKey: 'workOrders.detail.money.balance' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [copied, setCopied] = useState<'phone' | 'address' | null>(null);
  const [activitySheetOpen, setActivitySheetOpen] = useState(false);
  const [workItemDialogOpen, setWorkItemDialogOpen] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemResponse | null>(null);


  const deleteWorkItemMutation = useMutation({
    mutationFn: ({ workItemId }: { workItemId: string }) =>
      workOrderApi.deleteWorkItem(id!, workItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.workItems.deleteError'));
    },
  });

  const handleDeleteWorkItem = (wi: WorkItemResponse) => {
    if (!window.confirm(t('workOrders.workItems.deleteConfirm'))) return;
    deleteWorkItemMutation.mutate({ workItemId: wi.id });
  };

  // W shortcut → open the work item dialog in create mode. Mirrors the N
  // shortcut in NoteComposer: ignored when an input is focused, when modifier
  // keys are held, or when the dialog is already open. Re-binds on open-state
  // change so the closed-only check is reliable.
  useEffect(() => {
    if (workItemDialogOpen) return; // listener inactive while dialog is open
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'w' && e.key !== 'W') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setEditingWorkItem(null);
      setWorkItemDialogOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workItemDialogOpen]);

  const {
    data: workOrder,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => workOrderApi.getById(id!),
    enabled: !!id,
  });

  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => divisionsApi.getAll(),
  });

  // Tenant work-item statuses + workflow rules + config drive the inline status pill.
  // Lifted to the page so all rows share one cache hit per query.
  const { data: workItemStatuses = [] } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });

  const { data: statusWorkflows = [] } = useQuery({
    queryKey: ['status-workflows'],
    queryFn: () => statusWorkflowsApi.getAll(),
  });

  const { data: workflowConfig } = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => workflowConfigApi.get(),
  });

  const handleCopy = async (kind: 'phone' | 'address', value: string) => {
    if (!value) return;
    // Per design §3.1: tel: handler is only useful on tablet/mobile (≥1024px viewport
    // assumes a desktop with a separate softphone). On desktop, copy to clipboard.
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (kind === 'phone' && !isDesktop) {
      window.location.href = `tel:${value.replace(/\D/g, '')}`;
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable (insecure context, permissions); silent no-op.
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <Text>{t('common.actions.loading', { entities: getName('work_order', true) })}</Text>
        </div>
      </AppLayout>
    );
  }

  if (error || !workOrder) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('common.actions.errorLoadingEntity', { entity: getName('work_order') })}
              {error && `: ${(error as Error).message}`}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/work-orders')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.backTo', { entities: getName('work_order', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const typeName = workOrderTypes?.find((x) => x.id === workOrder.workOrderTypeId)?.name;
  const divisionName = divisions?.find((x) => x.id === workOrder.divisionId)?.name;
  const customer = workOrder.customer;
  const location = workOrder.serviceLocation;

  const addressLine = location
    ? `${location.address.streetAddress}, ${location.address.city}, ${location.address.state} ${location.address.zipCode}`.trim()
    : '';

  const isCancelled = workOrder.lifecycleState === 'CANCELLED';
  const isArchived = !!workOrder.archivedAt;
  const priority = workOrder.priority ?? 'NORMAL';

  const woDisplayNumber = workOrder.workOrderNumber || `#${workOrder.id.slice(0, 8)}`;

  return (
    <AppLayout>
      {/* Multi-column independent scroll on lg+ — header is a fixed row, each
          column scrolls in its own viewport. AppLayout uses min-h-svh so we have
          to compute the page height explicitly (7rem ≈ AppLayout's chrome on lg+:
          p-2 + p-10 + main pt-2/pb-2). Below lg, fall back to natural document
          flow with the sticky header. */}
      <div className="flex flex-col lg:h-[calc(100svh-7rem)] lg:overflow-hidden">
        {/* Header — sticky on small viewports; on lg+ it's a static layout row
            since the parent has overflow-hidden and the body grid scrolls per-column. */}
        <div className="sticky top-0 z-10 border-b border-zinc-950/10 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/95 lg:relative lg:shrink-0 lg:top-auto">
          {/* Back link */}
          <div className="mb-2">
            <Button plain onClick={() => navigate('/work-orders')}>
              <ArrowLeftIcon className="size-4" />
              {t('common.actions.backTo', { entities: getName('work_order', true) })}
            </Button>
          </div>

          {/* Row 1 — identity & state */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Heading className="!text-lg">{woDisplayNumber}</Heading>
            <Badge color={PROGRESS_COLORS[workOrder.progressCategory]}>
              {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
            </Badge>
            {isCancelled && (
              <Badge color="zinc">{t('workOrders.actions.cancelledBadge')}</Badge>
            )}
            {isArchived && (
              <Badge color="zinc">{t('workOrders.actions.archived')}</Badge>
            )}
            <Badge color={PRIORITY_COLORS[priority]}>
              {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
            </Badge>
            <Text className="!text-sm !text-zinc-500">
              {t('workOrders.detail.lastUpdated', { time: formatRelativeTime(workOrder.updatedAt) })}
            </Text>
          </div>

          {/* Row 2 — contact & schedule */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {customer && (
              <CatLink
                href={`/customers/${customer.id}`}
                className="font-medium text-zinc-950 hover:underline dark:text-white"
              >
                {customer.name}
              </CatLink>
            )}
            {customer?.phone && (
              <button
                type="button"
                onClick={() => handleCopy('phone', formatPhone(customer.phone) || customer.phone!)}
                className="inline-flex items-center gap-1 hover:text-zinc-950 dark:hover:text-white"
                title={t('workOrders.detail.copyPhone')}
              >
                {copied === 'phone' ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <PhoneIcon className="size-4" />
                )}
                <span>{formatPhone(customer.phone)}</span>
              </button>
            )}
            {addressLine && (
              <button
                type="button"
                onClick={() => handleCopy('address', addressLine)}
                className="inline-flex items-center gap-1 text-left hover:text-zinc-950 dark:hover:text-white"
                title={t('workOrders.detail.copyAddress')}
              >
                {copied === 'address' ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <MapPinIcon className="size-4" />
                )}
                <span>{addressLine}</span>
              </button>
            )}
            {workOrder.scheduledDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="size-4" />
                {t('workOrders.detail.eta', { date: formatDate(workOrder.scheduledDate) })}
              </span>
            )}
          </div>

          {/* Row 3 — money chips. Phase 1: render values as placeholders;
              the financial detail drawer (and live values) wires up in phase 7. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {MONEY_CHIPS.map((chip) => (
              <Badge key={chip.key} color="zinc" className="cursor-default opacity-70">
                {t('workOrders.detail.money.placeholder', { label: t(chip.labelKey) })}
              </Badge>
            ))}
          </div>

          {/* Action bar — buttons render to lock in the layout; functionality lands in
              later phases (work-item dialog phase 4, dispatch phase 6, notes phase 5,
              edit/overflow phase 4+). */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setEditingWorkItem(null);
                setWorkItemDialogOpen(true);
              }}
              disabled={isCancelled || isArchived}
              title={
                isCancelled || isArchived
                  ? t('workOrders.detail.frozen')
                  : undefined
              }
            >
              <PlusIcon className="size-4" />
              {t('common.actions.add', { entity: getName('work_item') })}
            </Button>
            <Button disabled title={t('workOrders.detail.actionPending')}>
              <PlusIcon className="size-4" />
              {t('common.actions.add', { entity: getName('dispatch') })}
            </Button>
            <Button onClick={() => setActivitySheetOpen(true)}>
              <PlusIcon className="size-4" />
              {t('workOrders.detail.addNote')}
            </Button>
            <div className="grow" />
            <Button outline disabled title={t('workOrders.detail.actionPending')}>
              <PencilIcon className="size-4" />
              {t('common.edit')}
            </Button>
            <Dropdown>
              <DropdownButton plain aria-label={t('common.moreOptions')}>
                <EllipsisHorizontalIcon className="size-5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                <DropdownItem disabled>
                  <DropdownLabel>{t('workOrders.detail.print')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem disabled>
                  <DropdownLabel>{t('workOrders.detail.duplicate')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem disabled>
                  <DropdownLabel>{t('common.delete')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Body grid:
            - <lg: stacked, document-level scroll
            - lg-xl: 2-col (left strip + main); rail accessed via slide-over
            - xl+: 3-col (left strip + main + right rail)
            On lg+, the body fills the remaining viewport (flex-1 min-h-0) and
            each column owns its scroll. */}
        <div className="p-4 lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[260px_1fr_360px]">
          <aside className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
            {location && (
              <Card title={getName('service_location')}>
                <CatLink
                  href={`/service-locations/${location.id}`}
                  className="-m-1 block cursor-pointer rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-white/5"
                >
                  {location.locationName && (
                    <div className="font-medium text-zinc-950 dark:text-white">
                      {location.locationName}
                    </div>
                  )}
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    {location.address.streetAddress}
                  </div>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    {`${location.address.city}, ${location.address.state} ${location.address.zipCode}`}
                  </div>
                </CatLink>

                {(location.siteContactName || location.siteContactPhone) && (
                  <DescriptionList className="mt-3">
                    {location.siteContactName && (
                      <>
                        <DescriptionTerm>{t('common.form.siteContactName')}</DescriptionTerm>
                        <DescriptionDetails>{location.siteContactName}</DescriptionDetails>
                      </>
                    )}
                    {location.siteContactPhone && (
                      <>
                        <DescriptionTerm>{t('common.form.siteContactPhone')}</DescriptionTerm>
                        <DescriptionDetails>{formatPhone(location.siteContactPhone)}</DescriptionDetails>
                      </>
                    )}
                  </DescriptionList>
                )}
              </Card>
            )}

            <Card title={t('workOrders.detail.info', { entity: getName('work_order') })}>
              <DescriptionList>
                <DescriptionTerm>{t('workOrders.detail.created')}</DescriptionTerm>
                <DescriptionDetails>{formatDate(workOrder.createdAt)}</DescriptionDetails>
                {workOrder.customerOrderNumber && (
                  <>
                    <DescriptionTerm>{t('workOrders.form.customerOrderNumber')}</DescriptionTerm>
                    <DescriptionDetails className="font-mono">
                      {workOrder.customerOrderNumber}
                    </DescriptionDetails>
                  </>
                )}
                {divisionName && (
                  <>
                    <DescriptionTerm>{getName('division')}</DescriptionTerm>
                    <DescriptionDetails>{divisionName}</DescriptionDetails>
                  </>
                )}
                {typeName && (
                  <>
                    <DescriptionTerm>{t('workOrders.form.type')}</DescriptionTerm>
                    <DescriptionDetails>{typeName}</DescriptionDetails>
                  </>
                )}
                <DescriptionTerm>{t('workOrders.form.priority')}</DescriptionTerm>
                <DescriptionDetails>
                  <Badge color={PRIORITY_COLORS[priority]}>
                    {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
                  </Badge>
                </DescriptionDetails>
                {workOrder.scheduledDate && (
                  <>
                    <DescriptionTerm>{t('workOrders.form.scheduledDate')}</DescriptionTerm>
                    <DescriptionDetails>{formatDate(workOrder.scheduledDate)}</DescriptionDetails>
                  </>
                )}
                {workOrder.completedDate && (
                  <>
                    <DescriptionTerm>{t('workOrders.detail.completed')}</DescriptionTerm>
                    <DescriptionDetails>{formatDate(workOrder.completedDate)}</DescriptionDetails>
                  </>
                )}
              </DescriptionList>
            </Card>
          </aside>

          {/* Main canvas — work items table. Cancelled WOs render the pills read-only. */}
          <main className="mt-6 lg:mt-0 lg:min-h-0 lg:overflow-y-auto">
            <WorkItemsTable
              workOrderId={workOrder.id}
              workItems={workOrder.workItems ?? []}
              statuses={workItemStatuses}
              workflows={statusWorkflows}
              enforceWorkflow={workflowConfig?.enforceStatusWorkflow ?? false}
              readOnly={isCancelled || isArchived}
              onEdit={(wi) => {
                setEditingWorkItem(wi);
                setWorkItemDialogOpen(true);
              }}
              onDelete={handleDeleteWorkItem}
            />
          </main>

          {/* Right rail (xl+ only) — same content also appears in the slide-over below. */}
          {/* Right rail — visible on xl+. Independent scroll within its column
              (parent body grid is overflow-hidden + flex-1, so each column owns
              its scroll viewport). */}
          <aside className="mt-6 hidden xl:mt-0 xl:block xl:min-h-0 xl:overflow-y-auto">
            <WorkOrderActivityRail workOrderId={workOrder.id} />
          </aside>
        </div>
      </div>

      {/* Slide-over for non-xl viewports (and as the "+ Note" entry point on any viewport).
          Catalyst SlideOver only mounts content when `open`, so React Query duplication
          is bounded to the moment the sheet is visible. */}
      <SlideOver
        open={activitySheetOpen}
        onClose={setActivitySheetOpen}
        className="!max-w-md"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            {t('workOrders.activity.heading')}
          </h2>
          <Button plain onClick={() => setActivitySheetOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <WorkOrderActivityRail workOrderId={workOrder.id} />
        </div>
      </SlideOver>

      <WorkItemFormDialog
        isOpen={workItemDialogOpen}
        onClose={() => {
          setWorkItemDialogOpen(false);
          setEditingWorkItem(null);
        }}
        workOrderId={workOrder.id}
        workItem={editingWorkItem}
        readOnly={isCancelled || isArchived}
      />
    </AppLayout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}
