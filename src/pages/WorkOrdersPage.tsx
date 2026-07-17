import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, FunnelIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import {
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  dispatchRegionApi,
  userApi,
  type WorkOrderSummary,
  type ProgressCategory,
  type WorkOrderPriority,
  type ListWorkOrdersParams,
} from '../api';
import {
  EMPTY_DATE_RANGE,
  formatDateRange,
  rangeForPreset,
  type DatePreset,
  type DateRange,
} from '../lib/dateRangePresets';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import CancelWorkOrderDialog from '../components/CancelWorkOrderDialog';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import { Switch } from '../components/catalyst/switch';
import IconButton from '../components/IconButton';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill, Tag } from '../components/ui/Pill';
import { ViewTabs } from '../components/ui/Tabs';
import {
  DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub,
} from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { AssignedUsersCell } from '../components/ui/AssignedUsersCell';

// ─── Filter constants ────────────────────────────────────────────────────────

type LifecycleTabId = 'active' | 'notStarted' | 'inProgress' | 'blocked' | 'completed' | 'cancelled' | 'all';

const DEFAULT_TAB: LifecycleTabId = 'active';

interface LifecycleTab {
  id: LifecycleTabId;
  labelKey: string;
  params: Pick<ListWorkOrdersParams, 'lifecycleState' | 'progressCategory'>;
}

const LIFECYCLE_TABS: LifecycleTab[] = [
  { id: 'active', labelKey: 'workOrders.filters.open', params: { lifecycleState: 'ACTIVE' } },
  { id: 'notStarted', labelKey: 'workOrders.filters.notStarted', params: { progressCategory: 'NOT_STARTED' } },
  { id: 'inProgress', labelKey: 'workOrders.filters.inProgress', params: { progressCategory: 'IN_PROGRESS' } },
  { id: 'blocked', labelKey: 'workOrders.filters.blocked', params: { progressCategory: 'BLOCKED' } },
  { id: 'completed', labelKey: 'workOrders.filters.completed', params: { progressCategory: 'COMPLETED' } },
  { id: 'cancelled', labelKey: 'workOrders.filters.cancelled', params: { lifecycleState: 'CANCELLED' } },
  { id: 'all', labelKey: 'workOrders.filters.all', params: {} },
];

const PAGE_SIZE = 50;

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

const PROGRESS_TONES: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'info',
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

function isCancelled(wo: WorkOrderSummary): boolean {
  return wo.lifecycleState === 'CANCELLED';
}

// Toggle an id in/out of a multi-value filter array (for the More-filters pills).
function toggleInArray(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

// A WO reads "live" when a tech is on site right now — drives the row tint
// and the pulsing status dot.
function isLive(wo: WorkOrderSummary): boolean {
  return !!wo.assignedUsers?.some((u) => u.state === 'ON_SITE');
}

// The one-line job essence under the WO#: the backend summary, else the first
// work item + "+N more". (Type is shown as its own badge, so no type fallback
// here — an empty string just renders no summary line.)
function deriveSummary(wo: WorkOrderSummary): string {
  if (wo.summary) return wo.summary;
  const first = wo.workItems[0]?.description;
  if (!first) return '';
  const more = Math.max(0, wo.workItemCount - 1);
  return more > 0 ? `${first} +${more} more` : first;
}

// Elevated-priority flag — only URGENT/HIGH surface; NORMAL/LOW are the quiet
// default and get no badge. Loud, compact, uppercase, tone-colored — sits
// inline next to the WO# on the dispatcher's scan line. `label` is passed
// pre-translated so this stays a pure presentational component.
function PriorityFlag({ priority, label }: { priority: 'HIGH' | 'URGENT'; label: string }) {
  const urgent = priority === 'URGENT';
  return (
    <span
      className={clsx(
        'shrink-0 whitespace-nowrap rounded-[3px] px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.04em]',
        urgent ? 'text-danger-500' : 'text-warning-fg',
      )}
      style={{
        background: urgent
          ? 'color-mix(in oklch, var(--danger-500) 14%, transparent)'
          : 'color-mix(in oklch, var(--warning-500) 16%, transparent)',
      }}
    >
      {label}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderSummary | null>(null);

  // ── Read filter state from URL ────────────────────────────────────────────
  // The four taxonomy filters are multi-value — read with getAll(). Old single-
  // value bookmarks (?type=uuid) just work: getAll returns ['uuid']. We never
  // write the old key name, so URLs migrate to the multi-value shape on first
  // interaction without an explicit rewrite step.
  //
  // The array reads are memoized: searchParams.getAll() returns a fresh array
  // every call, which would bust the queryParams useMemo and refetch on every
  // render even when nothing changed.
  const tabId = (searchParams.get('tab') as LifecycleTabId | null) ?? DEFAULT_TAB;
  const urlSearch = searchParams.get('q') ?? '';
  const typeIds = useMemo(() => searchParams.getAll('type'), [searchParams]);
  const divisionIds = useMemo(() => searchParams.getAll('division'), [searchParams]);
  const regionIds = useMemo(() => searchParams.getAll('region'), [searchParams]);
  const itemStatusIds = useMemo(() => searchParams.getAll('itemStatus'), [searchParams]);
  const assignedId = searchParams.get('assigned') ?? '';
  const customFrom = searchParams.get('from') ?? '';
  const customTo = searchParams.get('to') ?? '';
  // Legacy bookmarked `?date=<preset>` (pre-DateRangeChip URL shape) — resolved
  // to its concrete range below until any new selection overwrites it.
  const legacyDatePreset = (searchParams.get('date') as DatePreset | null) ?? '';
  const includeArchived = searchParams.get('archived') === 'true';
  // Quick-triage chips (see FE_HANDOFF_wo_list_quick_filters): Live (on-site),
  // Unassigned, Urgent/High. Urgent/High owns the whole `priority` param.
  const priorityIds = useMemo(() => searchParams.getAll('priority'), [searchParams]);
  const onSiteOnly = searchParams.get('onSite') === 'true';
  const unassignedOnly = searchParams.get('unassigned') === 'true';
  const pageNumber = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  // Local search input state — mirrors URL for instant feedback. Written to the
  // URL synchronously on each keystroke (with replace so we don't flood history),
  // and `useDeferredValue` keeps the actual query from refetching on every key.
  const [searchInput, setSearchInput] = useState(urlSearch);
  const deferredSearch = useDeferredValue(searchInput);

  // Sync from URL → input when the URL changes via back/forward or elsewhere
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // ── URL writer ────────────────────────────────────────────────────────────
  // Pass null / '' / false / [] to remove a param; pass a string/number/true
  // or string[] to set it. Arrays write as repeated params (?type=a&type=b),
  // matching what the backend prefers and what URLSearchParams.getAll() reads
  // back naturally. Pass `replace: true` for high-frequency updates (typing)
  // so the back button doesn't have to step through every keystroke.
  function updateParams(
    updates: Record<string, string | number | boolean | string[] | null>,
    options: { replace?: boolean } = {}
  ) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (Array.isArray(value)) {
        next.delete(key);
        for (const v of value) next.append(key, v);
      } else if (value === null || value === '' || value === false) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    setSearchParams(next, { replace: options.replace ?? false });
  }

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    updateParams({ q: value || null, page: null }, { replace: true });
  };

  // ── Tenant config queries (for filter dropdowns) ──────────────────────────
  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => divisionsApi.getAll(),
  });
  const { data: regions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(),
  });
  const { data: itemStatuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });
  // Assigned-user filter options. Same source as AssignTechnicianDialog: every
  // enabled user is assignable (techs, sales, estimators) until role-based
  // filtering exists.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });

  const activeTypes = (Array.isArray(workOrderTypes) ? workOrderTypes : []).filter((x) => x.isActive);
  const activeDivisions = (Array.isArray(divisions) ? divisions : []).filter((x) => x.isActive);
  const activeRegions = (Array.isArray(regions) ? regions : []).filter((x) => x.isActive !== false);
  const activeItemStatuses = (Array.isArray(itemStatuses) ? itemStatuses : []).filter((x) => x.isActive);
  const userOptions = useMemo(
    () =>
      (Array.isArray(users) ? users : [])
        .filter((u) => u.enabled)
        .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  // ── Resolve the date range ────────────────────────────────────────────────
  // `from`/`to` day params are the source of truth (what DateRangeChip writes);
  // a legacy preset param resolves to concrete dates for old bookmarks.
  const dateRange = useMemo<DateRange>(() => {
    if (customFrom || customTo) return { from: customFrom, to: customTo };
    if (legacyDatePreset && legacyDatePreset !== 'custom') return rangeForPreset(legacyDatePreset);
    return EMPTY_DATE_RANGE;
  }, [customFrom, customTo, legacyDatePreset]);

  const tab = useMemo(
    () => LIFECYCLE_TABS.find((f) => f.id === tabId) ?? LIFECYCLE_TABS[0],
    [tabId]
  );

  // ── Build the API query params ────────────────────────────────────────────
  // The four taxonomy filters use the plural form (workOrderTypeIds, etc.).
  // Don't send both singular and plural for the same filter — backend's
  // precedence rule is "plural wins," so the singular would be dead weight at
  // best and a footgun at worst.
  const queryParams: ListWorkOrdersParams = useMemo(
    () => ({
      ...tab.params,
      q: deferredSearch || undefined,
      workOrderTypeIds: typeIds.length > 0 ? typeIds : undefined,
      divisionIds: divisionIds.length > 0 ? divisionIds : undefined,
      dispatchRegionIds: regionIds.length > 0 ? regionIds : undefined,
      workItemStatusIds: itemStatusIds.length > 0 ? itemStatusIds : undefined,
      assignedUserId: assignedId || undefined,
      priority: priorityIds.length > 0 ? (priorityIds as WorkOrderPriority[]) : undefined,
      unassigned: unassignedOnly || undefined,
      onSite: onSiteOnly || undefined,
      scheduledDateFrom: dateRange.from || undefined,
      scheduledDateTo: dateRange.to || undefined,
      includeArchived: includeArchived || undefined,
      page: pageNumber - 1, // URL is 1-based; backend Spring Page is 0-based
      size: PAGE_SIZE,
    }),
    [tab, deferredSearch, typeIds, divisionIds, regionIds, itemStatusIds, assignedId, priorityIds, unassignedOnly, onSiteOnly, dateRange, includeArchived, pageNumber]
  );

  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ['work-orders', queryParams],
    queryFn: () => workOrderApi.getAll(queryParams),
  });

  const workOrders: WorkOrderSummary[] = pageData?.content ?? [];
  const totalElements = pageData?.totalElements ?? 0;
  const totalPages = pageData?.totalPages ?? 0;

  // Quick-chip counts — one lean size-1 probe each. Scoped to the FULL current
  // query context (tab + search + every active filter/chip), minus pagination,
  // with this chip's predicate forced on. That guarantees the number equals
  // what you actually get when the chip is toggled on — including when other
  // filters or chips are already active — rather than a tab-only count that
  // diverges the moment anything else is applied.
  const countBase = useMemo(() => {
    // Drop pagination; keep everything else (tab, q, taxonomy, assigned,
    // date, archived, and the currently-active quick chips).
    const base = { ...queryParams };
    delete base.page;
    delete base.size;
    return base;
  }, [queryParams]);

  // One server-computed facet call (strict-AND, correspondence-guaranteed) —
  // replaces the three size=1 probes. Runs in parallel with the list; the
  // backend ANDs each chip predicate onto this same filter set.
  const { data: facets } = useQuery({
    queryKey: ['work-orders', 'facets', countBase],
    queryFn: () => workOrderApi.facets(countBase),
  });
  const liveCount = facets?.onSite;
  const unassignedCount = facets?.unassigned;
  const urgentCount = facets?.urgentHigh;

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  const handleEdit = (workOrder: WorkOrderSummary) => {
    setSelectedWorkOrder(workOrder);
    setIsFormOpen(true);
  };

  const handleCancel = (workOrder: WorkOrderSummary) => {
    setSelectedWorkOrder(workOrder);
    setIsCancelOpen(true);
  };

  const handleArchiveToggle = (workOrder: WorkOrderSummary) => {
    if (workOrder.archivedAt) {
      unarchiveMutation.mutate(workOrder.id);
    } else {
      if (window.confirm(t('workOrders.actions.archiveConfirm', { entity: getName('work_order') }))) {
        archiveMutation.mutate(workOrder.id);
      }
    }
  };

  const handleDelete = (workOrder: WorkOrderSummary) => {
    if (window.confirm(t('common.actions.deleteConfirmGeneric', { entity: getName('work_order') }))) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const handleCloseForm = () => setIsFormOpen(false);
  const handleCloseCancel = () => setIsCancelOpen(false);

  // ── Active filter chips ───────────────────────────────────────────────────
  const lookupName = (id: string, list: { id: string; name: string }[]) =>
    list.find((x) => x.id === id)?.name ?? id;

  // Multi-value chip label: "Installation" → "Installation, Service" → "3 selected".
  // Caller drives the format; the chip primitive doesn't know what an option means.
  const formatMultiValue = (
    ids: string[],
    list: { id: string; name: string }[]
  ): string | null => {
    if (ids.length === 0) return null;
    if (ids.length === 1) return lookupName(ids[0], list);
    if (ids.length === 2) return ids.map((id) => lookupName(id, list)).join(', ');
    return t('common.selectedCount', { count: ids.length });
  };

  type ActiveChip = { key: string; label: string; value: string; onClear: () => void };
  const activeChips: ActiveChip[] = [];
  if (urlSearch) {
    activeChips.push({
      key: 'search',
      label: t('common.search').replace('...', ''),
      value: `"${urlSearch}"`,
      onClear: () => updateParams({ q: null, page: null }),
    });
  }
  if (typeIds.length > 0) {
    activeChips.push({
      key: 'type',
      label: t('workOrders.form.type'),
      value: formatMultiValue(typeIds, activeTypes) ?? '',
      onClear: () => updateParams({ type: [], page: null }),
    });
  }
  if (divisionIds.length > 0) {
    activeChips.push({
      key: 'division',
      label: getName('division'),
      value: formatMultiValue(divisionIds, activeDivisions) ?? '',
      onClear: () => updateParams({ division: [], page: null }),
    });
  }
  if (regionIds.length > 0) {
    activeChips.push({
      key: 'region',
      label: t('workOrders.filters.region'),
      value: formatMultiValue(regionIds, activeRegions) ?? '',
      onClear: () => updateParams({ region: [], page: null }),
    });
  }
  if (itemStatusIds.length > 0) {
    activeChips.push({
      key: 'itemStatus',
      label: t('workOrders.filters.itemStatus'),
      value: formatMultiValue(itemStatusIds, activeItemStatuses) ?? '',
      onClear: () => updateParams({ itemStatus: [], page: null }),
    });
  }
  if (assignedId) {
    activeChips.push({
      key: 'assigned',
      label: t('workOrders.filters.assigned'),
      value: lookupName(assignedId, userOptions),
      onClear: () => updateParams({ assigned: null, page: null }),
    });
  }
  if (dateRange.from || dateRange.to) {
    activeChips.push({
      key: 'date',
      label: t('workOrders.filters.scheduled'),
      value: formatDateRange(dateRange),
      onClear: () => updateParams({ date: null, from: null, to: null, page: null }),
    });
  }

  // Quick chips manage their own toggle state (not shown in the removable
  // `activeChips` summary), but they still count as "a filter is on" for the
  // clear-all affordance and the empty-state copy.
  const hasQuickFilter = onSiteOnly || unassignedOnly || priorityIds.length > 0;
  const anyFilter = activeChips.length > 0 || hasQuickFilter;

  // Region is an advanced lens, gated to multi-region tenants (single-branch
  // shops never see it). It + Item status live in the More-filters overflow.
  const showRegion = activeRegions.length > 1;
  const moreCount = itemStatusIds.length + (showRegion ? regionIds.length : 0);
  // Overflow filters surface as removable pills below the row so an active
  // secondary filter is obvious even though the control is tucked in More.
  const overflowChips = activeChips.filter((c) => c.key === 'itemStatus' || c.key === 'region');

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
    setSearchInput('');
  };

  // ── Build pagination hrefs that preserve current filter state ─────────────
  // Catalyst Pagination's hrefs render through RouterLink for SPA navigation
  // and support middle-click / Cmd-click "open in new tab".
  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  // ── Tab options for ViewTabs (no per-tab counts available yet) ─────────────
  const viewTabs = LIFECYCLE_TABS.map((f) => ({ id: f.id, label: t(f.labelKey) }));

  const showingStart = totalElements === 0 ? 0 : (pageNumber - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(pageNumber * PAGE_SIZE, totalElements);

  // Subtitle — uses the one count we actually have (active tab's total).
  // The handoff's "3 open · 1 urgent · 2 scheduled today" pattern wants
  // per-tab counts, which are gated on a backend counts-summary endpoint.
  const activeTabLabel = t(tab.labelKey).toLowerCase();
  const subtitleParts: string[] = [];
  if (totalElements > 0) {
    subtitleParts.push(
      `${totalElements.toLocaleString()} ${activeTabLabel} ${getName('work_order', true).toLowerCase()}`
    );
    if (totalElements > PAGE_SIZE) {
      subtitleParts.push(
        t('common.pagination.showing', {
          start: showingStart,
          end: showingEnd,
          total: totalElements.toLocaleString(),
        })
      );
    }
  }
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('work_order', true)}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={handleAdd}>
              {t('common.actions.create', { entity: getName('work_order') })}
            </Button>
          }
        />

        {/* Filter bar — loose on the canvas, not wrapped in a Card. Cards
            are reserved for content surfaces (the table below); the filter
            row is an action affordance. */}
        <div className="mb-3">
          <ListToolbar
            search={
              <ListSearch
                placeholder={t('workOrders.filters.searchPlaceholder', { customer: getName('customer') })}
                value={searchInput}
                onChange={handleSearchInputChange}
                ariaLabel={t('common.search')}
              />
            }
          >
              {/* Four taxonomy chips are multi-select. No "Any X" reset row —
                  the × button clears all, and an empty array means "show all"
                  by way of the empty-state chip styling. */}
              {activeTypes.length > 0 && (
                <FilterChipListbox
                  multiple
                  label={t('workOrders.form.type')}
                  ariaLabel={t('workOrders.form.type')}
                  value={typeIds}
                  displayValue={formatMultiValue(typeIds, activeTypes)}
                  onChange={(ids) => updateParams({ type: ids, page: null })}
                  onClear={() => updateParams({ type: [], page: null })}
                >
                  {activeTypes.map((tx) => (
                    <ChipListboxOption key={tx.id} value={tx.id}>
                      {tx.name}
                    </ChipListboxOption>
                  ))}
                </FilterChipListbox>
              )}

              {/* Division gated to multi-division tenants — a single-division
                  filter is useless (same treatment as Region). */}
              {activeDivisions.length > 1 && (
                <FilterChipListbox
                  multiple
                  label={getName('division')}
                  ariaLabel={getName('division')}
                  value={divisionIds}
                  displayValue={formatMultiValue(divisionIds, activeDivisions)}
                  onChange={(ids) => updateParams({ division: ids, page: null })}
                  onClear={() => updateParams({ division: [], page: null })}
                >
                  {activeDivisions.map((d) => (
                    <ChipListboxOption key={d.id} value={d.id}>
                      {d.name}
                    </ChipListboxOption>
                  ))}
                </FilterChipListbox>
              )}

              {/* Region + Item status live in the More-filters overflow below —
                  Region is gated to multi-region tenants, and Item status is a
                  DIFFERENT axis from the WO-status tabs (kept out of the primary
                  row so the two aren't mistaken for the same control). */}

              {/* Assigned is single-select — assignedUserId takes one UUID.
                  Matches WOs with at least one non-cancelled dispatch assigned
                  to the user, including completed/no-show visits ("Brian's
                  work orders" includes past trips). */}
              {userOptions.length > 0 && (
                <FilterChipListbox
                  label={t('workOrders.filters.assigned')}
                  ariaLabel={t('workOrders.filters.assigned')}
                  value={assignedId || null}
                  displayValue={assignedId ? lookupName(assignedId, userOptions) : null}
                  onChange={(id) => updateParams({ assigned: id, page: null })}
                  onClear={() => updateParams({ assigned: null, page: null })}
                  resetLabel={t('workOrders.filters.anyone')}
                >
                  {userOptions.map((u) => (
                    <ChipListboxOption key={u.id} value={u.id}>
                      {u.name}
                    </ChipListboxOption>
                  ))}
                </FilterChipListbox>
              )}

              <DateRangeChip
                label={t('workOrders.filters.scheduled')}
                ariaLabel={t('workOrders.filters.scheduled')}
                value={dateRange}
                onChange={(r) =>
                  updateParams({ from: r.from || null, to: r.to || null, date: null, page: null })
                }
              />

              {/* More filters — advanced/secondary lenses (Item status, Region)
                  tucked out of the primary row. Item status is deliberately NOT
                  a peer of the WO-status tabs. */}
              <Popover className="relative">
                <PopoverButton
                  className={clsx(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium focus:outline-none',
                    moreCount > 0
                      ? 'border-accent-500/45 bg-accent-500/10 text-fg-accent'
                      : 'border-border bg-bg-elev text-fg'
                  )}
                >
                  <FunnelIcon className="size-3.5" />
                  <span>{t('workOrders.filters.more')}</span>
                  {moreCount > 0 && (
                    <span className="rounded-[3px] bg-accent-500/20 px-1.5 text-[10.5px] font-semibold tabular-nums text-fg-accent">
                      {moreCount}
                    </span>
                  )}
                  <ChevronDownIcon className="size-3 text-fg-muted" />
                </PopoverButton>
                <PopoverPanel
                  anchor="bottom start"
                  className="z-30 mt-1 min-w-[240px] rounded-md border border-border bg-bg-elev p-3 shadow-lg [--anchor-gap:4px]"
                >
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                    {t('workOrders.filters.itemStatus')}
                    <span className="ml-1 font-normal normal-case text-fg-dim">· {t('workOrders.filters.itemStatusHint')}</span>
                  </div>
                  <FilterChipRow className={showRegion ? 'mb-3' : undefined}>
                    {activeItemStatuses.map((s) => (
                      <FilterChip
                        key={s.id}
                        label={s.name}
                        active={itemStatusIds.includes(s.id)}
                        onToggle={() => updateParams({ itemStatus: toggleInArray(itemStatusIds, s.id), page: null })}
                      />
                    ))}
                  </FilterChipRow>
                  {showRegion && (
                    <>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                        {t('workOrders.filters.region')}
                      </div>
                      <FilterChipRow>
                        {activeRegions.map((r) => (
                          <FilterChip
                            key={r.id}
                            label={r.name}
                            active={regionIds.includes(r.id)}
                            onToggle={() => updateParams({ region: toggleInArray(regionIds, r.id), page: null })}
                          />
                        ))}
                      </FilterChipRow>
                    </>
                  )}
                </PopoverPanel>
              </Popover>

              {/* Quick-triage toggles — the dispatcher's primary buckets. */}
              <FilterChipRow>
                <FilterChip
                  label={t('workOrders.filters.live')}
                  tone="info"
                  count={liveCount}
                  active={onSiteOnly}
                  onToggle={() => updateParams({ onSite: onSiteOnly ? null : true, page: null })}
                />
                <FilterChip
                  label={t('workOrders.filters.unassigned')}
                  tone="warning"
                  count={unassignedCount}
                  active={unassignedOnly}
                  onToggle={() => updateParams({ unassigned: unassignedOnly ? null : true, page: null })}
                />
                <FilterChip
                  label={t('workOrders.filters.urgentHigh')}
                  tone="danger"
                  count={urgentCount}
                  active={priorityIds.length > 0}
                  onToggle={() =>
                    updateParams({ priority: priorityIds.length > 0 ? [] : ['URGENT', 'HIGH'], page: null })
                  }
                />
              </FilterChipRow>

              {anyFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-1 text-[11.5px] font-medium text-fg-muted underline-offset-2 hover:underline hover:text-fg-strong"
                >
                  {t('workOrders.filters.clearAll')}
                </button>
              )}

              {/* Show archived — a VISIBILITY toggle, not a filter dimension.
                  Pushed to the far right, away from the filter controls. */}
              <label
                className={clsx(
                  'ml-auto flex cursor-pointer items-center gap-2 text-[12px]',
                  includeArchived ? 'text-fg-accent' : 'text-fg-muted'
                )}
              >
                <Switch
                  checked={includeArchived}
                  onChange={(checked) => updateParams({ archived: checked ? 'true' : null, page: null })}
                  aria-label={t('workOrders.filters.showArchived')}
                />
                {t('workOrders.filters.showArchived')}
              </label>
          </ListToolbar>

          {overflowChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {overflowChips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded-md border border-accent-500/40 bg-accent-500/10 py-0.5 pl-2 pr-1 text-[11.5px] text-fg-accent"
                >
                  <span className="text-fg-muted">{c.label}:</span>
                  {c.value}
                  <button
                    type="button"
                    onClick={c.onClear}
                    aria-label={`${c.label} — clear`}
                    className="rounded p-0.5 hover:bg-accent-500/15 hover:text-fg-strong"
                  >
                    <XMarkIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Lifecycle / progress tabs */}
        <ViewTabs
          className="mb-3"
          value={tabId}
          onChange={(id) => updateParams({ tab: id === DEFAULT_TAB ? null : id, page: null })}
          tabs={viewTabs}
        />

        {isLoading && (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: getName('work_order', true) })} />
            </CardBody>
          </Card>
        )}

        {error && (
          <Card className="border-danger-500/40 bg-danger-100/40">
            <CardBody>
              <p className="text-[12.5px] text-danger-500">
                {t('common.actions.errorLoading', { entities: getName('work_order', true) })}: {(error as Error).message}
              </p>
            </CardBody>
          </Card>
        )}

        {pageData && workOrders.length === 0 && !anyFilter && tabId === DEFAULT_TAB && (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.notFound', { entities: getName('work_order', true) })}
              </p>
              <Button color="accent" className="mt-2" onClick={handleAdd}>
                {t('common.actions.createFirst', { entity: getName('work_order') })}
              </Button>
            </CardBody>
          </Card>
        )}

        {pageData && workOrders.length === 0 && (anyFilter || tabId !== DEFAULT_TAB) && (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.noMatchSearch', { entities: getName('work_order', true) })}
              </p>
              {anyFilter && (
                <Button plain className="mt-2" onClick={clearAllFilters}>
                  {t('workOrders.filters.clearAll')}
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {workOrders.length > 0 && (
          <Card>
            <CardBody flush>
              <DenseTable className="table-fixed">
                {/* Fixed layout + widths so the Work-order cell's summary line
                    truncates to one line instead of ballooning the row (mock
                    uses the same colgroup). Ignored in mobile card mode. */}
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[24%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[13%]" />
                  <col className="w-[40px]" />
                </colgroup>
                <DenseTHead>
                  <tr>
                    <th>{getName('work_order')}</th>
                    <th>{getName('service_location')}</th>
                    <th>{t('workOrders.table.statusHeader')}</th>
                    <th>{t('workOrders.table.assigned')}</th>
                    <th>{t('workOrders.table.scheduled')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {workOrders.map((workOrder) => {
                    const cancelled = isCancelled(workOrder);
                    const archived = !!workOrder.archivedAt;
                    const completed = workOrder.progressCategory === 'COMPLETED';
                    const dimmed = cancelled || archived;
                    const live = !dimmed && isLive(workOrder);
                    const typeName = activeTypes.find((tp) => tp.id === workOrder.workOrderTypeId)?.name;
                    const divisionName = activeDivisions.find((d) => d.id === workOrder.divisionId)?.name;
                    const priority = workOrder.priority ?? 'NORMAL';
                    const elevated = priority === 'URGENT' || priority === 'HIGH';
                    const summary = deriveSummary(workOrder);
                    return (
                      <DenseRow
                        key={workOrder.id}
                        className={clsx(dimmed && 'opacity-60', live && 'row-live')}
                      >
                        {/* Work order — the dispatcher's scan cell: identity +
                            classification (type / division / elevated priority)
                            on the top line, the work summary beneath. */}
                        <td>
                          <CellStack>
                            <CellTop>
                              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                <RouterLink
                                  to={`/work-orders/${workOrder.id}`}
                                  className="id-mono font-bold text-fg-strong hover:text-accent-500 hover:underline whitespace-nowrap"
                                >
                                  {workOrder.workOrderNumber || `#${workOrder.id.substring(0, 8)}`}
                                </RouterLink>
                                {typeName && <Tag word>{typeName}</Tag>}
                                {divisionName && (
                                  <span className="whitespace-nowrap text-[10px] text-fg-dim">{divisionName}</span>
                                )}
                                {elevated && (
                                  <PriorityFlag
                                    priority={priority as 'HIGH' | 'URGENT'}
                                    label={t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
                                  />
                                )}
                              </span>
                            </CellTop>
                            {summary && (
                              <span className="block truncate text-[12px] text-fg" title={summary}>
                                {summary}
                              </span>
                            )}
                            {archived && <CellSub>{t('workOrders.actions.archived')}</CellSub>}
                          </CellStack>
                        </td>
                        <td>
                          <CellStack>
                            <CellTop className="truncate">
                              <span className="dt-inline-label">{getName('service_location')}: </span>
                              {workOrder.serviceLocation?.locationName || workOrder.customer?.name || '-'}
                            </CellTop>
                            <CellSub className="truncate">
                              {(() => {
                                const a = workOrder.serviceLocation?.address;
                                if (!a) return '';
                                // US convention: "Street, City, ST ZIP" — single
                                // space between state and ZIP, not a comma.
                                const stateZip = [a.state, a.zipCode].filter(Boolean).join(' ');
                                return [
                                  titleCaseAddress(a.streetAddress),
                                  titleCaseAddress(a.city),
                                  stateZip,
                                ].filter(Boolean).join(', ');
                              })()}
                            </CellSub>
                          </CellStack>
                        </td>
                        <td>
                          {cancelled ? (
                            <CellStack>
                              <CellTop><Pill tone="neutral">{t('workOrders.actions.cancelledBadge')}</Pill></CellTop>
                              {workOrder.cancelledAt && (
                                <CellSub>
                                  {t('workOrders.table.cancelledOn', { date: formatDate(workOrder.cancelledAt) })}
                                </CellSub>
                              )}
                            </CellStack>
                          ) : (
                            <Pill tone={PROGRESS_TONES[workOrder.progressCategory]} dot live={live}>
                              {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
                            </Pill>
                          )}
                        </td>
                        <td
                          className={clsx(!(workOrder.assignedUsers && workOrder.assignedUsers.length > 0) && 'dt-empty')}
                          data-label={t('workOrders.table.assigned')}
                        >
                          <AssignedUsersCell users={workOrder.assignedUsers} />
                        </td>
                        <td
                          className={clsx(!workOrder.scheduledDate && 'dt-empty')}
                          data-label={t('workOrders.table.scheduled')}
                        >
                          {formatDate(workOrder.scheduledDate)}
                        </td>
                        <td>
                          <Dropdown>
                            <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                              <EllipsisVerticalIcon className="size-4" />
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
                        </td>
                      </DenseRow>
                    );
                  })}
                </tbody>
              </DenseTable>

              <ListFooter
                page={pageNumber}
                totalPages={totalPages}
                pageHref={pageHref}
                left={t('common.pagination.showing', {
                  start: showingStart,
                  end: showingEnd,
                  total: totalElements.toLocaleString(),
                })}
              />
            </CardBody>
          </Card>
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
      </div>
    </AppLayout>
  );
}
