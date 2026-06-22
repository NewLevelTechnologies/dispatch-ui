/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short labels stay literal to match ServiceLocationDetailPage. */
// Customer work orders tab — the customer's full WO list (all locations), with
// the same toolbar (search · Status · Type · Scheduled-date) + server-side
// filtering + pagination as the Location detail Jobs tab, scoped to the
// customer. Row treatment matches that page (WO# + type pill + elevated-priority
// chip + summary subline · count-led Equipment · Status · Assigned · Scheduled)
// via the DenseTable primitive. (The shared row helpers should fold into ONE
// component with the Location page's copy during the SINGLE extraction pass.)
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  workOrderApi,
  workOrderTypesApi,
  type ListWorkOrdersParams,
  type ProgressCategory,
  type WorkOrderPriority,
  type WorkOrderSummary,
} from '../../api';
import { EMPTY_DATE_RANGE, type DateRange } from '../../lib/dateRangePresets';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Pill } from '../ui/Pill';
import { WorkOrderTypePill } from '../ui/WorkOrderTypePill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import { SortHeader, type SortState } from '../ui/SortHeader';
import { AssignedUsersCell } from '../ui/AssignedUsersCell';
import { FilterChipListbox, ChipListboxOption } from '../ui/FilterChipListbox';
import { DateRangeChip } from '../ui/DateRangeChip';
import { ListFooter } from '../ui/ListFooter';
import { useUrlPage } from '../../hooks/useUrlPage';

type PillTone = 'neutral' | 'info' | 'success' | 'warning';

const WO_PROGRESS_TONE: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'info',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};
const WO_PROGRESS_KEY: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};
const WO_PRIORITY_KEY: Record<WorkOrderPriority, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

// Single-select status filter — mirror of the Location Jobs tab. Maps each
// choice to the backend lifecycle/progress params (no combined status enum).
const JOB_STATUS_FILTERS: {
  id: string;
  labelKey: string;
  params: Pick<ListWorkOrdersParams, 'lifecycleState' | 'progressCategory'>;
}[] = [
  { id: 'open', labelKey: 'workOrders.filters.open', params: { lifecycleState: 'ACTIVE' } },
  { id: 'notStarted', labelKey: 'workOrders.filters.notStarted', params: { progressCategory: 'NOT_STARTED' } },
  { id: 'inProgress', labelKey: 'workOrders.filters.inProgress', params: { progressCategory: 'IN_PROGRESS' } },
  { id: 'blocked', labelKey: 'workOrders.filters.blocked', params: { progressCategory: 'BLOCKED' } },
  { id: 'completed', labelKey: 'workOrders.filters.completed', params: { progressCategory: 'COMPLETED' } },
  { id: 'cancelled', labelKey: 'workOrders.filters.cancelled', params: { lifecycleState: 'CANCELLED' } },
  { id: 'all', labelKey: 'workOrders.filters.all', params: {} },
];
const JOBS_PAGE_SIZE = 25;

function formatWoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Prefer the backend-derived `summary` (on the wire but not yet on the dev
// `WorkOrderSummary` type — read via a narrow cast); fall back to the first work
// item + "N more", then the type name.
function deriveJobLabel(wo: WorkOrderSummary, typeName?: string): string {
  const summary = (wo as { summary?: string | null }).summary;
  if (summary) return summary;
  const first = wo.workItems[0]?.description;
  if (!first) return typeName || '—';
  const more = Math.max(0, wo.workItemCount - 1);
  return more > 0 ? `${first} +${more} more` : first;
}

export default function CustomerWorkOrdersTab({
  customerId,
  canCreate,
  onNewJob,
}: {
  customerId: string;
  canCreate: boolean;
  onNewJob: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Default to All — this tab is the customer's full history, not just open.
  const [statusId, setStatusId] = useState('all');
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'scheduledDate', dir: 'desc' });
  const { page, pageHref, resetPage } = useUrlPage('jobsPage');
  const deferredSearch = useDeferredValue(search.trim());

  // WO sort keys (scheduledDate / workOrderNumber) read newest-first → desc on
  // first click; toggle on re-click.
  const onSort = (key: string) => {
    setSort((s) => (key === s.key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    resetPage();
  };

  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeTypes = useMemo(() => (Array.isArray(workOrderTypes) ? workOrderTypes : []), [workOrderTypes]);
  const typeName = (id?: string | null) => safeTypes.find((tp) => tp.id === id)?.name;

  const statusParams = JOB_STATUS_FILTERS.find((s) => s.id === statusId)?.params ?? {};

  const params: ListWorkOrdersParams = {
    customerId,
    ...statusParams,
    workOrderTypeIds: typeIds.length ? typeIds : undefined,
    scheduledDateFrom: dateRange.from || undefined,
    scheduledDateTo: dateRange.to || undefined,
    q: deferredSearch || undefined,
    page: page - 1, // local state 1-based; backend Page 0-based
    size: JOBS_PAGE_SIZE,
    sort: `${sort.key},${sort.dir}` as ListWorkOrdersParams['sort'],
  };

  // Prefix ['work-orders', …] so WO/dispatch mutations (which invalidate
  // ['work-orders'] / ['work-orders-list']) refresh this list too.
  const { data, isLoading } = useQuery({
    queryKey: ['work-orders', 'customer-jobs', params],
    queryFn: () => workOrderApi.getAll(params),
  });
  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const filtersActive =
    statusId !== 'all' || typeIds.length > 0 || Boolean(dateRange.from || dateRange.to) || !!deferredSearch;
  const showingStart = total === 0 ? 0 : (page - 1) * JOBS_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * JOBS_PAGE_SIZE, total);

  const clearFilters = () => {
    setStatusId('all');
    setTypeIds([]);
    setDateRange(EMPTY_DATE_RANGE);
    setSearch('');
    resetPage();
  };

  const typeDisplay =
    typeIds.length === 1 ? (typeName(typeIds[0]) ?? '1 selected') : typeIds.length > 1 ? `${typeIds.length} selected` : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search WO#, summary, tech, equipment…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                resetPage();
              }}
              className="px-1 text-[11px] text-fg-dim hover:text-fg-strong"
            >
              ×
            </button>
          )}
        </div>

        <FilterChipListbox
          label="Status"
          ariaLabel="Status"
          value={statusId}
          displayValue={t(JOB_STATUS_FILTERS.find((s) => s.id === statusId)?.labelKey ?? '')}
          onChange={(id) => {
            setStatusId(id as string);
            resetPage();
          }}
        >
          {JOB_STATUS_FILTERS.map((s) => (
            <ChipListboxOption key={s.id} value={s.id}>
              {t(s.labelKey)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        {safeTypes.length > 0 && (
          <FilterChipListbox
            multiple
            label="Type"
            ariaLabel="Type"
            value={typeIds}
            displayValue={typeDisplay}
            onChange={(ids) => {
              setTypeIds(ids as string[]);
              resetPage();
            }}
            onClear={() => {
              setTypeIds([]);
              resetPage();
            }}
          >
            {safeTypes.map((tp) => (
              <ChipListboxOption key={tp.id} value={tp.id}>
                {tp.name}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}

        <DateRangeChip
          label={t('workOrders.table.scheduled')}
          ariaLabel="Scheduled date"
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            resetPage();
          }}
        />

        {filtersActive && (
          <Button plain size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}

        <span className="grow" />
        {canCreate && (
          <Button color="accent" size="xs" onClick={onNewJob}>
            <PlusIcon className="size-4" />
            {t('common.actions.new', { entity: getName('work_order') })}
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('work_order', true) })}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive
                ? 'No matching work orders'
                : t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust your search or clear filters.'
                : `${getName('work_order', true)} for this customer will appear here.`}
            </div>
            {filtersActive && (
              <Button plain size="xs" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DenseTable className="dense-stack">
                <DenseTHead>
                  <tr>
                    <SortHeader sortKey="workOrderNumber" label={getName('work_order')} current={sort} onSort={onSort} />
                    <th>{getName('equipment')}</th>
                    <th>{t('workOrders.table.statusHeader')}</th>
                    <th>{t('workOrders.table.assigned')}</th>
                    <SortHeader sortKey="scheduledDate" label={t('workOrders.table.scheduled')} current={sort} onSort={onSort} />
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((wo) => (
                    <JobDenseRow
                      key={wo.id}
                      wo={wo}
                      typeName={typeName(wo.workOrderTypeId)}
                      typeAccentId={safeTypes.find((tp) => tp.id === wo.workOrderTypeId)?.accentId}
                    />
                  ))}
                </tbody>
              </DenseTable>
            </div>
            <ListFooter
              page={page}
              totalPages={totalPages}
              pageHref={pageHref}
              left={t('common.pagination.showing', {
                start: showingStart,
                end: showingEnd,
                total: total.toLocaleString(),
              })}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function JobDenseRow({
  wo,
  typeName,
  typeAccentId,
}: {
  wo: WorkOrderSummary;
  typeName?: string;
  typeAccentId?: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const priority = wo.priority ?? 'NORMAL';
  const elevated = priority === 'URGENT' || priority === 'HIGH';
  const jobLabel = deriveJobLabel(wo, typeName);
  const tintClass =
    wo.lifecycleState === 'CANCELLED'
      ? undefined
      : wo.progressCategory === 'IN_PROGRESS'
        ? 'row-live'
        : !wo.scheduledDate && elevated
          ? 'row-warn'
          : undefined;

  return (
    <DenseRow className={tintClass} onClick={() => navigate(`/work-orders/${wo.id}`)}>
      <td>
        <CellStack>
          <CellTop>
            <span className="flex flex-wrap items-baseline gap-1.5">
              {/* Navigable identifier → accent link (the row routes to the WO detail). */}
              <span className="font-mono font-bold text-fg-accent">
                {wo.workOrderNumber || `#${wo.id.slice(0, 8)}`}
              </span>
              <WorkOrderTypePill type={{ name: typeName, accentId: typeAccentId }} />
              {elevated && (
                <span
                  className="rounded-[3px] px-1.5 text-[9.5px] font-bold tracking-wide"
                  style={{
                    background: 'color-mix(in oklch, var(--danger-500) 14%, transparent)',
                    color: 'var(--danger-500)',
                  }}
                >
                  {t(`workOrders.priority.${WO_PRIORITY_KEY[priority]}`).toUpperCase()}
                </span>
              )}
            </span>
          </CellTop>
          <CellSub>{jobLabel}</CellSub>
        </CellStack>
      </td>
      <td className={clsx('muted', !(wo.equip && wo.equip.count > 0) && 'dt-empty')} data-label={getName('equipment')}>
        {wo.equip && wo.equip.count > 0 ? wo.equip.label : <span className="text-fg-dim">—</span>}
      </td>
      <td>
        {wo.lifecycleState === 'CANCELLED' ? (
          <Pill tone="neutral">{t('workOrders.actions.cancelledBadge', { defaultValue: 'Cancelled' })}</Pill>
        ) : (
          <Pill tone={WO_PROGRESS_TONE[wo.progressCategory]} dot>
            {t(`workOrders.progress.${WO_PROGRESS_KEY[wo.progressCategory]}`)}
          </Pill>
        )}
      </td>
      <td className={clsx(!wo.assignedUsers?.length && 'dt-empty')} data-label={t('workOrders.table.assigned')}>
        <AssignedUsersCell users={wo.assignedUsers} />
      </td>
      <td className={clsx('muted', !wo.scheduledDate && 'dt-empty')} data-label={t('workOrders.table.scheduled')}>{formatWoDate(wo.scheduledDate)}</td>
    </DenseRow>
  );
}
