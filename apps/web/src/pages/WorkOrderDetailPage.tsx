import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateDispatchConsumers } from '../utils/invalidateRoleConsumers';
import { useTranslation } from '@dispatch/i18n';
import {
  customerApi,
  dispatchesApi,
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
  type ProgressCategory,
  type ServiceLocationDetailDto,
  type UpdateWorkOrderRequest,
  type WorkItemResponse,
  type WorkOrderFinancialSummary,
  type WorkOrderPriority,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import WorkOrderActivityTab from '../features/work-orders/WorkOrderActivityTab';
import { resolveBack } from '../lib/backContext';
import { useDocumentBack } from '../hooks/useDocumentBack';
import AppLayout from '../components/AppLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import DispatchFormDrawer from '../components/DispatchFormDrawer';
import DispatchDetailDrawer from '../components/DispatchDetailDrawer';
import DispatchesTab from '../components/DispatchesTab';
import EquipmentQuickViewDrawer from '../components/EquipmentQuickViewDrawer';
import { equipmentCreateUrl, workItemAttachToken, parseWorkItemAttachToken } from '../lib/equipmentCreate';
import { showError, showInfo, extractApiError, errorCode, errorStatus } from '../lib/toast';
import { useWorkOrderAccess } from '../hooks/useWorkOrderAccess';
import WorkOrderBillingTab from '../components/WorkOrderBillingTab';
import WorkItemsTab from '../components/WorkItemsTab';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import WorkOrderApprovalsCallout from '../features/work-orders/WorkOrderApprovalsCallout';
import WorkOrderOverview from '../features/work-orders/WorkOrderOverview';
import WorkOrderOverviewCompact from '../features/work-orders/compact/WorkOrderOverviewCompact';
import { useOverviewLayout } from '../hooks/useOverviewLayout';
import { useHasCapability } from '../hooks/useCurrentUser';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { formatExactTimestamp, formatPhone, formatTimestamp, roleAccent, titleCaseAddress, tripsByWorkItem } from '@dispatch/utils';
import WorkOrderFilesTab from '../components/WorkOrderFilesTab';
import WorkOrderPurchasingTab from '../components/WorkOrderPurchasingTab';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { LoadingState } from '../components/ui/LoadingState';
import { Tabs } from '../components/ui/Tabs';
import { Pill, Tag } from '../components/ui/Pill';
import { CallbackChip, WorkOrderCallbackCard, WorkOrderCallbacksBackCard } from '../features/callbacks/CallbackCards';
import { isSeededCallbackType } from '../features/callbacks/callbackModel';
import { Button } from '../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
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

  // Where "back" goes. The dispatch board is a place, not a list, and a
  // dispatcher who opened a job from it is mid-triage — dropping them on the
  // Work Orders list loses the date and scope they were working. `back`
  // carries the board's own query, so they land on the board they left.
  // The agreements queue works the same way: back lands on the queue's tab.
  const from = searchParams.get('from');
  // Opened from a quote or invoice's header: back returns to that document.
  const docBack = useDocumentBack();
  const back = docBack
    ? { href: docBack.href, label: t('common.actions.backTo', { entities: docBack.label }) }
    : from === 'dispatch'
      ? {
          href: resolveBack('/dispatch', searchParams.get('back')),
          label: t('common.actions.backTo', { entities: t('dispatchBoard.backTarget') }),
        }
      : from === 'agreements'
        ? {
            href: resolveBack('/agreements', searchParams.get('back')),
            label: t('common.actions.backTo', { entities: getName('agreement', true) }),
          }
        : fromPurchasing
          ? {
              href: '/purchasing',
              label: t('common.actions.backTo', { entities: t('entities.purchasing') }),
            }
          : {
              href: '/work-orders',
              label: t('common.actions.backTo', { entities: getName('work_order', true) }),
            };

  const [copied, setCopied] = useState<'phone' | 'address' | null>(null);
  const [tab, setTab] = useUrlTab<WorkOrderTab>(TAB_IDS, 'overview');
  // Overview body: Compact (job-first) or Detailed (attention-first), per user.
  const [overviewLayout, setOverviewLayout] = useOverviewLayout();
  // Internal job cost + margin on the Compact Money card — the same people who
  // set labor cost rates and pricing.
  const canSeeCost = useHasCapability('MANAGE_PRICING');
  // Linking a callback from the header menu opens the Callback card on Overview.
  const [callbackEditing, setCallbackEditing] = useState(false);
  // Bumped by the "Add work item" affordances (header button, overview card,
  // the W shortcut) to open the inline composer on the Items tab. All work-item
  // editing is inline on the card (complaint / diagnosis / equipment) — there
  // is no add or edit modal.
  const [composeWorkItemSignal, setComposeWorkItemSignal] = useState(0);
  const [editWorkOrderDialogOpen, setEditWorkOrderDialogOpen] = useState(false);
  // `?schedule=new` opens the dispatch form on arrival: a queue's Schedule
  // button lands straight on booking. The param is dropped when it closes.
  const [assignDispatchDialogOpen, setAssignDispatchDialogOpen] = useState(
    () => searchParams.get('schedule') === 'new',
  );
  // Same dialog handles edit — when set, the dialog opens prefilled in PUT mode.
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  // A work item's own "Schedule" seeds the form with just that item.
  const [scheduleWorkItemIds, setScheduleWorkItemIds] = useState<string[] | null>(null);
  // Row click opens the read+manage drawer (lifecycle audit, notification
  // history, edit/delete footer). Null = closed.
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  // Work-item delete goes through the app ConfirmDialog (not window.confirm).
  const [workItemToDelete, setWorkItemToDelete] = useState<WorkItemResponse | null>(null);
  // Sub-unit chip click opens the equipment quickview drawer in-context.
  // Drawer manages its own stack of pushed sub-units internally; this state
  // is just the seed (the equipment whose chip was clicked).
  const [drawerEquipment, setDrawerEquipment] = useState<{ id: string; name: string } | null>(null);

  // "+ Add new equipment" on a work item → the full-page create ("creating a
  // record is a page"), scoped to the WO's location and told to attach the new
  // record back to this item on return. `workOrder` is defined below; the
  // handler reads it at click time, when it has loaded.
  const handleAddEquipmentToWorkItem = (wi: WorkItemResponse) => {
    navigate(
      equipmentCreateUrl({
        returnTo: `/work-orders/${id}?tab=items`,
        locationId: workOrder?.serviceLocationId || workOrder?.serviceLocation?.id,
        attachTo: workItemAttachToken(wi.id),
      })
    );
  };

  // Sub-unit chip click → open the quickview drawer for that equipment.
  // Drawer pushes its own stack internally for further drill-in.
  const handleSelectSubUnit = (subUnit: { id: string; name: string }) => {
    setDrawerEquipment(subUnit);
  };

  const deleteWorkItemMutation = useMutation({
    mutationFn: ({ workItemId }: { workItemId: string }) =>
      workOrderApi.deleteWorkItem(id!, workItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
      setWorkItemToDelete(null);
    },
    onError: (err: unknown) => {
      // The server's refusals carry a code; say why in our words.
      const code = errorCode(err);
      const reason =
        code === 'LAST_WORK_ITEM' ||
        code === 'WORK_ITEM_HAS_COMPLETED_VISIT' ||
        code === 'WORK_ORDER_CANCELLED'
          ? t(`workOrders.workItems.deleteRefused.${code}`, {
              entity: getName('work_item').toLowerCase(),
              dispatch: getName('dispatch').toLowerCase(),
              workOrder: getName('work_order').toLowerCase(),
            })
          : extractApiError(err);
      showError(t('common.form.errorDelete', { entity: getName('work_item') }), reason ?? undefined);
    },
  });

  // The card's ⋯ → Delete opens the ConfirmDialog; onConfirm fires the mutation.
  const handleDeleteWorkItem = (wi: WorkItemResponse) => setWorkItemToDelete(wi);

  // Duplicate item (⋯ menu) — clone the complaint and equipment link into a
  // fresh item; status resets server-side. Findings stay with the original
  // (copying them would credit whoever duplicated as their author).
  const duplicateWorkItemMutation = useMutation({
    mutationFn: (wi: WorkItemResponse) =>
      workOrderApi.createWorkItem(id!, {
        description: wi.description,
        equipmentId: wi.equipment?.id ?? undefined,
        equipmentNeeded: wi.equipmentNeeded,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    },
    onError: (err: unknown) => {
      showError(t('common.form.errorCreate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
    },
  });

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
      showError(t('common.form.errorUpdate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
      throw err;
    }
  };

  // Inline diagnosis edit on each card (mirrors description). EditableField
  // stays in edit mode if this throws, so surface the error then re-throw.
  const handleSaveWorkItemDiagnosis = async (wi: WorkItemResponse, next: string) => {
    try {
      await workOrderApi.updateWorkItem(id!, wi.id, { diagnosis: next.trim() || null });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      showError(t('common.form.errorUpdate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
      throw err;
    }
  };

  // Inline equipment attach / change / clear from a card's WOEquipmentPicker.
  // equipmentId null (Clear) detaches; a string attaches.
  const handleAttachEquipmentToWorkItem = async (wi: WorkItemResponse, equipmentId: string | null) => {
    if ((wi.equipment?.id ?? null) === equipmentId) return; // no-op re-pick / clear-when-empty
    try {
      await workOrderApi.updateWorkItem(id!, wi.id, { equipmentId });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      showError(t('common.form.errorUpdate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
    }
  };

  // Toggle the equipmentNeeded flag (backend shipped it on the PATCH). false
  // also detaches any attached unit so "no equipment needed" can't leave a
  // stale id; true reverts to the needs-attach prompt.
  const handleSetWorkItemEquipmentNeeded = async (wi: WorkItemResponse, needed: boolean) => {
    try {
      await workOrderApi.updateWorkItem(
        id!,
        wi.id,
        needed ? { equipmentNeeded: true } : { equipmentNeeded: false, equipmentId: null }
      );
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
    } catch (err) {
      showError(t('common.form.errorUpdate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
    }
  };

  // Return from the full-page equipment create (the picker's "+ Add new
  // equipment"). EquipmentFormPage sent us back with ?newEquipmentId and
  // ?attachTo=wi:<id>; attach the new record to that work item, then strip the
  // params so a refresh doesn't re-attach. Sub-unit / no-attach returns just
  // land here with the caches already invalidated by the form.
  useEffect(() => {
    const newEquipmentId = searchParams.get('newEquipmentId');
    if (!newEquipmentId || !id) return;
    const workItemId = parseWorkItemAttachToken(searchParams.get('attachTo'));
    const clearParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('newEquipmentId');
      next.delete('attachTo');
      setSearchParams(next, { replace: true });
    };
    if (!workItemId) {
      clearParams();
      return;
    }
    void (async () => {
      try {
        await workOrderApi.updateWorkItem(id, workItemId, { equipmentId: newEquipmentId });
        queryClient.invalidateQueries({ queryKey: ['work-orders'] });
        queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
        queryClient.invalidateQueries({ queryKey: ['work-order-activity', id] });
      } catch (err) {
        showError(
          t('common.form.errorUpdate', { entity: getName('work_item') }),
          extractApiError(err) ?? undefined
        );
      } finally {
        clearParams();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, id]);

  // Generic single-field PATCH for inline edits in the header (priority).
  // Rethrows after the alert so a caller can stay in its edit state.
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

  const {
    data: workOrder,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => workOrderApi.getById(id!),
    enabled: !!id,
  });

  const access = useWorkOrderAccess(workOrder);
  const frozen = !!workOrder && (workOrder.lifecycleState === 'CANCELLED' || !!workOrder.archivedAt);
  // Every work-order-service write on this page (header edits, work items,
  // files, note edits) needs edit access; cancelled/archived freezes them all.
  const editLocked = frozen || !access.canEdit;

  // 404 = doesn't exist OR not visible to this user (the backend makes the two
  // indistinguishable on purpose) — typically a tech following an old link to
  // a reassigned job. Say so and fall back to the list. (A job assigned seconds
  // ago can also 404 until the dispatch event lands; the app-wide retry covers
  // that window.)
  const notAvailable = errorStatus(error) === 404;
  useEffect(() => {
    if (!notAvailable) return;
    showInfo(t('workOrders.detail.notAvailable', { entity: getName('work_order') }));
    navigate('/work-orders', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notAvailable]);

  // W shortcut → open the inline work-item composer on the Items tab. Ignored
  // when an input is focused, modifier keys are held, or the user can't edit.
  useEffect(() => {
    if (editLocked) return;
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
      setTab('items');
      setComposeWorkItemSignal((s) => s + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTab, editLocked]);

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
  const wiTrips = useMemo(
    () => tripsByWorkItem(dispatches, (workOrder?.workItems ?? []).map((wi) => wi.id)),
    [dispatches, workOrder?.workItems],
  );

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

  if (isLoading || notAvailable) {
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
          <Button className="mt-4" onClick={() => navigate(back.href)}>
            <ArrowLeftIcon className="size-4" />
            {back.label}
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
  // Header arrival line — from the full location record (the same gate match
  // the Detailed layout's Location card uses).
  const gateFact = (locationDetail?.arrivalFacts ?? []).find((f) => /gate|code|lockbox/i.test(f.label));
  const accessText = locationDetail?.accessInstructions?.trim() || null;
  const siteContactName = locationDetail?.siteContactName || null;
  const siteContactPhone = locationDetail?.siteContactPhone || null;
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
    setComposeWorkItemSignal((s) => s + 1);
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

  // Callback cards ride the Overview rail in either layout (the header's
  // "Link as callback" opens the editor there).
  const overviewExtraRail = (
    <>
      {(workOrder.callbackOf || callbackEditing) && (
        <WorkOrderCallbackCard
          workOrder={workOrder}
          typeName={woType?.name ?? null}
          isCallbackType={isSeededCallbackType(woType)}
          frozen={editLocked}
          canPick={access.canViewAll}
          editing={callbackEditing}
          onEditingChange={setCallbackEditing}
        />
      )}
      <WorkOrderCallbacksBackCard
        workOrderId={workOrder.id}
        callbacks={workOrder.callbacks ?? []}
        completedDate={workOrder.completedDate}
        statusPill={(c) => (
          <Pill tone={PROGRESS_PILL_TONE[c.progressCategory]} dot>
            {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[c.progressCategory]}`)}
          </Pill>
        )}
      />
    </>
  );

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
        <Button plain onClick={() => navigate(back.href)} className="mb-2">
          <ArrowLeftIcon className="size-4" />
          {back.label}
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
                  if (editLocked) return pill;
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
                {workOrder.callbackOf && <CallbackChip callbackOf={workOrder.callbackOf} />}
              </div>

              {/* Meta line — render only populated items. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
                {displayAddress && <span className="font-medium text-fg-strong">{displayAddress}</span>}
                {displayAddress && <span className="text-fg-dim">·</span>}
                <span className="font-mono">{woDisplayNumber}</span>
                {workOrder.customerOrderNumber && (
                  <>
                    <span className="text-fg-dim">·</span>
                    <span>
                      {t('workOrders.detail.po')} <span className="font-mono">{workOrder.customerOrderNumber}</span>
                    </span>
                  </>
                )}
                {workOrder.notToExceed != null && (
                  <>
                    <span className="text-fg-dim">·</span>
                    <span>{t('workOrders.detail.nte', { amount: currencyFormatter.format(workOrder.notToExceed) })}</span>
                  </>
                )}
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
                {workOrder.completedDate && (
                  <>
                    <span className="text-fg-dim">·</span>
                    <span title={formatExactTimestamp(workOrder.completedDate)}>
                      {t('workOrders.detail.completedAt', { time: formatDate(workOrder.completedDate) })}
                    </span>
                  </>
                )}
                <span className="text-fg-dim">·</span>
                <span title={formatExactTimestamp(workOrder.updatedAt)}>
                  {t('workOrders.detail.lastUpdated', { time: formatTimestamp(workOrder.updatedAt) })}
                </span>
              </div>

              {/* Arrival line — what the tech needs at the curb: gate code,
                  access notes, who's on site. Only when the location has any. */}
              {(gateFact || accessText || siteContactName || siteContactPhone) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
                  {gateFact && (
                    <span className="inline-flex items-center gap-1.5">
                      {gateFact.label}
                      <span className="rounded-xs bg-bg-active px-1.5 py-px font-mono font-semibold tracking-[0.06em] text-fg-strong">
                        {gateFact.value}
                      </span>
                    </span>
                  )}
                  {gateFact && accessText && <span className="text-fg-dim">·</span>}
                  {accessText && <span className="text-fg-strong">{accessText}</span>}
                  {(gateFact || accessText) && (siteContactName || siteContactPhone) && (
                    <span className="text-fg-dim">·</span>
                  )}
                  {(siteContactName || siteContactPhone) && (
                    <span className="inline-flex items-center gap-1.5">
                      {t('workOrders.detail.onSiteContact')}
                      {siteContactName && <span className="font-semibold text-fg-strong">{siteContactName}</span>}
                      {siteContactPhone && (
                        <a
                          href={`tel:${siteContactPhone.replace(/\D/g, '')}`}
                          className="font-mono font-semibold text-fg-accent no-underline hover:underline"
                        >
                          {formatPhone(siteContactPhone)}
                        </a>
                      )}
                    </span>
                  )}
                </div>
              )}
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
              {access.canEdit && (
                <>
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
                </>
              )}
              <Dropdown>
                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                  <EllipsisHorizontalIcon className="size-4" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  {!workOrder.callbackOf && !editLocked && access.canViewAll && (
                    <DropdownItem
                      onClick={() => {
                        setTab('overview');
                        setCallbackEditing(true);
                      }}
                    >
                      <DropdownLabel>{t('callbacks.linkAsCallback')}</DropdownLabel>
                    </DropdownItem>
                  )}
                  <DropdownItem disabled>
                    <DropdownLabel>{t('workOrders.detail.print')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem disabled>
                    <DropdownLabel>{t('workOrders.detail.duplicate')}</DropdownLabel>
                  </DropdownItem>
                  {access.canEditAll && (
                    <DropdownItem onClick={handleDeleteWorkOrder}>
                      <DropdownLabel>{t('common.delete')}</DropdownLabel>
                    </DropdownItem>
                  )}
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
          <Tabs
            value={tab}
            onChange={(id) => setTab(id as WorkOrderTab)}
            tabs={tabItems}
            trailing={
              tab === 'overview' ? (
                <ToggleGroup
                  size="sm"
                  value={overviewLayout}
                  onChange={setOverviewLayout}
                  aria-label={t('workOrders.detail.layout.label')}
                >
                  <ToggleGroupOption value="compact">{t('workOrders.detail.layout.compact')}</ToggleGroupOption>
                  <ToggleGroupOption value="detailed">{t('workOrders.detail.layout.detailed')}</ToggleGroupOption>
                </ToggleGroup>
              ) : null
            }
          />
        </div>

        {/* Tab bodies */}
        <div className="mt-4">
          {tab === 'overview' && overviewLayout === 'compact' && (
            <WorkOrderOverviewCompact
              workOrder={workOrder}
              statuses={workItemStatuses}
              location={locationDetail}
              financialSummary={financialSummary}
              dispatches={dispatches}
              quotes={quotesForCount}
              invoices={invoicesForCount}
              readOnly={editLocked}
              canEditNotes={access.canEdit}
              canSeeCost={canSeeCost}
              onOpenTab={(t2) => setTab(t2 as WorkOrderTab)}
              onOpenFinancial={openFinancialTab}
              onOpenWorkItem={openWorkItem}
              onSelectDispatch={(d) => setSelectedDispatch(d)}
              onOpenEquipment={handleSelectSubUnit}
              onAttachEquipment={handleAttachEquipmentToWorkItem}
              onSetEquipmentNeeded={handleSetWorkItemEquipmentNeeded}
              onAddEquipment={handleAddEquipmentToWorkItem}
              extraRail={overviewExtraRail}
            />
          )}
          {tab === 'overview' && overviewLayout === 'detailed' && (
            <WorkOrderOverview
              workOrder={workOrder}
              statuses={workItemStatuses}
              location={locationDetail}
              financialSummary={financialSummary}
              dispatches={dispatches}
              onOpenTab={(t2) => setTab(t2 as WorkOrderTab)}
              onAddWorkItem={editLocked ? undefined : handleAddWorkItem}
              onOpenWorkItem={openWorkItem}
              canEditNotes={access.canEdit}
              onOpenFinancial={openFinancialTab}
              onSelectDispatch={(d) => setSelectedDispatch(d)}
              onScheduleDispatch={() => {
                setEditingDispatch(null);
                setAssignDispatchDialogOpen(true);
              }}
              extraRail={overviewExtraRail}
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
              readOnly={editLocked}
              dispatches={dispatches}
              customerId={workOrder.customer?.id}
              onDelete={handleDeleteWorkItem}
              onDuplicate={(wi) => duplicateWorkItemMutation.mutate(wi)}
              onSaveDescription={handleSaveWorkItemDescription}
              onSaveDiagnosis={handleSaveWorkItemDiagnosis}
              onAttachEquipment={handleAttachEquipmentToWorkItem}
              onSetEquipmentNeeded={handleSetWorkItemEquipmentNeeded}
              onAddEquipment={handleAddEquipmentToWorkItem}
              onOpenEquipment={handleSelectSubUnit}
              onScheduleDispatch={(wi) => {
                setEditingDispatch(null);
                setScheduleWorkItemIds([wi.id]);
                setAssignDispatchDialogOpen(true);
              }}
              onSelectDispatch={(d) => setSelectedDispatch(d)}
              focusWorkItemId={focusWorkItemId}
              tripsByWorkItem={wiTrips}
              openComposerSignal={composeWorkItemSignal}
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
            <WorkOrderBillingTab
              workOrderId={workOrder.id}
              workOrderNumber={woDisplayNumber}
              customer={{ id: customer?.id ?? workOrder.customerId ?? '', name: customer?.name ?? '' }}
            />
          )}

          {tab === 'purchasing' && (
            <WorkOrderPurchasingTab workOrderId={workOrder.id} readOnly={frozen} />
          )}

          {tab === 'files' && (
            <WorkOrderFilesTab workOrderId={workOrder.id} dispatches={dispatches} readOnly={editLocked} />
          )}

          {tab === 'activity' && <WorkOrderActivityTab workOrderId={workOrder.id} />}
        </div>
      </div>

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
            invalidateDispatchConsumers(queryClient);
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

      <WorkOrderFormDialog
        isOpen={editWorkOrderDialogOpen}
        onClose={() => setEditWorkOrderDialogOpen(false)}
        workOrder={workOrder}
      />

      <DispatchFormDrawer
        open={assignDispatchDialogOpen && !frozen}
        onClose={() => {
          setAssignDispatchDialogOpen(false);
          setEditingDispatch(null);
          setScheduleWorkItemIds(null);
          if (searchParams.has('schedule'))
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('schedule');
                return next;
              },
              { replace: true },
            );
        }}
        workOrderId={workOrder.id}
        workItems={workOrder.workItems ?? []}
        locationName={location?.locationName}
        workOrderNumber={woDisplayNumber}
        divisionId={workOrder.divisionId}
        dispatch={editingDispatch}
        initialWorkItemIds={scheduleWorkItemIds}
      />

      {/* Equipment quickview drawer — slides in from the right when a
          sub-unit chip is clicked. Manages its own internal stack for
          drawer-over-drawer recursion. */}
      <ConfirmDialog
        isOpen={!!workItemToDelete}
        onClose={() => setWorkItemToDelete(null)}
        onConfirm={() =>
          workItemToDelete && deleteWorkItemMutation.mutate({ workItemId: workItemToDelete.id })
        }
        title={t('workOrders.workItems.deleteTitle', { entity: getName('work_item') })}
        message={t('workOrders.workItems.deleteMessage')}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteWorkItemMutation.isPending}
      />

      <EquipmentQuickViewDrawer
        initialEquipment={drawerEquipment}
        onClose={() => setDrawerEquipment(null)}
        workOrderId={workOrder.id}
      />
    </AppLayout>
  );
}
