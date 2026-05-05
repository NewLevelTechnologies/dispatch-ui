import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  statusWorkflowsApi,
  workflowConfigApi,
  type Equipment,
  type ProgressCategory,
  type UpdateWorkOrderRequest,
  type WorkItemResponse,
  type WorkOrderPriority,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import EditableField from '../components/EditableField';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentQuickViewDrawer from '../components/EquipmentQuickViewDrawer';
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
  EllipsisHorizontalIcon,
  PencilIcon,
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
  // Equipment edit dialog opens from a work-item row's "Edit all" button. We
  // fetch the full Equipment record on demand because WorkItemEquipmentSummary
  // doesn't carry the deeper fields the dialog edits (description, install
  // date, warranty, etc.).
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  // "Add Equipment" from a work-item row's empty-state opens the same dialog
  // in CREATE mode with the WO's service location pre-locked. The work item
  // tracked here is the one we'll link the new equipment to once it's
  // created (via EquipmentFormDialog's onCreated callback).
  const [addEquipmentForWorkItem, setAddEquipmentForWorkItem] = useState<WorkItemResponse | null>(null);
  // Sub-unit chip click opens the equipment quickview drawer in-context.
  // Drawer manages its own stack of pushed sub-units internally; this state
  // is just the seed (the equipment whose chip was clicked).
  const [drawerEquipment, setDrawerEquipment] = useState<{ id: string; name: string } | null>(null);
  // "+ Add unit" inside a chip row OR inside the drawer opens
  // EquipmentFormDialog with this equipment locked as the parent. Same dialog
  // component as the empty-state add-equipment flow, just with a different
  // lock and no work-item linking (sub-units belong to their parent
  // equipment, not directly to the work item).
  const [addSubUnitParent, setAddSubUnitParent] = useState<{ id: string; name: string } | null>(null);

  const handleEditEquipment = async (equipmentId: string) => {
    try {
      const full = await equipmentApi.getById(equipmentId);
      setEditingEquipment(full);
      setEquipmentDialogOpen(true);
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.actions.errorLoadingEntity', { entity: getName('equipment') }));
    }
  };

  const handleAddEquipmentToWorkItem = (wi: WorkItemResponse) => {
    setAddEquipmentForWorkItem(wi);
  };

  // Sub-unit chip click → open the quickview drawer for that equipment.
  // Drawer pushes its own stack internally for further drill-in.
  const handleSelectSubUnit = (subUnit: { id: string; name: string }) => {
    setDrawerEquipment(subUnit);
  };

  // "+ Add unit" → EquipmentFormDialog with the parent locked. Routes from
  // both the work-item row's chip row AND the inside-drawer chip row through
  // this single handler so dialog state lives in one place.
  const handleAddSubUnit = (parent: { id: string; name: string }) => {
    setAddSubUnitParent(parent);
  };

  // After the user creates new equipment from the row's empty state, link it
  // to the work item that triggered the flow. EquipmentFormDialog already
  // invalidated equipment + work-order caches on its own; this PATCH is a
  // second mutation that sets workItem.equipmentId, then re-invalidates so
  // the row swaps from empty state to populated.
  const handleEquipmentCreatedForWorkItem = async (created: Equipment) => {
    const wi = addEquipmentForWorkItem;
    setAddEquipmentForWorkItem(null);
    if (!wi || !id) return;
    try {
      await workOrderApi.updateWorkItem(id, wi.id, { equipmentId: created.id });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('work_item') }));
    }
  };


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
      alert(msg || t('common.form.errorDelete', { entity: getName('work_item') }));
    },
  });

  const handleDeleteWorkItem = (wi: WorkItemResponse) => {
    if (!window.confirm(t('workOrders.workItems.deleteConfirm', { entity: getName('work_item') }))) return;
    deleteWorkItemMutation.mutate({ workItemId: wi.id });
  };

  // Inline description edit on each row. EditableField stays in edit mode if
  // this throws (the user can retry/cancel), so we let the error propagate
  // after surfacing it via alert.
  const handleSaveWorkItemDescription = async (
    wi: WorkItemResponse,
    next: string
  ) => {
    try {
      await workOrderApi.updateWorkItem(id!, wi.id, { description: next });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('work_item') }));
      throw err;
    }
  };

  // Generic single-field PATCH for inline edits on the WO meta card. Each
  // EditableField calls this with the field name and new value. EditableField
  // stays in edit mode if we throw, so we propagate after alert so the user
  // can retry / cancel.
  const handleSaveWorkOrderField = async <K extends keyof UpdateWorkOrderRequest>(
    field: K,
    next: UpdateWorkOrderRequest[K]
  ) => {
    try {
      await workOrderApi.update(id!, { [field]: next } as UpdateWorkOrderRequest);
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('work_order') }));
      throw err;
    }
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
      window.location.assign(`tel:${value.replace(/\D/g, '')}`);
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

  const customer = workOrder.customer;
  const location = workOrder.serviceLocation;

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

          {/* Row 1 — identity & state. Priority pill is now click-to-edit
              (matches the work-item status pill pattern); the previous
              row in the WO Info card is gone in this same change. */}
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
            {isCancelled || isArchived ? (
              <Badge color={PRIORITY_COLORS[priority]}>
                {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
              </Badge>
            ) : (
              // Priority click-to-edit follows the WorkItemStatusPill pattern:
              // Badge is the trigger of a Headless Dropdown so the badge stays
              // sized to its label and the menu pops below. EditableField's
              // Select swap was visually awkward here because the underlying
              // Catalyst Select is `block w-full`, blowing the trigger out to
              // fill the flex row.
              <Dropdown>
                <DropdownButton
                  as="button"
                  type="button"
                  className="cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={t('workOrders.form.priority')}
                >
                  <Badge color={PRIORITY_COLORS[priority]}>
                    {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
                  </Badge>
                </DropdownButton>
                <DropdownMenu anchor="bottom start">
                  {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkOrderPriority[])
                    .filter((p) => p !== priority)
                    .map((p) => (
                      <DropdownItem
                        key={p}
                        onClick={() => handleSaveWorkOrderField('priority', p)}
                      >
                        <DropdownLabel>
                          {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[p]}`)}
                        </DropdownLabel>
                      </DropdownItem>
                    ))}
                </DropdownMenu>
              </Dropdown>
            )}
            <Text className="!text-sm !text-zinc-500">
              {t('workOrders.detail.lastUpdated', { time: formatRelativeTime(workOrder.updatedAt) })}
            </Text>
          </div>

          {/* Row 2 — B2B context + ETA. Customer name is a thin breadcrumb;
              the operational location identity (name + address + site
              contact) lives in the Service Location card on the left strip,
              not here. ETA is read-only display: a WO can have multiple
              dispatches with their own scheduled dates, so editing a single
              "WO ETA" doesn't model reality — the field will be derived
              from the next dispatch when phase 6 ships. Until then,
              workOrder.scheduledDate is editable via the Edit WO dialog. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {customer && (
              // Permanent affordance: darker than the surrounding muted row
              // text + medium weight + always-on subtle underline so it reads
              // as "this is a link" sitting next to non-link text like the ETA
              // chip. Hover brightens the underline.
              <CatLink
                href={`/customers/${customer.id}`}
                className="font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-700 dark:text-white dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
              >
                {customer.name}
              </CatLink>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-4" />
              <span>
                {workOrder.scheduledDate
                  ? t('workOrders.detail.eta', { date: formatDate(workOrder.scheduledDate) })
                  : t('workOrders.detail.notScheduled')}
              </span>
            </span>
          </div>

          {/* Row 3 — money chips, hidden until phase 7 (financial detail
              drawer + live values). A row of "$ —" placeholders communicates
              nothing on a fresh WO and burns vertical real estate; better to
              show nothing until there's something to show. */}

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
            {/* Service Location card. Location identity belongs here, not
                in the header — bold name + multi-line address gives the
                "where is this work happening?" answer at a glance. Site
                contact (name + phone + email) lives in the same card so
                location-scoped contact data clusters together. Click the
                card body to navigate to the dedicated location page;
                phone/email use click-to-copy and mailto. */}
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

                {(() => {
                  // Strict fallback: site contact wins when ANY site field is
                  // populated. Otherwise, surface the customer-level contact
                  // (name + phone + email) so CSRs always have an actionable
                  // number/email instead of a blank section. The label
                  // ("Site Contact" vs "Customer Contact") makes the source
                  // explicit so the CSR knows whether they're calling the
                  // on-site person or the account holder.
                  const hasSiteContact =
                    !!location.siteContactName ||
                    !!location.siteContactPhone ||
                    !!location.siteContactEmail;
                  const hasCustomerContact =
                    !!customer && (!!customer.phone || !!customer.email);
                  if (!hasSiteContact && !hasCustomerContact) return null;

                  const label = hasSiteContact
                    ? t('workOrders.detail.siteContact')
                    : t('workOrders.detail.customerContact');
                  const contactName = hasSiteContact
                    ? location.siteContactName
                    : customer?.name;
                  const contactPhone = hasSiteContact
                    ? location.siteContactPhone
                    : customer?.phone;
                  const contactEmail = hasSiteContact
                    ? location.siteContactEmail
                    : customer?.email;

                  return (
                    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {label}
                      </div>
                      {contactName && (
                        <div className="text-sm text-zinc-950 dark:text-white">
                          {contactName}
                        </div>
                      )}
                      {contactPhone && (
                        <button
                          type="button"
                          onClick={() => {
                            const phone = contactPhone || '';
                            handleCopy('phone', formatPhone(phone) || phone);
                          }}
                          className="block text-left text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                          title={t('workOrders.detail.copyPhone')}
                        >
                          {copied === 'phone' ? '✓ ' : ''}
                          {formatPhone(contactPhone)}
                        </button>
                      )}
                      {contactEmail && (
                        <a
                          href={`mailto:${contactEmail}`}
                          className="block text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                        >
                          {contactEmail}
                        </a>
                      )}
                    </div>
                  );
                })()}
              </Card>
            )}

            <Card title={t('workOrders.detail.info', { entity: getName('work_order') })}>
              <DescriptionList>
                <DescriptionTerm>{t('workOrders.detail.created')}</DescriptionTerm>
                <DescriptionDetails>{formatDate(workOrder.createdAt)}</DescriptionDetails>

                <DescriptionTerm>{t('workOrders.form.customerOrderNumber')}</DescriptionTerm>
                <DescriptionDetails>
                  <EditableField
                    value={workOrder.customerOrderNumber ?? ''}
                    onSave={(v) => handleSaveWorkOrderField('customerOrderNumber', v || undefined)}
                    disabled={isCancelled || isArchived}
                    placeholder={t('workOrders.form.customerOrderNumberPlaceholder')}
                    ariaLabel={t('workOrders.form.customerOrderNumber')}
                    className="font-mono"
                  />
                </DescriptionDetails>

                <DescriptionTerm>{getName('division')}</DescriptionTerm>
                <DescriptionDetails>
                  <EditableField
                    as="select"
                    value={workOrder.divisionId ?? ''}
                    options={[
                      { value: '', label: t('workOrders.form.divisionPlaceholder') },
                      ...((divisions ?? [])
                        .filter((d) => d.isActive)
                        .map((d) => ({ value: d.id, label: d.name }))),
                    ]}
                    onSave={(v) => handleSaveWorkOrderField('divisionId', v || null)}
                    disabled={isCancelled || isArchived}
                    ariaLabel={getName('division')}
                  />
                </DescriptionDetails>

                <DescriptionTerm>{t('workOrders.form.type')}</DescriptionTerm>
                <DescriptionDetails>
                  <EditableField
                    as="select"
                    value={workOrder.workOrderTypeId ?? ''}
                    options={[
                      { value: '', label: t('workOrders.form.typePlaceholder') },
                      ...((workOrderTypes ?? [])
                        .filter((t) => t.isActive)
                        .map((t) => ({ value: t.id, label: t.name }))),
                    ]}
                    onSave={(v) => handleSaveWorkOrderField('workOrderTypeId', v || null)}
                    disabled={isCancelled || isArchived}
                    ariaLabel={t('workOrders.form.type')}
                  />
                </DescriptionDetails>

                {/* Priority and Scheduled Date moved to the header — see
                    Row 1 (priority pill) and Row 3 (ETA chip) above. The
                    card row used to render them but the header is the
                    glanceable surface and CSRs were seeing the same fact
                    twice. Inline-edit lives in the header now. */}

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
              onSaveDescription={handleSaveWorkItemDescription}
              onEditEquipment={handleEditEquipment}
              onAddEquipment={handleAddEquipmentToWorkItem}
              onSelectSubUnit={handleSelectSubUnit}
              onAddSubUnit={handleAddSubUnit}
            />
          </main>

          {/* Right rail (xl+ only) — same content also appears in the slide-over below. */}
          {/* Right rail — visible on xl+. Independent scroll within its column
              (parent body grid is overflow-hidden + flex-1, so each column owns
              its scroll viewport). */}
          {/* px-1 keeps the rail content (chips, etc.) away from the aside's
              overflow boundary so focus outlines aren't clipped. The
              ActivityStream's sticky header uses -mx-1 px-1 to extend its bg
              back to the aside's edge for a clean visual bleed. */}
          <aside className="mt-6 hidden xl:mt-0 xl:block xl:min-h-0 xl:overflow-y-auto xl:px-1">
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
        serviceLocationId={workOrder.serviceLocationId || workOrder.serviceLocation?.id}
        workItem={editingWorkItem}
        readOnly={isCancelled || isArchived}
      />

      <EquipmentFormDialog
        isOpen={equipmentDialogOpen}
        onClose={() => {
          setEquipmentDialogOpen(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
      />

      {/* Same dialog component, opened in CREATE mode with the WO's service
          location pre-locked. onCreated wires the new equipment back to the
          work item that triggered the flow. */}
      <EquipmentFormDialog
        isOpen={addEquipmentForWorkItem !== null}
        onClose={() => setAddEquipmentForWorkItem(null)}
        equipment={null}
        lockedServiceLocationId={
          workOrder?.serviceLocationId || workOrder?.serviceLocation?.id
        }
        onCreated={handleEquipmentCreatedForWorkItem}
      />

      {/* Sub-unit creation: same dialog, but locked to a parent equipment
          rather than a work item. Used by the chip-row and the in-drawer
          "+ Add" affordance. The new sub-unit inherits the parent's service
          location implicitly on the backend. */}
      <EquipmentFormDialog
        isOpen={addSubUnitParent !== null}
        onClose={() => setAddSubUnitParent(null)}
        equipment={null}
        lockedServiceLocationId={
          workOrder?.serviceLocationId || workOrder?.serviceLocation?.id
        }
        lockedParent={addSubUnitParent}
      />

      {/* Equipment quickview drawer — slides in from the right when a
          sub-unit chip is clicked. Manages its own internal stack for
          drawer-over-drawer recursion. The drawer doesn't expose "+ Add
          unit" because adding from a sub-unit would create depth-2
          equipment (product rule restricts to 2 levels deep); creation
          happens only from the WO row's primary equipment chip row. */}
      <EquipmentQuickViewDrawer
        initialEquipment={drawerEquipment}
        onClose={() => setDrawerEquipment(null)}
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
