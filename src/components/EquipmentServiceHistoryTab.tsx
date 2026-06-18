/* eslint-disable i18next/no-literal-string -- dense detail tab; short operational labels + column heads stay literal to match the Location/Customer work-order tabs. */
// Equipment service history — the longitudinal marquee. Toolbar (search + range)
// → dense table → footer, newest-first, live row tinted. Models the
// ServiceLocationDetailPage work-order list: AssignedUsersCell tech column,
// progress-tone status pill, derived "what was done" summary, row tint. Tech
// comes from the WO's assigned users; Hours isn't on the summary yet → "—".
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { workOrderApi, type ProgressCategory, type WorkOrderSummary } from '../api';
import { DenseTable, DenseTHead, DenseRow } from './ui/DenseTable';
import { Pill } from './ui/Pill';
import { AssignedUsersCell } from './ui/AssignedUsersCell';
import { ListFooter } from './ui/ListFooter';
import { useUrlPage } from '../hooks/useUrlPage';
import { formatTimestamp } from '../lib/formatTimestamp';

const PAGE_SIZE = 25;

// Progress → Pill tone + label, mirroring ServiceLocationDetailPage's WoStatusPill.
const PROGRESS: Record<ProgressCategory, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  AWAITING_SCHEDULE: { label: 'Awaiting schedule', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  BLOCKED: { label: 'Blocked', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

// "What was done" — the WO's summary, else the first work item (+N more). Same
// derivation the Location/Customer work-order lists use.
function deriveJobLabel(wo: WorkOrderSummary): string {
  const summary = (wo as { summary?: string | null }).summary;
  if (summary) return summary;
  const first = wo.workItems[0]?.description;
  if (!first) return '—';
  const more = Math.max(0, wo.workItemCount - 1);
  return more > 0 ? `${first} +${more} more` : first;
}

// Live/behind row tint, mirroring ServiceLocationDetailPage.woRowTint.
function rowTint(wo: WorkOrderSummary): string {
  if (wo.lifecycleState === 'CANCELLED') return '';
  if (wo.progressCategory === 'IN_PROGRESS') {
    return 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]';
  }
  const elevated = wo.priority === 'URGENT' || wo.priority === 'HIGH';
  if (!wo.scheduledDate && elevated) {
    return 'bg-[color-mix(in_oklch,var(--warning-500)_7%,var(--bg-elev))]';
  }
  return '';
}

type RangeId = 'all' | '1y' | '2y';
// Range select → a scheduledDateFrom (yyyy-mm-dd). Module scope keeps the clock
// read out of the component's pure path.
function rangeFrom(range: RangeId): string | undefined {
  if (range === 'all') return undefined;
  const d = new Date();
  d.setFullYear(d.getFullYear() - (range === '2y' ? 2 : 1));
  return d.toISOString().slice(0, 10);
}

export default function EquipmentServiceHistoryTab({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeId>('all');
  const { page, pageHref, resetPage } = useUrlPage('serviceHistoryPage');
  const deferredSearch = useDeferredValue(search);
  const scheduledFrom = rangeFrom(range);

  const { data, isLoading, error } = useQuery({
    queryKey: ['work-orders-list', { equipmentId, q: deferredSearch, range, page }] as const,
    queryFn: () =>
      workOrderApi.getAll({
        equipmentId,
        q: deferredSearch || undefined,
        scheduledDateFrom: scheduledFrom,
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
      {/* Toolbar — search · range · count */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[200px] max-w-[320px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            placeholder="Search work, tech, WO#…"
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
        <select
          value={range}
          onChange={(e) => {
            setRange(e.target.value as RangeId);
            resetPage();
          }}
          aria-label="Date range"
          className="h-8 rounded-md border border-border bg-bg-elev px-2 text-[12px] text-fg"
        >
          <option value="all">All time</option>
          <option value="1y">Past year</option>
          <option value="2y">Past 2 years</option>
        </select>
        <span className="flex-1" />
        {total > 0 && <span className="text-[11.5px] text-fg-muted">{total.toLocaleString()} visits</span>}
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
                const progress = PROGRESS[wo.progressCategory];
                const cancelled = wo.lifecycleState === 'CANCELLED';
                return (
                  <DenseRow
                    key={wo.id}
                    className={`cursor-pointer ${rowTint(wo)}`}
                    onClick={() => navigate(`/work-orders/${wo.id}`)}
                  >
                    {/* Cell text colors live on spans — `.dense-table td` sets an
                        unlayered color that would otherwise override td-level utilities. */}
                    <td className="whitespace-nowrap">
                      <span className="text-[11.5px] text-fg-muted">{formatTimestamp(dateIso)}</span>
                    </td>
                    <td>
                      <span className="font-mono text-[11.5px] font-semibold text-fg-accent">{woNumber}</span>
                    </td>
                    <td className="max-w-[360px] truncate text-[12px]" title={deriveJobLabel(wo)}>
                      {deriveJobLabel(wo)}
                    </td>
                    <td>
                      <AssignedUsersCell users={wo.assignedUsers} />
                    </td>
                    <td className="right">
                      <span className="font-mono text-[12px] tabular-nums text-fg-dim">—</span>
                    </td>
                    <td>
                      {cancelled ? (
                        <Pill tone="neutral">Cancelled</Pill>
                      ) : (
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
