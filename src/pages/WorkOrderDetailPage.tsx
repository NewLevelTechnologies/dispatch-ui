import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  dispatchesApi,
  equipmentApi,
  financialSummaryApi,
  invoicesApi,
  quotesApi,
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  workflowsApi,
  workflowConfigApi,
  workOrderFilesApi,
  purchaseOrderApi,
  type Dispatch,
  type Equipment,
  type ProgressCategory,
  type ServiceLocationDetailDto,
  type UpdateWorkOrderRequest,
  type WorkItemResponse,
  type WorkOrderFinancialSummary,
  type WorkOrderPriority,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import ActivityButton from '../components/ActivityButton';
import ActivityDrawer from '../components/ActivityDrawer';
import ActivityStream from '../components/ActivityStream';
import AppLayout from '../components/AppLayout';
import DispatchFormDrawer from '../components/DispatchFormDrawer';
import DispatchDetailDrawer from '../components/DispatchDetailDrawer';
import DispatchesTab from '../components/DispatchesTab';
import EditableField from '../components/EditableField';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentQuickViewDrawer from '../components/EquipmentQuickViewDrawer';
import FinancialInvoicesTab from '../components/FinancialInvoicesTab';
import FinancialQuotesTab from '../components/FinancialQuotesTab';
import WorkItemFormDialog from '../components/WorkItemFormDialog';
import WorkItemsTab from '../components/WorkItemsTab';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import WorkOrderApprovalsCallout from '../features/work-orders/WorkOrderApprovalsCallout';
import WorkOrderOverview from '../features/work-orders/WorkOrderOverview';
import { tripsByWorkItem } from '../utils/tripsByWorkItem';
import WorkOrderFilesTab from '../components/WorkOrderFilesTab';
import WorkOrderPurchasingTab from '../components/WorkOrderPurchasingTab';
import { formatPhone } from '../utils/formatPhone';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { roleAccent } from '../utils/roleColor';
import { formatExactTimestamp, formatTimestamp } from '../lib/formatTimestamp';
import { TimeAgo } from '../components/TimeAgo';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { LoadingState } from '../components/ui/LoadingState';
import { Tabs } from '../components/ui/Tabs';
import { Pill, Tag } from '../components/ui/Pill';
import { Card } from '../components/catalyst/card';
import { CardTitle } from '../components/customer-detail/shared';
import { Button } from '../components/catalyst/button';
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
import { useUrlTab } from '../hooks/useUrlTab';
import {
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
  MapIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { PremiseMark } from '../components/ui/PremiseMark';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

// progressCategory → header status-pill tone. Shares the work-item peek grammar.
const PROGRESS_PILL_TONE: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'violet',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Priority is a header Pill toned by heat: Urgent=danger, High=warning,
// Normal/Low=neutral (Low present but calm). On active WOs it's click-to-change
// (matches the work-item status pill pattern); frozen WOs render it read-only.
const PRIORITY_PILL: Record<WorkOrderPriority, { tone: PillTone; dot: boolean; labelKey: string }> = {
  LOW: { tone: 'neutral', dot: false, labelKey: 'low' },
  NORMAL: { tone: 'neutral', dot: false, labelKey: 'normal' },
  HIGH: { tone: 'warning', dot: true, labelKey: 'high' },
  URGENT: { tone: 'danger', dot: true, labelKey: 'urgent' },
};

const PRIORITY_TRANSLATION_KEYS: Record<WorkOrderPriority, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

const TAB_IDS = ['overview', 'items', 'trips', 'estimate', 'purchasing', 'files', 'activity'] as const;
type WorkOrderTab = (typeof TAB_IDS)[number];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  // Smart back — honor ?from=purchasing (the cross-job Purchasing list),
  // else the entity list.
  const fromPurchasing = searchParams.get('from') === 'purchasing';
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [copied, setCopied] = useState<'phone' | 'address' | null>(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [tab, setTab] = useUrlTab<WorkOrderTab>(TAB_IDS, 'overview');
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

  // Full service-location record — premise, gate/arrival facts, access notes,
  // pinned site note for the Overview Location card. Same endpoint + cache key
  // as the (shipped) Location detail page, so it's frequently warm.
  const serviceLocationId = workOrder?.serviceLocationId || workOrder?.serviceLocation?.id;
  const { data: locationDetail } = useQuery<ServiceLocationDetailDto>({
    queryKey: ['service-location', serviceLocationId],
    queryFn: () => customerApi.getServiceLocationById(serviceLocationId!),
    enabled: !!serviceLocationId,
  });

  // Live financial rollup (financial-service). Feeds the Overview Money card.
  // Always 200 with zero totals when there's no activity — treat zeros as
  // "nothing to show," not an error.
  const { data: financialSummary } = useQuery<WorkOrderFinancialSummary>({
    queryKey: ['financialSummary', id],
    queryFn: () => financialSummaryApi.getByWorkOrder(id!),
    enabled: !!id,
  });

  // Document counts for the Quotes & invoices tab badge. Reuse the same query
  // keys the financial tabs use so they dedupe.
  const { data: invoicesForCount = [] } = useQuery({
    queryKey: ['workOrderInvoices', id],
    queryFn: () => invoicesApi.getByWorkOrder(id!),
    enabled: !!id,
  });
  const { data: quotesForCount = [] } = useQuery({
    queryKey: ['workOrderQuotes', id],
    queryFn: () => quotesApi.getByWorkOrder(id!),
    enabled: !!id,
  });

  // Files tab badge — the list envelope carries the global `all` count. Keyed
  // under ['work-order-files', id, …] so uploads/deletes (which invalidate that
  // prefix) refresh the badge too.
  const { data: fileCount } = useQuery({
    queryKey: ['work-order-files', id, 'count'],
    queryFn: () => workOrderFilesApi.list(id!, { limit: 1 }),
    enabled: !!id,
    select: (page) => page.counts?.all ?? page.content.length,
  });

  // Purchasing tab badge — shares the WorkOrderPurchasingTab's exact query
  // (['purchase-orders', id] + size 100) so the badge and the tab's own count
  // are the same number from one fetch. Counts content (not totalElements,
  // which the backend reports unreliably for small page sizes).
  const { data: poCount } = useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => purchaseOrderApi.list({ workOrderId: id!, size: 100 }),
    enabled: !!id,
    select: (page) => page.content.length,
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
  // Read here so the Overview trip strip + attention can derive from dispatches.
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches', { workOrderId: id }],
    queryFn: () => dispatchesApi.listForWorkOrder(id!),
    enabled: !!id,
  });
  // Positional trip numbers per work item — shared with the overview peek so
  // the Work items tab header/footer never drift from it. (Hook stays above any
  // early return.)
  const wiTrips = useMemo(() => tripsByWorkItem(dispatches), [dispatches]);

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
        <LoadingState label={t('common.actions.loading', { entities: getName('work_order', true) })} />
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
          <Button className="mt-4" onClick={() => navigate(fromPurchasing ? '/purchasing' : '/work-orders')}>
            <ArrowLeftIcon className="size-4" />
            {fromPurchasing
              ? t('common.actions.backTo', { entities: t('entities.purchasing') })
              : t('common.actions.backTo', { entities: getName('work_order', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const customer = workOrder.customer;
  const location = workOrder.serviceLocation;

  const isCancelled = workOrder.lifecycleState === 'CANCELLED';
  const isArchived = !!workOrder.archivedAt;
  const frozen = isCancelled || isArchived;
  const priority = workOrder.priority ?? 'NORMAL';

  const woDisplayNumber = workOrder.workOrderNumber || `#${workOrder.id.slice(0, 8)}`;

  // Location-led H1: site name when known, else the WO number.
  const headerTitle = location?.locationName || woDisplayNumber;

  // Premise tag (Residence / Business) from the full location record.
  const premiseLabel = locationDetail
    ? locationDetail.premiseType === 'RESIDENCE'
      ? t('workOrders.detail.premiseResidence')
      : t('workOrders.detail.premiseBusiness')
    : null;

  // WO type → name + accent dot color; division → name (Tag).
  const woType = (workOrderTypes ?? []).find((wt) => wt.id === workOrder.workOrderTypeId);
  const woDivision = (divisions ?? []).find((d) => d.id === workOrder.divisionId);

  // Job essence: backend `summary`, else the first work item + "+N more".
  // Mirrors deriveJobLabel on the Location detail page. The header span clamps
  // it (below) so a summary-less fetch shows a snippet, not the whole blurb.
  const summary = workOrder.summary;
  const firstItem = workOrder.workItems?.[0]?.description;
  const moreItems = Math.max(0, (workOrder.workItemCount ?? 0) - 1);
  const essence = summary || (firstItem ? (moreItems > 0 ? `${firstItem} +${moreItems} more` : firstItem) : null);

  const sitePhone = location?.siteContactPhone || customer?.phone;
  // DB stores addresses uppercase — title-case street + city for display
  // (state code stays as-is); keep a raw query string for the maps link.
  const addr = location?.address;
  const displayAddress = addr
    ? `${titleCaseAddress(addr.streetAddress)}, ${titleCaseAddress(addr.city)}, ${addr.state} ${addr.zipCode}`
    : '';
  const mapsQuery = addr
    ? `${addr.streetAddress}, ${addr.city}, ${addr.state} ${addr.zipCode}`
    : '';

  const handleAddWorkItem = () => {
    setTab('items');
    setEditingWorkItem(null);
    setWorkItemDialogOpen(true);
  };

  const openFinancialTab = () => setTab('estimate');

  // Deep-link a work item from the overview peek: switch to the Items tab and
  // hand the target id to WorkItemsTab (scroll + brief highlight). Kept in the
  // URL (?item=) so a shared/refreshed link re-focuses the same item.
  const openWorkItem = (workItemId: string) => {
    setSearchParams((prev) => {
      prev.set('tab', 'items');
      prev.set('item', workItemId);
      return prev;
    });
  };
  const focusWorkItemId = searchParams.get('item');

  const tabItems: { id: WorkOrderTab; label: string; count?: number }[] = [
    { id: 'overview', label: t('workOrders.detail.tabs.overview') },
    { id: 'items', label: getName('work_item', true), count: workOrder.workItemCount ?? workOrder.workItems?.length ?? 0 },
    { id: 'trips', label: getName('dispatch', true), count: dispatches.filter((d) => d.status !== 'CANCELLED').length },
    {
      id: 'estimate',
      label: t('workOrders.detail.tabs.documents'),
      count: invoicesForCount.length + quotesForCount.length,
    },
    { id: 'purchasing', label: t('workOrders.detail.tabs.purchasing'), count: poCount },
    { id: 'files', label: t('workOrders.detail.tabs.files'), count: fileCount },
    { id: 'activity', label: t('workOrders.detail.tabs.activity') },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1240px]">
        {/* Smart back */}
        <Button plain onClick={() => navigate(fromPurchasing ? '/purchasing' : '/work-orders')} className="mb-2">
          <ArrowLeftIcon className="size-4" />
          {fromPurchasing
            ? t('common.actions.backTo', { entities: t('entities.purchasing') })
            : t('common.actions.backTo', { entities: getName('work_order', true) })}
        </Button>

        {/* Header — location-led identity + classification + actions. */}
        <div className="rounded-[10px] border border-border bg-bg-elev px-4 py-3.5">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            {/* Location-led mark — premise glyph (house/building) carries
                what/where; a priority ring rides on top only when elevated
                (Urgent = danger, High = warning). Matches the Location detail
                header; renders once the location detail (premiseType) loads. */}
            {locationDetail && (
              <PremiseMark
                premise={locationDetail.premiseType}
                size="lg"
                ring={priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : undefined}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Heading level={1} size="page-sm" className="m-0">{headerTitle}</Heading>
                {premiseLabel && <Tag>{premiseLabel}</Tag>}
                {/* Priority — click-to-change on active WOs, read-only when frozen. */}
                {(() => {
                  const cfg = PRIORITY_PILL[priority];
                  const pill = (
                    <Pill tone={cfg.tone} dot={cfg.dot}>
                      {t(`workOrders.priority.${cfg.labelKey}`)}
                    </Pill>
                  );
                  if (frozen) return pill;
                  return (
                    <Dropdown>
                      <DropdownButton
                        as="button"
                        type="button"
                        className="cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        aria-label={t('workOrders.form.priority')}
                      >
                        {pill}
                      </DropdownButton>
                      <DropdownMenu anchor="bottom start">
                        {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as WorkOrderPriority[])
                          .filter((p) => p !== priority)
                          .map((p) => (
                            <DropdownItem key={p} onClick={() => handleSaveWorkOrderField('priority', p)}>
                              <DropdownLabel>{t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[p]}`)}</DropdownLabel>
                            </DropdownItem>
                          ))}
                      </DropdownMenu>
                    </Dropdown>
                  );
                })()}
                <Pill tone={PROGRESS_PILL_TONE[workOrder.progressCategory]} dot>
                  {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
                </Pill>
                {isCancelled && <Pill tone="neutral">{t('workOrders.actions.cancelledBadge')}</Pill>}
                {isArchived && <Pill tone="neutral">{t('workOrders.actions.archived')}</Pill>}
                {woDivision && <Tag>{woDivision.name}</Tag>}
                {woType && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11.5px] font-semibold text-fg-strong">
                    <span
                      className="size-[7px] rounded-full"
                      style={{ background: roleAccent(woType.accentId, woType.name) }}
                    />
                    {woType.name}
                  </span>
                )}
              </div>

              {/* Meta line — render only populated items. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
                {displayAddress && <span className="font-medium text-fg-strong">{displayAddress}</span>}
                {displayAddress && <span className="text-fg-dim">·</span>}
                <span className="font-mono">{woDisplayNumber}</span>
                {essence && (
                  <>
                    <span className="text-fg-dim">·</span>
                    {/* Glanceable job essence — clamp so a long work-item
                        description (no backend summary) doesn't dump the whole
                        blurb into the header. Full text on hover. */}
                    <span className="max-w-[42ch] truncate text-fg-strong" title={essence}>
                      {essence}
                    </span>
                  </>
                )}
                <span className="text-fg-dim">·</span>
                <span title={formatExactTimestamp(workOrder.createdAt)}>
                  {t('workOrders.detail.openedAt', { time: formatDate(workOrder.createdAt) })}
                </span>
                {workOrder.customerOrderNumber && (
                  <>
                    <span className="text-fg-dim">·</span>
                    <span>
                      {t('workOrders.form.customerOrderNumber')} <span className="font-mono text-fg-strong">{workOrder.customerOrderNumber}</span>
                    </span>
                  </>
                )}
                <span className="text-fg-dim">·</span>
                <span title={formatExactTimestamp(workOrder.updatedAt)}>
                  {t('workOrders.detail.lastUpdated', { time: formatTimestamp(workOrder.updatedAt) })}
                </span>
              </div>
            </div>

            {/* Action cluster */}
            <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
              {sitePhone && (
                <Button outline size="xs" onClick={() => handleCopy('phone', formatPhone(sitePhone) || sitePhone)}>
                  <PhoneIcon data-slot="icon" />
                  {copied === 'phone' ? t('workOrders.detail.copied') : t('workOrders.detail.callSite')}
                </Button>
              )}
              {mapsQuery && (
                <Button
                  outline
                  size="xs"
                  onClick={() =>
                    window.open(
                      `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`,
                      '_blank',
                      'noopener',
                    )
                  }
                >
                  <MapIcon data-slot="icon" />
                  {t('workOrders.detail.directions')}
                </Button>
              )}
              <ActivityButton
                workOrderId={workOrder.id}
                drawerOpen={activityDrawerOpen}
                onOpen={() => setActivityDrawerOpen(true)}
              />
              <Button
                outline
                size="xs"
                onClick={() => setEditWorkOrderDialogOpen(true)}
                disabled={frozen}
                title={frozen ? t('workOrders.detail.frozen') : undefined}
              >
                <PencilIcon data-slot="icon" />
                {t('common.edit')}
              </Button>
              <Button color="accent" size="xs" onClick={handleAddWorkItem} disabled={frozen}>
                <PlusIcon data-slot="icon" />
                {`${t('common.add')} ${getName('work_item').toLowerCase()}`}
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
        </div>

        {/* Approval callout — renders only when this WO has a pending approval. */}
        <div className="mt-3">
          <WorkOrderApprovalsCallout workOrderId={workOrder.id} />
        </div>

        {/* Tab row */}
        <div className="mt-3">
          <Tabs value={tab} onChange={(id) => setTab(id as WorkOrderTab)} tabs={tabItems} />
        </div>

        {/* Tab bodies */}
        <div className="mt-4">
          {tab === 'overview' && (
            <WorkOrderOverview
              workOrder={workOrder}
              location={locationDetail}
              financialSummary={financialSummary}
              dispatches={dispatches}
              onOpenTab={(t2) => setTab(t2 as WorkOrderTab)}
              onAddWorkItem={handleAddWorkItem}
              onOpenWorkItem={openWorkItem}
              onOpenFinancial={openFinancialTab}
              onSelectDispatch={(d) => setSelectedDispatch(d)}
              onScheduleDispatch={() => {
                setEditingDispatch(null);
                setAssignDispatchDialogOpen(true);
              }}
              extraRail={
                <Card title={<CardTitle>{t('workOrders.detail.info', { entity: getName('work_order') })}</CardTitle>} padding="none">
                  <div className="px-3.5 py-3">
                    <DescriptionList>
                      <DescriptionTerm>{t('workOrders.detail.created')}</DescriptionTerm>
                      <DescriptionDetails><TimeAgo iso={workOrder.createdAt} /></DescriptionDetails>

                      <DescriptionTerm>{t('workOrders.form.customerOrderNumber')}</DescriptionTerm>
                      <DescriptionDetails>
                        <EditableField
                          value={workOrder.customerOrderNumber ?? ''}
                          onSave={(v) => handleSaveWorkOrderField('customerOrderNumber', v || undefined)}
                          disabled={frozen}
                          placeholder={t('workOrders.form.customerOrderNumberPlaceholder')}
                          ariaLabel={t('workOrders.form.customerOrderNumber')}
                          className="font-mono"
                        />
                      </DescriptionDetails>

                      <DescriptionTerm>{t('workOrders.form.notToExceed')}</DescriptionTerm>
                      <DescriptionDetails>
                        <EditableField
                          value={workOrder.notToExceed != null ? String(workOrder.notToExceed) : ''}
                          onSave={async (raw) => {
                            const trimmed = raw.trim().replace(/[$,\s]/g, '');
                            if (trimmed === '') {
                              await handleSaveWorkOrderField('notToExceed', null);
                              return;
                            }
                            const n = Number(trimmed);
                            if (!Number.isFinite(n) || n < 0) {
                              alert(t('workOrders.form.notToExceedInvalid'));
                              throw new Error('invalid NTE');
                            }
                            await handleSaveWorkOrderField('notToExceed', n);
                          }}
                          disabled={frozen}
                          placeholder={t('workOrders.form.notToExceedPlaceholder')}
                          ariaLabel={t('workOrders.form.notToExceed')}
                          renderDisplay={(v) => (v ? currencyFormatter.format(Number(v)) : '-')}
                        />
                      </DescriptionDetails>

                      <DescriptionTerm>{getName('division')}</DescriptionTerm>
                      <DescriptionDetails>
                        <EditableField
                          as="select"
                          value={workOrder.divisionId ?? ''}
                          options={[
                            { value: '', label: t('workOrders.form.divisionPlaceholder') },
                            ...((divisions ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))),
                          ]}
                          onSave={(v) => handleSaveWorkOrderField('divisionId', v || null)}
                          disabled={frozen}
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
                            ...((workOrderTypes ?? []).filter((wt) => wt.isActive).map((wt) => ({ value: wt.id, label: wt.name }))),
                          ]}
                          onSave={(v) => handleSaveWorkOrderField('workOrderTypeId', v || null)}
                          disabled={frozen}
                          ariaLabel={t('workOrders.form.type')}
                        />
                      </DescriptionDetails>

                      {workOrder.completedDate && (
                        <>
                          <DescriptionTerm>{t('workOrders.detail.completed')}</DescriptionTerm>
                          <DescriptionDetails><TimeAgo iso={workOrder.completedDate} /></DescriptionDetails>
                        </>
                      )}
                    </DescriptionList>
                  </div>
                </Card>
              }
            />
          )}

          {tab === 'items' && (
            <WorkItemsTab
              workOrderId={workOrder.id}
              serviceLocationId={workOrder.serviceLocationId || workOrder.serviceLocation?.id}
              workItems={workOrder.workItems ?? []}
              statuses={workItemStatuses}
              transitions={workflowTransitions}
              enforceWorkflow={workflowConfig?.enforcementMode === 'STRICT'}
              readOnly={frozen}
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
              focusWorkItemId={focusWorkItemId}
              tripsByWorkItem={wiTrips}
            />
          )}

          {tab === 'trips' && (
            <DispatchesTab
              workOrderId={workOrder.id}
              dispatches={dispatches}
              workItems={workOrder.workItems ?? []}
              readOnly={frozen}
              onAssign={() => {
                setEditingDispatch(null);
                setAssignDispatchDialogOpen(true);
              }}
              onEdit={(d) => {
                setEditingDispatch(d);
                setAssignDispatchDialogOpen(true);
              }}
              onSelect={(d) => setSelectedDispatch(d)}
              onViewInvoice={openFinancialTab}
            />
          )}

          {tab === 'estimate' && (
            <div className="flex flex-col gap-4">
              <FinancialInvoicesTab
                workOrderId={workOrder.id}
                workOrderNumber={woDisplayNumber}
                customerId={customer?.id ?? workOrder.customerId ?? ''}
                customerName={customer?.name ?? ''}
              />
              <FinancialQuotesTab
                workOrderId={workOrder.id}
                workOrderNumber={woDisplayNumber}
                customerId={customer?.id ?? workOrder.customerId ?? ''}
                customerName={customer?.name ?? ''}
              />
            </div>
          )}

          {tab === 'purchasing' && (
            <WorkOrderPurchasingTab workOrderId={workOrder.id} readOnly={frozen} />
          )}

          {tab === 'files' && (
            <WorkOrderFilesTab workOrderId={workOrder.id} dispatches={dispatches} readOnly={frozen} />
          )}

          {tab === 'activity' && (
            <Card>
              <ActivityStream workOrderId={workOrder.id} />
            </Card>
          )}
        </div>
      </div>

      {/* Activity drawer — page-level note/activity composer (N shortcut). Kept
          alongside the Activity tab until the work_order notes endpoint lands
          and the shared NotesCard fully replaces the composer. */}
      <ActivityDrawer
        open={activityDrawerOpen}
        onClose={() => setActivityDrawerOpen(false)}
        workOrderId={workOrder.id}
      />

      {/* Dispatch detail drawer — row body click opens this with the
          dispatch's lifecycle audit + notification history. Edit handoff
          closes the drawer and opens the DispatchFormDrawer in edit
          mode. Delete fires the dispatches mutation directly. */}
      <DispatchDetailDrawer
        dispatch={selectedDispatch}
        dispatches={dispatches}
        workItems={workOrder.workItems ?? []}
        readOnly={frozen}
        onClose={() => setSelectedDispatch(null)}
        onViewWorkItems={() => {
          setSelectedDispatch(null);
          setTab('items');
        }}
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
        readOnly={frozen}
      />

      <WorkOrderFormDialog
        isOpen={editWorkOrderDialogOpen}
        onClose={() => setEditWorkOrderDialogOpen(false)}
        workOrder={workOrder}
      />

      <DispatchFormDrawer
        open={assignDispatchDialogOpen}
        onClose={() => {
          setAssignDispatchDialogOpen(false);
          setEditingDispatch(null);
        }}
        workOrderId={workOrder.id}
        workItems={workOrder.workItems ?? []}
        locationName={location?.locationName}
        workOrderNumber={woDisplayNumber}
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
          drawer-over-drawer recursion. */}
      <EquipmentQuickViewDrawer
        initialEquipment={drawerEquipment}
        onClose={() => setDrawerEquipment(null)}
      />
    </AppLayout>
  );
}
