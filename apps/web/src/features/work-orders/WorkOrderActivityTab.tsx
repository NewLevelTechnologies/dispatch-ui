/* eslint-disable i18next/no-literal-string -- dense activity feed; entity names route through getName(), inline glyphs and short operational labels stay literal (same convention as LocationActivityStream). */
// The work order's Activity tab: the full history, newest first, grouped by
// day. Same layout as the Location and Customer tabs (type chips, an audit
// toggle, an actor column, links to what each row is about), and each
// dispatch's steps fold into one row ("n updates ▸").
//
// Streams, merged by time: the work order's own feed (work order, work items,
// dispatches, notes, uploads), its quote/invoice/payment steps from
// financial-service, its purchase order steps from inventory-service, and,
// for the Changes chip and audit detail, the work order's field-change audit
// trail. Messages join when their stream lands.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { activityApi, auditApi, type ActivityCategory, type ActivityEvent } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { ActGlyph, ActorCell, AuditRow, EventCell } from '../../components/LocationActivityStream';
import { LoadingState } from '../../components/ui/LoadingState';
import { buildWorkOrderDays, type WoSingleRow } from '../../lib/workOrderActivityRows';

const PAGE_SIZE = 50;
const AUDIT_LIMIT = 200;

type ChipId = 'all' | 'dispatch' | 'item' | 'billing' | 'purchasing' | 'note' | 'change';

const CHIP_CATEGORY: Partial<Record<ChipId, ActivityCategory[]>> = {
  dispatch: ['DISPATCH'],
  item: ['WORK_ITEM'],
  note: ['NOTE'],
};

export default function WorkOrderActivityTab({ workOrderId }: { workOrderId: string }) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const canViewAudit = useHasCapability('VIEW_AUDIT_LOGS');
  const [chip, setChip] = useState<ChipId>('all');
  const [showAudit, setShowAudit] = useState(false);

  // Changes is the CHANGE rows on their own; elsewhere the toggle adds them.
  const classification = chip === 'change' ? 'CHANGE' : showAudit ? 'ALL' : 'BUSINESS';
  const categories = CHIP_CATEGORY[chip];
  // Work order field edits are neither dispatches, items nor notes.
  const auditActive = canViewAudit && (chip === 'change' || (chip === 'all' && showAudit));

  const feedActive = chip !== 'billing' && chip !== 'purchasing';
  const financialActive = chip === 'all' || chip === 'billing';
  const purchasingActive = chip === 'all' || chip === 'purchasing';

  const feed = useInfiniteQuery({
    queryKey: ['work-order-activity', workOrderId, 'tab', categories ?? 'ALL', classification],
    queryFn: ({ pageParam }) =>
      activityApi.list(workOrderId, { cursor: pageParam, limit: PAGE_SIZE, categories, classification }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!workOrderId && feedActive,
  });
  // Quote, invoice and payment steps. Takes no filters; change rows drop out client-side.
  const financial = useInfiniteQuery({
    queryKey: ['work-order-activity', workOrderId, 'financial'],
    queryFn: ({ pageParam }) => activityApi.listFinancial(workOrderId, { cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!workOrderId && financialActive,
  });
  // Purchase order steps; likewise unfiltered.
  const purchasing = useInfiniteQuery({
    queryKey: ['work-order-activity', workOrderId, 'purchasing'],
    queryFn: ({ pageParam }) => activityApi.listPurchasing(workOrderId, { cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!workOrderId && purchasingActive,
  });
  const audit = useQuery({
    queryKey: ['work-order-audit', workOrderId],
    queryFn: () => auditApi.getWorkOrderChanges(workOrderId, AUDIT_LIMIT),
    enabled: !!workOrderId && auditActive,
  });

  // Paged streams merge cleanly only down to the newest "oldest loaded" row of
  // any stream with more to load: below it, that stream may still have rows to
  // slot in, so those wait for its next page.
  const streams = useMemo(() => {
    const out: { events: ActivityEvent[]; hasMore: boolean; fetchMore: () => void }[] = [];
    if (feedActive) {
      out.push({
        events: feed.data?.pages.flatMap((p) => p.content) ?? [],
        hasMore: !!feed.hasNextPage,
        fetchMore: () => void feed.fetchNextPage(),
      });
    }
    // The other services' streams take no filters; change rows drop out here.
    for (const [active, q] of [
      [financialActive, financial],
      [purchasingActive, purchasing],
    ] as const) {
      if (!active) continue;
      const rows = q.data?.pages.flatMap((p) => p.content) ?? [];
      out.push({
        events: classification === 'BUSINESS' ? rows.filter((e) => e.classification !== 'CHANGE') : rows,
        hasMore: !!q.hasNextPage,
        fetchMore: () => void q.fetchNextPage(),
      });
    }
    return out;
  }, [feedActive, financialActive, purchasingActive, feed, financial, purchasing, classification]);
  const oldest = (evts: ActivityEvent[]) => evts[evts.length - 1]?.timestamp ?? '';
  const boundary = streams
    .filter((st) => st.hasMore)
    .map((st) => oldest(st.events))
    .reduce((max, ts) => (ts > max ? ts : max), '');
  const events = useMemo(
    () =>
      streams
        .flatMap((st) => st.events)
        .filter((e) => !boundary || e.timestamp >= boundary)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [streams, boundary],
  );
  const days = useMemo(
    () =>
      buildWorkOrderDays({
        events,
        audit: auditActive ? (audit.data ?? []) : [],
        t,
        getName,
        getAbbrev,
      }),
    [events, audit.data, auditActive, t, getName, getAbbrev],
  );

  // Older pages load as the end of the list scrolls into view: the next page
  // of each stream holding the merge back.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasNextPage = streams.some((st) => st.hasMore);
  const isFetchingNextPage = feed.isFetchingNextPage || financial.isFetchingNextPage || purchasing.isFetchingNextPage;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        for (const st of streams) if (st.hasMore && oldest(st.events) >= boundary) st.fetchMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, streams, boundary]);

  const chips: { id: ChipId; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dispatch', label: getName('dispatch', true) },
    { id: 'item', label: getName('work_item', true) },
    { id: 'billing', label: `${getName('quote', true)} & ${getName('invoice', true).toLowerCase()}` },
    { id: 'purchasing', label: 'Purchasing' },
    { id: 'note', label: 'Notes' },
    { id: 'change', label: 'Changes' },
  ];

  const loading =
    (feedActive && feed.isLoading) ||
    (financialActive && financial.isLoading) ||
    (purchasingActive && purchasing.isLoading) ||
    (auditActive && audit.isLoading);
  // A missing audit trail (no access, or audit-service down) shouldn't blank the
  // feed; neither should another service's stream failing on All.
  const error = chip === 'billing' ? financial.error : chip === 'purchasing' ? purchasing.error : feed.error;
  const empty = !loading && !error && days.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('workOrders.activity.heading')}>
          {chips.map((c) => {
            const selected = chip === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChip(c.id)}
                aria-pressed={selected}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 'var(--r-md)',
                  border: `1px solid ${selected ? 'color-mix(in oklch, var(--accent-500) 45%, var(--border))' : 'var(--border)'}`,
                  background: selected ? 'color-mix(in oklch, var(--accent-500) 9%, var(--bg-elev))' : 'var(--bg-elev)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: selected ? 'var(--fg-accent)' : 'var(--fg)',
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        {chip !== 'change' && (
          <label className="flex cursor-pointer items-center gap-[7px] text-xs" style={{ color: 'var(--fg-muted)' }}>
            <input
              type="checkbox"
              checked={showAudit}
              onChange={(e) => setShowAudit(e.target.checked)}
              style={{ accentColor: 'var(--accent-500)' }}
            />
            Include audit detail
          </label>
        )}
      </div>

      <div className="card">
        <div className="card-body flush">
          {loading && days.length === 0 && <LoadingState label={t('workOrders.activity.loading')} />}
          {error && (
            <div className="px-5 py-6 text-center text-sm text-danger-500">{t('workOrders.activity.errorLoading')}</div>
          )}
          {empty && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>No activity matches</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                {chip === 'change' ? 'No field changes recorded yet.' : 'Adjust the filter or include audit detail.'}
              </div>
            </div>
          )}

          {days.map((d) => (
            <div key={d.key}>
              <div
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-elev-2)',
                  borderTop: '1px solid var(--border-soft)',
                  borderBottom: '1px solid var(--border-soft)',
                }}
              >
                <span className="label-tiny" style={{ color: 'var(--fg)' }}>
                  {d.label}
                </span>
              </div>
              {d.rows.map((row) =>
                row.kind === 'audit' ? <AuditRow key={row.id} row={row} /> : <WoEventRow key={row.id} row={row} />,
              )}
            </div>
          ))}

          {hasNextPage && (
            <div ref={sentinelRef} style={{ padding: '8px 14px', textAlign: 'center' }}>
              <span className="text-xs" style={{ color: 'var(--fg-dim)' }}>
                {isFetchingNextPage ? t('workOrders.activity.loading') : t('workOrders.activity.loadMore')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const AuditTag = () => (
  <span
    className="ml-1.5 rounded px-1 align-[1px] text-[10px] font-semibold uppercase tracking-wide"
    style={{ background: 'var(--bg-active)', color: 'var(--fg-muted)' }}
  >
    Audit
  </span>
);

/** One event; a dispatch with earlier steps expands to list them, oldest first. */
function WoEventRow({ row }: { row: WoSingleRow }) {
  const [open, setOpen] = useState(false);
  const grouped = row.steps.length > 0;
  const toggle = () => setOpen((v) => !v);
  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)', background: row.change ? 'var(--bg-sunken)' : undefined }}>
      <div
        className={`activity-row${grouped ? ' cursor-pointer' : ''}`}
        {...(grouped
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              onClick: toggle,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              },
            }
          : {})}
      >
        <ActGlyph glyph={row.glyph} tone={row.tone} />
        <ActorCell name={row.actor} isPerson={row.isPerson} />
        <EventCell
          row={row}
          muted={row.change}
          groupSuffix={
            <>
              {row.change && <AuditTag />}
              {grouped && (
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 6 }}>
                  {`· ${row.steps.length} update${row.steps.length === 1 ? '' : 's'} ${open ? '▾' : '▸'}`}
                </span>
              )}
            </>
          }
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>
      {grouped && open && (
        <div style={{ padding: '2px 14px 9px 46px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {row.steps.map((s) => (
            <div key={s.id} className="flex items-baseline gap-2">
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', width: 14, textAlign: 'center' }} aria-hidden>
                {s.glyph}
              </span>
              <span style={{ fontSize: 12, color: s.change ? 'var(--fg-muted)' : 'var(--fg)' }}>{s.text}</span>
              {s.change && <AuditTag />}
              <span className="flex-1" />
              <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }} title={s.tsExact}>
                {s.ts}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
