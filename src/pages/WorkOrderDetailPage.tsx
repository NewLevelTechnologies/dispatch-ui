import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  dispatchesApi,
  equipmentApi,
  financialSummaryApi,
  invoicesApi,
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  workflowsApi,
  workflowConfigApi,
  type Dispatch,
  type Equipment,
  type ProgressCategory,
  type UpdateWorkOrderRequest,
  type WorkItemResponse,
  type WorkOrderFinancialSummary,
  type WorkOrderPriority,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import ActivityButton from '../components/ActivityButton';
import ActivityDrawer from '../components/ActivityDrawer';
import AppLayout from '../components/AppLayout';
import AssignTechnicianDialog from '../components/AssignTechnicianDialog';
import DispatchDetailDrawer from '../components/DispatchDetailDrawer';
import DispatchesSection from '../components/DispatchesSection';
import EditableField from '../components/EditableField';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentQuickViewDrawer from '../components/EquipmentQuickViewDrawer';
import FinancialDrawer, { type FinancialTab } from '../components/FinancialDrawer';
import WorkItemFormDialog from '../components/WorkItemFormDialog';
import WorkItemsTable from '../components/WorkItemsTable';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import WorkOrderApprovalsCallout from '../features/work-orders/WorkOrderApprovalsCallout';
import { formatPhone } from '../utils/formatPhone';
import { formatExactTimestamp, formatTimestamp } from '../lib/formatTimestamp';
import { TimeAgo } from '../components/TimeAgo';
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
import IconButton from '../components/IconButton';
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from '../components/catalyst/description-list';
import { Link as CatLink } from '../components/catalyst/link';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CalendarIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

const PROGRESS_COLORS: Record<ProgressCategory, 'zinc' | 'sky' | 'blue' | 'amber' | 'lime'> = {
  NOT_STARTED: 'zinc',
  AWAITING_SCHEDULE: 'sky',
  IN_PROGRESS: 'blue',
  BLOCKED: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Priority is rendered as a header chip ONLY when the user has explicitly
// set a non-default value. NORMAL is the implicit default — showing it adds
// zero information and dilutes status visually. LOW, HIGH, and URGENT each
// carry real signal (someone made a deliberate choice) so they earn a chip.
// To set priority from the default state, CSRs go through the Edit WO dialog
// (canonical surface); the inline chip is a click-to-change shortcut for
// already-non-default WOs.
//
// Visual grammar (deliberately distinct from status pills):
//   status pill    = sentence case, no icon, categorical color (sky/lime/zinc/...)
//   priority chip  = ALL CAPS + tracking-wider, leading icon, heat scale
//
// Heat scale runs cold→hot: zinc (LOW, "this can wait") → amber (HIGH) → rose
// (URGENT). LOW shares Badge shape with HIGH/URGENT but uses zinc to stay
// calm — present without demanding attention.
//
// Future EMERGENCY tier (reservation, not deliverable) extends along the same
// axis: color goes ...→rose→red; icon escalates ExclamationTriangle→stronger
// (FireIcon or BoltIcon). Don't add the tier until a real customer ask earns
// it — the URGENT slot already serves "gas leak / flooding / no-heat-winter"
// in current shop usage.
const PRIORITY_CHIP_CONFIG: Partial<
  Record<
    WorkOrderPriority,
    { color: 'zinc' | 'amber' | 'rose'; Icon: typeof ArrowUpIcon; labelKey: string }
  >
> = {
  LOW: { color: 'zinc', Icon: ArrowDownIcon, labelKey: 'low' },
  HIGH: { color: 'amber', Icon: ArrowUpIcon, labelKey: 'high' },
  URGENT: { color: 'rose', Icon: ExclamationTriangleIcon, labelKey: 'urgent' },
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

// Header ETA chip needs a compact same-day window format ("Fri 8–10 AM") so
// the chip stays a single short string. Cross-date windows are rare for service
// commitments; we degrade gracefully to date+time on each side when they happen.
const ETA_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const ETA_TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
function formatEtaWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)}–${ETA_TIME.format(end)}`;
  }
  return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)} – ${ETA_DATE.format(end)} ${ETA_TIME.format(end)}`;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Compact money formatter for header chips: $847, $9.8K, $1.2M.
// Full precision lives in the title tooltip and inside the financial drawer;
// chips are for scanning, not auditing (Phase 7 design §5.1).
function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1000) return `$${Math.round(amount)}`;
  if (abs < 1_000_000) {
    const k = amount / 1000;
    const rounded = Math.round(k * 10) / 10;
    return `$${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}K`;
  }
  const m = amount / 1_000_000;
  const rounded = Math.round(m * 10) / 10;
  return `$${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}M`;
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [copied, setCopied] = useState<'phone' | 'address' | null>(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [financialDrawerOpen, setFinancialDrawerOpen] = useState(false);
  const [financialDrawerInitialTab, setFinancialDrawerInitialTab] =
    useState<FinancialTab>('invoices');
  // Monotonic counters — each increment signals the matching tab to
  // auto-open its create dialog. Used by the chip-row [+ Invoice] /
  // [+ Quote] ghosts so a single click both opens the drawer at the
  // tab AND opens the create dialog (one CSR-visible action, one
  // click).
  const [invoiceCreateSignal, setInvoiceCreateSignal] = useState(0);
  const [quoteCreateSignal, setQuoteCreateSignal] = useState(0);

  // Open the financial drawer at the matching tab. Used by derived chips
  // ($ quoted, $ invoiced, Bal) — explicitly resets BOTH create signals
  // so a stale value from a previous ghost click can't trigger a create
  // dialog to reopen on this navigation.
  const openFinancialDrawer = (tab: FinancialTab) => {
    setFinancialDrawerInitialTab(tab);
    setInvoiceCreateSignal(0);
    setQuoteCreateSignal(0);
    setFinancialDrawerOpen(true);
  };

  const openFinancialDrawerForInvoiceCreate = () => {
    setFinancialDrawerInitialTab('invoices');
    setInvoiceCreateSignal((n) => n + 1);
    setFinancialDrawerOpen(true);
  };

  const openFinancialDrawerForQuoteCreate = () => {
    setFinancialDrawerInitialTab('quotes');
    setQuoteCreateSignal((n) => n + 1);
    setFinancialDrawerOpen(true);
  };
  const [workItemDialogOpen, setWorkItemDialogOpen] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemResponse | null>(null);
  const [editWorkOrderDialogOpen, setEditWorkOrderDialogOpen] = useState(false);
  const [assignDispatchDialogOpen, setAssignDispatchDialogOpen] = useState(false);
  // Same dialog handles edit — when set, the dialog opens prefilled in PUT mode.
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  // Row click opens the read+manage drawer (lifecycle audit, notification
  // history, edit/delete footer). Null = closed.
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
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

  const deleteWorkOrderMutation = useMutation({
    mutationFn: () => workOrderApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      navigate('/work-orders');
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorDelete', { entity: getName('work_order') }));
    },
  });

  const handleDeleteWorkOrder = () => {
    const name = workOrder?.workOrderNumber || (workOrder ? `#${workOrder.id.slice(0, 8)}` : '');
    if (!window.confirm(t('common.actions.deleteConfirm', { name }))) return;
    deleteWorkOrderMutation.mutate();
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

  // N shortcut → open the activity drawer when it's closed. Once the drawer
  // opens the composer mounts and grabs focus via its autoFocus prop; any
  // subsequent N press while the drawer is open is handled by the composer's
  // own listener (refocus the textarea if the user clicked elsewhere).
  useEffect(() => {
    if (activityDrawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
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
      setActivityDrawerOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activityDrawerOpen]);

  // W shortcut → open the work item dialog in create mode. Mirrors the N
  // shortcut: ignored when an input is focused, when modifier keys are held,
  // or when the dialog is already open. Re-binds on open-state change so the
  // closed-only check is reliable.
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

  // Phase 7 §6 ask #1 — live financial rollup from financial-service.
  // Fires in parallel with the WO query (per backend handoff). Endpoint
  // always returns 200 with zero totals when the WO has no activity OR
  // doesn't exist (RLS) — treat zeros as "nothing to show," not as error.
  const { data: financialSummary } = useQuery<WorkOrderFinancialSummary>({
    queryKey: ['financialSummary', id],
    queryFn: () => financialSummaryApi.getByWorkOrder(id!),
    enabled: !!id,
  });

  // §5.2 Bal color signal — rose when ANY invoice on the WO is OVERDUE.
  // The drawer's Invoices tab already keys on ['workOrderInvoices', id]
  // so subscribing here just reads its cache when the drawer has been
  // opened, or fetches when it hasn't. Cheap; one round-trip on first
  // page load.
  const { data: invoicesForOverdue = [] } = useQuery({
    queryKey: ['workOrderInvoices', id],
    queryFn: () => invoicesApi.getByWorkOrder(id!),
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

  const { data: workflowConfig } = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => workflowConfigApi.get(),
  });

  // Resolve the workflow for this WO's type, then its transitions. The
  // status pill consumes the transition list to decide allowed moves under
  // Strict enforcement. Two-step fetch because the list endpoint is summary-
  // only — transitions[] only lands on the detail call.
  const { data: workflowList = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.getAll(),
  });
  const matchingWorkflowId = workOrder?.workOrderTypeId
    ? workflowList.find((w) => w.workOrderTypeId === workOrder.workOrderTypeId)?.id
    : undefined;
  const { data: activeWorkflow } = useQuery({
    queryKey: ['workflow', matchingWorkflowId],
    queryFn: () => workflowsApi.getById(matchingWorkflowId!),
    enabled: Boolean(matchingWorkflowId),
  });
  const workflowTransitions = activeWorkflow?.transitions ?? [];

  // Same query key as DispatchesSection — React Query dedupes the actual fetch.
  // Read here so the header ETA can derive from the next non-cancelled dispatch.
  // WO-scoped read returns a plain array (listForWorkOrder tolerates both shapes).
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches', { workOrderId: id }],
    queryFn: () => dispatchesApi.listForWorkOrder(id!),
    enabled: !!id,
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
          flow with a non-sticky header (mobile redesign is queued; the sticky
          treatment was getting in the way more than helping). */}
      <div className="flex flex-col lg:h-[calc(100svh-7rem)] lg:overflow-hidden">
        {/* Header — static block below lg, layout-row on lg+ where the parent
            has overflow-hidden and the body grid scrolls per-column. */}
        <div className="border-b border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900 lg:shrink-0">
          {/* Back link */}
          <div className="mb-2">
            <Button plain onClick={() => navigate('/work-orders')}>
              <ArrowLeftIcon className="size-4" />
              {t('common.actions.backTo', { entities: getName('work_order', true) })}
            </Button>
          </div>

          {/* Row 1 — identity & state on the left, action cluster on the
              right. Priority pill is click-to-edit (matches the work-item
              status pill pattern). The action cluster (Activity / Edit /
              overflow) lives on the right edge of this row instead of in its
              own row — three small buttons don't earn a dedicated strip. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
            {(() => {
              // Non-default priority chip: silent for NORMAL, present in
              // distinct grammar when LOW/HIGH/URGENT. See the
              // PRIORITY_CHIP_CONFIG comment above for the reasoning.
              // Cancelled/archived WOs render the chip read-only (no
              // dropdown); active WOs wrap it in a dropdown so a CSR can
              // change it without leaving the page.
              const cfg = PRIORITY_CHIP_CONFIG[priority];
              if (!cfg) return null;
              const { color, Icon, labelKey } = cfg;
              const label = t(`workOrders.priority.${labelKey}`).toUpperCase();
              const badge = (
                <Badge color={color} className="tracking-wider">
                  <Icon className="size-3" />
                  {label}
                </Badge>
              );
              if (isCancelled || isArchived) return badge;
              return (
                <Dropdown>
                  <DropdownButton
                    as="button"
                    type="button"
                    className="cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={t('workOrders.form.priority')}
                  >
                    {badge}
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
              );
            })()}
            <Text className="!text-sm !text-zinc-500" title={formatExactTimestamp(workOrder.updatedAt)}>
              {t('workOrders.detail.lastUpdated', { time: formatTimestamp(workOrder.updatedAt) })}
            </Text>
            <div className="ml-auto flex items-center gap-2">
              <ActivityButton
                workOrderId={workOrder.id}
                drawerOpen={activityDrawerOpen}
                onOpen={() => setActivityDrawerOpen(true)}
              />
              <Button
                outline
                onClick={() => setEditWorkOrderDialogOpen(true)}
                disabled={isCancelled || isArchived}
                className="border-border text-fg-strong hover:bg-bg-hover dark:border-border dark:text-fg-strong dark:hover:bg-bg-hover"
                title={
                  isCancelled || isArchived
                    ? t('workOrders.detail.frozen')
                    : undefined
                }
              >
                <PencilIcon data-slot="icon" />
                {t('common.edit')}
              </Button>
              <Dropdown>
                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                  <EllipsisHorizontalIcon className="size-4" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  <DropdownItem disabled>
                    <DropdownLabel>{t('workOrders.detail.print')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem disabled>
                    <DropdownLabel>{t('workOrders.detail.duplicate')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem onClick={handleDeleteWorkOrder}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          {/* Row 2 — B2B context + ETA. Customer name is a thin breadcrumb;
              the operational location identity (name + address + site
              contact) lives in the Service Location card on the left strip,
              not here. ETA is read-only display: a WO can have multiple
              dispatches and each commits a customer-facing arrival WINDOW
              (e.g. "Fri 8–10 AM") rather than a single point. The chip
              prefers the next non-cancelled dispatch's window as the
              authoritative "when is this happening" answer. Falls back to
              workOrder.scheduledDate (editable via Edit WO dialog) when no
              dispatches exist yet — that's the planning-stage ETA before
              anyone is actually assigned, and is intentionally date-only. */}
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
            {(() => {
              const nextDispatch = [...dispatches]
                .filter((d) => d.status !== 'CANCELLED')
                .sort(
                  (a, b) =>
                    new Date(a.arrivalWindowStart).getTime() -
                    new Date(b.arrivalWindowStart).getTime()
                )[0];
              const etaText = nextDispatch
                ? formatEtaWindow(
                    nextDispatch.arrivalWindowStart,
                    nextDispatch.arrivalWindowEnd
                  )
                : workOrder.scheduledDate
                  ? formatDate(workOrder.scheduledDate)
                  : null;
              return (
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="size-4" />
                  <span>
                    {etaText
                      ? t('workOrders.detail.eta', { date: etaText })
                      : t('workOrders.detail.notScheduled')}
                  </span>
                </span>
              );
            })()}
          </div>

          {/* Row 3 — money chips (Phase 7 §5).
              §5.3 reveal logic (post-drawer-shell): the row is the canonical
              financial entry surface, not just a display.
                Active WO  → row always renders. NTE on the left (set or
                             ghost); right cluster is either live derived
                             chips (when summary non-zero) or a typed ghost
                             cluster ("+ Invoice") that opens the drawer at
                             the matching tab.
                Frozen WO  → row renders only when there's something to
                             show (NTE set OR non-zero summary). No ghost
                             affordances — cancelled/archived WOs can't
                             invoice.
              §5.2 Bal color: zinc default; amber when invoiced > 0 AND
              paid = 0. Rose-on-OVERDUE waits on ask #2.
              BigDecimal handling: amounts arrive as strings (see
              WorkOrderFinancialSummary). parseFloat is fine for display
              decisions (formatter and >0 checks); never use parseFloat
              output for write-side arithmetic.
              Click routing (§3.2):
                $ quoted    → drawer, Quotes tab (7b)
                $ invoiced  → drawer, Invoices tab
                $ paid      → plain text, no click (§5.1 — payments live
                              inside invoice expansions, no tab to route
                              to)
                Bal         → drawer, Invoices tab
                [+ Quote]   → drawer, Quotes tab (7b)
                [+ Invoice] → drawer, Invoices tab */}
          {(() => {
            const hasNte = workOrder.notToExceed != null;
            const quotedAmt = financialSummary?.quoted
              ? parseFloat(financialSummary.quoted) || 0
              : 0;
            const invoicedAmt = financialSummary
              ? parseFloat(financialSummary.invoiced) || 0
              : 0;
            const paidAmt = financialSummary
              ? parseFloat(financialSummary.paid) || 0
              : 0;
            const balanceAmt = financialSummary
              ? parseFloat(financialSummary.balance) || 0
              : 0;
            const hasDerivedActivity =
              quotedAmt > 0 || invoicedAmt > 0 || paidAmt > 0 || balanceAmt > 0;
            const frozen = isCancelled || isArchived;

            // Frozen WOs: only render the row when there's something
            // worth showing. Active WOs always render — the typed ghost
            // cluster fills the row's bootstrap role.
            if (frozen && !hasNte && !hasDerivedActivity) return null;

            const showNteSlot = hasNte || !frozen;
            // Both ghosts are bootstrap-only — they retire once the
            // matching entity has activity on the WO. After that, the
            // CSR is already going through the drawer for status /
            // related-record reasons, and the in-drawer + New CTA is
            // the natural next click.
            //
            // Exception worth flagging: a CSR sometimes needs a follow
            // -up quote (or invoice) on a WO that already has activity
            // — that path remains 3 clicks (chip → tab → +New). If real
            // CSR feedback shows that's a friction point on a specific
            // entity, revisit per-entity.
            const showQuoteGhost = !frozen && quotedAmt === 0;
            const showInvoiceGhost = !frozen && invoicedAmt === 0;
            const showTypedGhosts = showQuoteGhost || showInvoiceGhost;
            // §5.2 Bal palette:
            //   rose  → any invoice on the WO is OVERDUE (highest signal)
            //   amber → invoiced > 0 and paid = 0 (outstanding, not late yet)
            //   zinc  → balance is 0 OR partial-pay with nothing overdue
            // Rose takes priority over amber — once an invoice is late,
            // that's the headline state regardless of partial payments.
            const hasOverdueInvoice = invoicesForOverdue.some(
              (inv) => inv.status === 'OVERDUE',
            );
            const balPalette = hasOverdueInvoice
              ? 'rose'
              : invoicedAmt > 0 && paidAmt === 0
                ? 'amber'
                : 'zinc';
            const balClasses =
              balPalette === 'rose'
                ? 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-300'
                : balPalette === 'amber'
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-white/5 dark:text-zinc-300';
            // Shared chip-button affordance: hover ring + pointer cursor.
            // Catalyst Button is too heavy for inline chips; a plain
            // <button> with the chip surface styling keeps the visual
            // density while staying accessible.
            const chipButtonClass =
              'inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

            const nteValueChip = (num: number) => (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-white/5 dark:text-zinc-300"
                title={currencyFormatter.format(num)}
              >
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('workOrders.detail.money.nte')}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCompactCurrency(num)}
                </span>
              </span>
            );

            return (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {showNteSlot &&
                  (frozen
                    ? nteValueChip(workOrder.notToExceed as number)
                    : (
                      <EditableField
                        value={
                          workOrder.notToExceed != null
                            ? String(workOrder.notToExceed)
                            : ''
                        }
                        onSave={async (raw) => {
                          const trimmed = raw.trim().replace(/[$,\s]/g, '');
                          if (trimmed === '') {
                            await handleSaveWorkOrderField('notToExceed', null);
                            return;
                          }
                          const num = Number(trimmed);
                          if (!Number.isFinite(num) || num < 0) {
                            alert(t('workOrders.form.notToExceedInvalid'));
                            throw new Error('invalid NTE');
                          }
                          await handleSaveWorkOrderField('notToExceed', num);
                        }}
                        placeholder={t('workOrders.form.notToExceedPlaceholder')}
                        ariaLabel={t('workOrders.form.notToExceed')}
                        inputClassName="!w-32"
                        renderDisplay={(v) => {
                          if (!v) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                                + {t('workOrders.detail.setNte')}
                              </span>
                            );
                          }
                          return nteValueChip(Number(v));
                        }}
                      />
                    ))}

                {showNteSlot && (hasDerivedActivity || showTypedGhosts) && (
                  <span
                    className="inline-block h-4 w-px bg-zinc-300 dark:bg-zinc-600"
                    aria-hidden="true"
                  />
                )}

                {hasDerivedActivity && (
                  <>
                    {quotedAmt > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => openFinancialDrawer('quotes')}
                          title={currencyFormatter.format(quotedAmt)}
                          aria-label={getName('quote', true)}
                          className={`${chipButtonClass} bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10`}
                        >
                          <span className="font-medium tabular-nums">
                            {formatCompactCurrency(quotedAmt)}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {t('workOrders.detail.money.quoted')}
                          </span>
                        </button>
                        <span
                          className="text-zinc-300 dark:text-zinc-600"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openFinancialDrawer('invoices')}
                      title={currencyFormatter.format(invoicedAmt)}
                      aria-label={getName('invoice', true)}
                      className={`${chipButtonClass} bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10`}
                    >
                      <span className="font-medium tabular-nums">
                        {formatCompactCurrency(invoicedAmt)}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t('workOrders.detail.money.invoiced')}
                      </span>
                    </button>
                    <span
                      className="text-zinc-300 dark:text-zinc-600"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    {/* $ paid is plain text, not a button (§3.2 / §5.1).
                        Payments live inside invoice row expansions in the
                        drawer (§3.3 fold), so there's no single tab to
                        route this chip to. Demoted to display preserves
                        the reconciled-story at-a-glance number without
                        promising a click target that doesn't exist. */}
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300"
                      title={currencyFormatter.format(paidAmt)}
                    >
                      <span className="font-medium tabular-nums">
                        {formatCompactCurrency(paidAmt)}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t('workOrders.detail.money.paid')}
                      </span>
                    </span>
                    <span
                      className="text-zinc-300 dark:text-zinc-600"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => openFinancialDrawer('invoices')}
                      title={currencyFormatter.format(balanceAmt)}
                      aria-label={t('workOrders.detail.money.balance')}
                      className={`${chipButtonClass} ${balClasses} ${
                        balPalette === 'rose'
                          ? 'hover:bg-rose-100 dark:hover:bg-rose-500/20'
                          : balPalette === 'amber'
                            ? 'hover:bg-amber-100 dark:hover:bg-amber-500/20'
                            : 'hover:bg-zinc-200 dark:hover:bg-white/10'
                      }`}
                    >
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {t('workOrders.detail.money.balanceShort')}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCompactCurrency(balanceAmt)}
                      </span>
                    </button>
                  </>
                )}

                {hasDerivedActivity && showTypedGhosts && (
                  // Separate the "data" cluster (live derived chips) from
                  // the "actions" cluster (create ghosts) with a vertical
                  // bar — matches the NTE-vs-data divider so the row reads
                  // as three groups: identity · data · actions.
                  <span
                    className="inline-block h-4 w-px bg-zinc-300 dark:bg-zinc-600"
                    aria-hidden="true"
                  />
                )}

                {showTypedGhosts && (
                  // Typed ghost create-entry. [+ Quote] always visible on
                  // active WOs (additional-work-needs-quoting flow).
                  // [+ Invoice] retires once any invoice exists (§5.3 +
                  // CSR feedback).
                  <>
                    {showQuoteGhost && (
                      <button
                        type="button"
                        onClick={openFinancialDrawerForQuoteCreate}
                        aria-label={getName('quote', true)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
                      >
                        + {getName('quote')}
                      </button>
                    )}
                    {showQuoteGhost && showInvoiceGhost && (
                      <span
                        className="text-zinc-300 dark:text-zinc-600"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                    )}
                    {showInvoiceGhost && (
                      <button
                        type="button"
                        onClick={openFinancialDrawerForInvoiceCreate}
                        aria-label={getName('invoice', true)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
                      >
                        + {getName('invoice')}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Approval callout — self-contained per workflow approval engine spec.
            Renders only when this WO has at least one pending approval. */}
        <div className="px-4 pt-3">
          <WorkOrderApprovalsCallout workOrderId={workOrder.id} />
        </div>

        {/* Body grid (§5d — right rail removed; activity is in a drawer):
            - <lg: stacked, document-level scroll
            - lg+: 2-col (left strip + main); each column owns its scroll. */}
        <div className="p-4 lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
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
                <DescriptionDetails><TimeAgo iso={workOrder.createdAt} /></DescriptionDetails>

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

                {/* NTE moved to header chip row (Phase 7 §5.4 single-surface
                    migration). Wiring preserved verbatim — same EditableField,
                    same handleSaveWorkOrderField('notToExceed', ...) path. */}

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
                    <DescriptionDetails><TimeAgo iso={workOrder.completedDate} /></DescriptionDetails>
                  </>
                )}
              </DescriptionList>
            </Card>
          </aside>

          {/* Main canvas — work items sit above dispatches because work items
              are the substance of the WO ("what's wrong with my service?" is
              the highest-volume CSR question on inbound calls), while the
              sticky header's primary ETA already answers "who's coming next?"
              without scrolling. Both sections render read-only when the WO is
              frozen. */}
          <main className="mt-6 lg:mt-0 lg:min-h-0 lg:overflow-y-auto">
            <WorkItemsTable
              workOrderId={workOrder.id}
              workItems={workOrder.workItems ?? []}
              statuses={workItemStatuses}
              transitions={workflowTransitions}
              enforceWorkflow={workflowConfig?.enforcementMode === 'STRICT'}
              readOnly={isCancelled || isArchived}
              onAdd={() => {
                setEditingWorkItem(null);
                setWorkItemDialogOpen(true);
              }}
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
            <DispatchesSection
              workOrderId={workOrder.id}
              readOnly={isCancelled || isArchived}
              onAssign={() => {
                setEditingDispatch(null);
                setAssignDispatchDialogOpen(true);
              }}
              onEdit={(d) => {
                setEditingDispatch(d);
                setAssignDispatchDialogOpen(true);
              }}
              onSelect={(d) => setSelectedDispatch(d)}
            />
          </main>
        </div>
      </div>

      {/* Activity drawer (§5d) — single page-level entry point for both reading
          activity and writing notes. Composer at top autofocuses on open;
          stream below virtualizes its history. ActiveDispatchesWidget lives
          elsewhere once phase 6 ships. */}
      <ActivityDrawer
        open={activityDrawerOpen}
        onClose={() => setActivityDrawerOpen(false)}
        workOrderId={workOrder.id}
      />

      {/* Financial drawer (§3) — opened from chip-row clicks. Single mount;
          `initialTab` controls which tab is active on each open. Tab content
          is stubbed in this branch ("Coming soon") and fills in as backend
          asks #2–#6 land. */}
      <FinancialDrawer
        open={financialDrawerOpen}
        onClose={() => setFinancialDrawerOpen(false)}
        workOrderId={workOrder.id}
        workOrderNumber={woDisplayNumber}
        // Prefer the enriched `customer.id` over the root `customerId`.
        // The detail endpoint reliably populates the nested object; the
        // root field is typed as required but has been observed missing
        // in production responses for some WOs. Fall back either way so
        // we never silently submit `customerId: undefined`.
        customerId={customer?.id ?? workOrder.customerId ?? ''}
        customerName={customer?.name ?? ''}
        initialTab={financialDrawerInitialTab}
        openInvoiceCreateSignal={invoiceCreateSignal}
        openQuoteCreateSignal={quoteCreateSignal}
      />

      {/* Dispatch detail drawer — row body click opens this with the
          dispatch's lifecycle audit + notification history. Edit handoff
          closes the drawer and opens the AssignTechnicianDialog in edit
          mode. Delete fires the dispatches mutation directly. */}
      <DispatchDetailDrawer
        dispatch={selectedDispatch}
        readOnly={isCancelled || isArchived}
        onClose={() => setSelectedDispatch(null)}
        onEdit={(d) => {
          setSelectedDispatch(null);
          setEditingDispatch(d);
          setAssignDispatchDialogOpen(true);
        }}
        onDelete={async (d) => {
          if (!window.confirm(t('workOrders.dispatches.deleteConfirm'))) return;
          try {
            await dispatchesApi.delete(d.id);
            queryClient.invalidateQueries({ queryKey: ['dispatches'] });
            queryClient.invalidateQueries({
              queryKey: ['work-order-activity', d.workOrderId],
            });
            setSelectedDispatch(null);
          } catch (err: unknown) {
            const msg =
              err instanceof Error && 'response' in err
                ? (err as { response?: { data?: { message?: string } } })
                    .response?.data?.message
                : undefined;
            alert(msg || t('workOrders.dispatches.deleteError'));
          }
        }}
      />

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

      <WorkOrderFormDialog
        isOpen={editWorkOrderDialogOpen}
        onClose={() => setEditWorkOrderDialogOpen(false)}
        workOrder={workOrder}
      />

      <AssignTechnicianDialog
        isOpen={assignDispatchDialogOpen}
        onClose={() => {
          setAssignDispatchDialogOpen(false);
          setEditingDispatch(null);
        }}
        workOrderId={workOrder.id}
        dispatch={editingDispatch}
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
