import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import {
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  dispatchRegionApi,
  userApi,
  type WorkOrderSummary,
  type ProgressCategory,
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
import WorkItemsCell from '../components/WorkItemsCell';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import CancelWorkOrderDialog from '../components/CancelWorkOrderDialog';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import IconButton from '../components/IconButton';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill } from '../components/ui/Pill';
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

const PRIORITY_TONES: Record<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT', PillTone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
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
      scheduledDateFrom: dateRange.from || undefined,
      scheduledDateTo: dateRange.to || undefined,
      includeArchived: includeArchived || undefined,
      page: pageNumber - 1, // URL is 1-based; backend Spring Page is 0-based
      size: PAGE_SIZE,
    }),
    [tab, deferredSearch, typeIds, divisionIds, regionIds, itemStatusIds, assignedId, dateRange, includeArchived, pageNumber]
  );

  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ['work-orders', queryParams],
    queryFn: () => workOrderApi.getAll(queryParams),
  });

  const workOrders: WorkOrderSummary[] = pageData?.content ?? [];
  const totalElements = pageData?.totalElements ?? 0;
  const totalPages = pageData?.totalPages ?? 0;

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

              {activeDivisions.length > 0 && (
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

              {activeRegions.length > 0 && (
                <FilterChipListbox
                  multiple
                  label={t('workOrders.filters.region')}
                  ariaLabel={t('workOrders.filters.region')}
                  value={regionIds}
                  displayValue={formatMultiValue(regionIds, activeRegions)}
                  onChange={(ids) => updateParams({ region: ids, page: null })}
                  onClear={() => updateParams({ region: [], page: null })}
                >
                  {activeRegions.map((r) => (
                    <ChipListboxOption key={r.id} value={r.id}>
                      {r.name}
                    </ChipListboxOption>
                  ))}
                </FilterChipListbox>
              )}

              {activeItemStatuses.length > 0 && (
                <FilterChipListbox
                  multiple
                  label={t('workOrders.filters.itemStatus')}
                  ariaLabel={t('workOrders.filters.itemStatus')}
                  value={itemStatusIds}
                  displayValue={formatMultiValue(itemStatusIds, activeItemStatuses)}
                  onChange={(ids) => updateParams({ itemStatus: ids, page: null })}
                  onClear={() => updateParams({ itemStatus: [], page: null })}
                >
                  {activeItemStatuses.map((s) => (
                    <ChipListboxOption key={s.id} value={s.id}>
                      {s.name}
                    </ChipListboxOption>
                  ))}
                </FilterChipListbox>
              )}

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

              {/* Archived: hidden by default. "Archived only" is a backend
                  gap (no `archivedOnly` param yet) — surfaced as an option
                  but mapped to includeArchived=true for now so the user
                  isn't blocked from at least *finding* archived rows. */}
              <FilterChipListbox
                label={t('workOrders.filters.archived')}
                ariaLabel={t('workOrders.filters.archived')}
                value={includeArchived ? 'shown' : null}
                displayValue={includeArchived ? t('workOrders.filters.archivedShown') : null}
                onChange={(id) => {
                  updateParams({
                    archived: id === 'shown' || id === 'only' ? 'true' : null,
                    page: null,
                  });
                }}
                onClear={() => updateParams({ archived: null, page: null })}
                resetLabel={t('workOrders.filters.archivedHidden')}
              >
                <ChipListboxOption value="shown">{t('workOrders.filters.archivedShown')}</ChipListboxOption>
              </FilterChipListbox>

              {activeChips.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-1 text-[11.5px] font-medium text-fg-muted underline-offset-2 hover:underline hover:text-fg-strong"
                >
                  {t('workOrders.filters.clearAll')}
                </button>
              )}
          </ListToolbar>

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

        {pageData && workOrders.length === 0 && activeChips.length === 0 && tabId === DEFAULT_TAB && (
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

        {pageData && workOrders.length === 0 && (activeChips.length > 0 || tabId !== DEFAULT_TAB) && (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {t('common.actions.noMatchSearch', { entities: getName('work_order', true) })}
              </p>
              {activeChips.length > 0 && (
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
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('workOrders.table.id')}</th>
                    <th>{getName('service_location')}</th>
                    <th>{t('workOrders.table.work')}</th>
                    <th>{t('workOrders.table.type')}</th>
                    <th>{t('workOrders.table.statusHeader')}</th>
                    <th>{t('workOrders.table.priority')}</th>
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
                    return (
                      <DenseRow key={workOrder.id} className={dimmed ? 'opacity-60' : undefined}>
                        <td>
                          <CellStack>
                            <CellTop>
                              <RouterLink
                                to={`/work-orders/${workOrder.id}`}
                                className="id-mono text-fg-muted hover:text-accent-500 hover:underline"
                              >
                                {workOrder.workOrderNumber || `#${workOrder.id.substring(0, 8)}`}
                              </RouterLink>
                            </CellTop>
                            {archived && (
                              <CellSub>{t('workOrders.actions.archived')}</CellSub>
                            )}
                          </CellStack>
                        </td>
                        <td>
                          <CellStack>
                            <CellTop>
                              <span className="dt-inline-label">{getName('service_location')}: </span>
                              {workOrder.serviceLocation?.locationName || workOrder.customer?.name || '-'}
                            </CellTop>
                            <CellSub>
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
                        <td data-label={t('workOrders.table.work')}>
                          <WorkItemsCell
                            items={workOrder.workItems}
                            totalCount={workOrder.workItemCount}
                          />
                        </td>
                        <td
                          className={clsx(!activeTypes.find((tp) => tp.id === workOrder.workOrderTypeId) && 'dt-empty')}
                          data-label={t('workOrders.table.type')}
                        >
                          {activeTypes.find((tp) => tp.id === workOrder.workOrderTypeId)?.name ?? '—'}
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
                            <Pill tone={PROGRESS_TONES[workOrder.progressCategory]} dot>
                              {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
                            </Pill>
                          )}
                        </td>
                        <td>
                          <Pill tone={PRIORITY_TONES[workOrder.priority ?? 'NORMAL']}>
                            {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[workOrder.priority ?? 'NORMAL']}`)}
                          </Pill>
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
