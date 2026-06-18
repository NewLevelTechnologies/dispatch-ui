/* eslint-disable i18next/no-literal-string -- dense detail tab; short operational labels + column heads stay literal to match the Location/Customer work-order tabs. */
// Equipment service history — the longitudinal marquee. A dense, filterable,
// paged table of every work order touching this unit (newest first), modeled on
// the Location/Customer work-order tabs. Tech comes from the WO's assigned
// users; Hours isn't on the summary yet, so it renders "—".
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { workOrderApi, type ProgressCategory, type WorkOrderSummary } from '../api';
import { DenseTable, DenseTHead, DenseRow } from './ui/DenseTable';
import { Pill } from './ui/Pill';
import { FilterChipListbox, ChipListboxOption } from './ui/FilterChipListbox';
import { DateRangeChip } from './ui/DateRangeChip';
import { EMPTY_DATE_RANGE, type DateRange } from '../lib/dateRangePresets';
import { ListFooter } from './ui/ListFooter';
import { useUrlPage } from '../hooks/useUrlPage';
import { formatTimestamp } from '../lib/formatTimestamp';

const PAGE_SIZE = 25;

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'accent';
const PROGRESS: Record<ProgressCategory, { label: string; tone: PillTone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  AWAITING_SCHEDULE: { label: 'Awaiting schedule', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'accent' },
  BLOCKED: { label: 'Blocked', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'AWAITING_SCHEDULE', label: 'Awaiting schedule' },
  { id: 'BLOCKED', label: 'Blocked' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'NOT_STARTED', label: 'Not started' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

// Live row tint — an in-progress visit reads as the active one.
function rowTint(wo: WorkOrderSummary): string {
  if (wo.lifecycleState === 'CANCELLED') return '';
  return wo.progressCategory === 'IN_PROGRESS'
    ? 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]'
    : '';
}

export default function EquipmentServiceHistoryTab({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const { page, pageHref, resetPage } = useUrlPage('serviceHistoryPage');
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'work-orders-list',
      { equipmentId, q: deferredSearch, status: statusId, from: dateRange.from, to: dateRange.to, page },
    ] as const,
    queryFn: () =>
      workOrderApi.getAll({
        equipmentId,
        q: deferredSearch || undefined,
        progressCategory: (statusId || undefined) as ProgressCategory | undefined,
        scheduledDateFrom: dateRange.from || undefined,
        scheduledDateTo: dateRange.to || undefined,
        page: page - 1,
        size: PAGE_SIZE,
        sort: 'scheduledDate,desc',
      }),
  });

  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const setSearchAndReset = (v: string) => {
    setSearch(v);
    resetPage();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[200px] max-w-[320px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            placeholder="Search work orders…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearchAndReset('')}
              className="px-1 text-[11px] text-fg-dim hover:text-fg-strong"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <FilterChipListbox
          label="Status"
          ariaLabel="Status"
          value={statusId || null}
          displayValue={STATUS_FILTERS.find((s) => s.id === statusId)?.label ?? 'All'}
          onChange={(id) => {
            setStatusId((id as string) ?? '');
            resetPage();
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <ChipListboxOption key={s.id || 'all'} value={s.id}>
              {s.label}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
        <DateRangeChip
          label="Scheduled"
          ariaLabel="Scheduled date"
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            resetPage();
          }}
        />
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-[10px] border border-border px-3.5 py-8 text-center text-[12px] text-danger-600">
          Couldn’t load service history.
        </div>
      ) : isLoading ? (
        <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border px-3.5 py-10 text-center text-[12px] text-fg-muted">
          No work orders for this unit.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <DenseTable>
            <DenseTHead>
              <tr>
                <th>Date</th>
                <th>Work order</th>
                <th>What was done</th>
                <th>Tech</th>
                <th className="right">Hours</th>
                <th>Status</th>
              </tr>
            </DenseTHead>
            <tbody>
              {rows.map((wo) => {
                const dateIso = wo.scheduledDate ?? wo.completedDate ?? wo.createdAt;
                const woNumber = wo.workOrderNumber ?? `#${wo.id.slice(0, 8)}`;
                const firstItem = wo.workItems[0];
                const extra = wo.workItemCount - 1;
                const techs = wo.assignedUsers ?? [];
                const progress = PROGRESS[wo.progressCategory];
                return (
                  <DenseRow
                    key={wo.id}
                    className={`cursor-pointer ${rowTint(wo)}`}
                    onClick={() => navigate(`/work-orders/${wo.id}`)}
                  >
                    <td className="whitespace-nowrap text-[11.5px] text-fg-muted">{formatTimestamp(dateIso)}</td>
                    <td className="font-mono text-[11.5px] text-fg-accent">{woNumber}</td>
                    <td>
                      <span className="text-[12px] text-fg">{firstItem?.description ?? '—'}</span>
                      {extra > 0 && <span className="ml-1 text-[11px] text-fg-dim">+{extra} more</span>}
                    </td>
                    <td className="text-[12px] text-fg">
                      {techs.length > 0 ? (
                        <>
                          {techs[0].name ?? 'Unassigned'}
                          {techs.length > 1 && <span className="text-fg-dim"> +{techs.length - 1}</span>}
                        </>
                      ) : (
                        <span className="text-fg-dim">—</span>
                      )}
                    </td>
                    <td className="right font-mono text-[12px] tabular-nums text-fg-dim">—</td>
                    <td>
                      {progress && (
                        <Pill tone={progress.tone} dot live={wo.progressCategory === 'IN_PROGRESS'}>
                          {progress.label}
                        </Pill>
                      )}
                    </td>
                  </DenseRow>
                );
              })}
            </tbody>
          </DenseTable>
        </div>
      )}

      <ListFooter
        page={page}
        totalPages={totalPages}
        pageHref={pageHref}
        left={total > 0 ? <>Showing <strong>{showingStart}–{showingEnd}</strong> of {total.toLocaleString()}</> : undefined}
      />
    </div>
  );
}
