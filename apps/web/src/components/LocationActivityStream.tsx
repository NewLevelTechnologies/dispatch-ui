// ─────────────────────────────────────────────────────────────────
// LocationActivityStream.tsx — the Location Activity tab: the full history
// (the Overview only teases 3). Implemented to match the design mock
// (claude_designs/screen-location-activity.jsx).
//
// Layered to stay scannable at volume:
//   • Business activity is the DEFAULT; field-level audit/change rows are
//     hidden behind a "Show all changes" toggle (off by default, gated by
//     VIEW_AUDIT_LOGS). The toggle is the master audit gate — the Changes
//     chip only surfaces rows once it's on.
//   • Day-grouped, reverse-chronological — the eye jumps by date.
//   • A work order's sub-events collapse into one row ("Arrived on site ·
//     WO-4203 · 6 updates ▸") so a verbose job lifecycle doesn't flood it;
//     expanding fetches the authoritative per-WO feed.
//   • Type filter chips (Jobs / Visits / Invoices / Payments / Notes /
//     Changes). Every row backlinks to the object it touched.
// ─────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  activityApi,
  auditApi,
  financialActivityApi,
  type ActivityCategory,
  type ListActivityParams,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { formatExactTimestamp, formatTimestamp, roleColor } from '@dispatch/utils';
import { ACTIVITY_TONE_STYLE, glyphFor, type ActivityTone } from '../lib/activityGlyph';
import {
  buildDays,
  isLongChange,
  type AuditChange,
  type AuditRowModel,
  type ChipId,
  type FinancialRow,
  type GetName,
  type GroupRow,
  type Row,
  type SingleRow,
  type TFunc,
} from '../lib/locationActivityRows';
import { resolveEventSummary } from './activityFormatters';
import { LoadingState } from './ui/LoadingState';

const PAGE_SIZE = 50;
// ISO-8601 instants at differing precision don't compare correctly as strings
// ("…00Z" vs "…00.5Z"), so parse to epoch ms for the merge-join frontier.
const tsMs = (s: string) => new Date(s).getTime();
// Bounded streams fetched whole (no cursor); request a generous cap so a busy
// location's history isn't silently truncated below the paginated business feed.
const AUDIT_LIMIT = 500;

// Three merged streams: business (work-order-service, cursor-paginated, the
// volume driver), financial (money milestones), and audit (location field
// edits). Chips select which streams are live; the "Show all changes" toggle
// flips business BUSINESS→ALL and adds audit. Row view-model + ChipId live in
// ../lib/locationActivityRows.

// Business-feed chips map to one coarse server category; the financial/audit
// chips pull their own streams instead.
const CHIP_CATEGORY: Partial<Record<ChipId, ActivityCategory>> = {
  job: 'STATUS',
  visit: 'DISPATCH',
  note: 'NOTE',
};
const BUSINESS_CHIPS: ChipId[] = ['all', 'job', 'visit', 'note'];
const FINANCIAL_CHIPS: ChipId[] = ['all', 'invoice', 'payment'];

// Scope-aware: the same merged feed powers the Location detail and the Customer
// detail Activity tabs. Location scope adds the audit (field-edit) stream + the
// "Changes" chip; customer scope has no audit source, so those are hidden. The
// business (work-order) + financial streams work for both — the customer-scoped
// endpoints return the identical row shape.
export type ActivityStreamScope =
  | { type: 'location'; id: string }
  | { type: 'customer'; id: string };

interface Props {
  // Pass exactly one. `customerId` selects the customer-scoped endpoints.
  serviceLocationId?: string;
  customerId?: string;
}

export default function LocationActivityStream({ serviceLocationId, customerId }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canViewAudit = useHasCapability('VIEW_AUDIT_LOGS');
  const scope: ActivityStreamScope = customerId
    ? { type: 'customer', id: customerId }
    : { type: 'location', id: serviceLocationId ?? '' };
  const isLocation = scope.type === 'location';
  const [chip, setChip] = useState<ChipId>('all');
  const [showChanges, setShowChanges] = useState(false);

  // Which streams are live for the current chip.
  const businessActive = BUSINESS_CHIPS.includes(chip);
  const financialActive = FINANCIAL_CHIPS.includes(chip);
  // Audit (location field edits) shows on the Changes chip, or interleaved on
  // All once "Show all changes" is on. Gated by capability — and only at
  // location scope (no customer-level audit stream).
  const auditActive = canViewAudit && isLocation && (chip === 'change' || (chip === 'all' && showChanges));

  const businessCategory: ActivityCategory[] | undefined = CHIP_CATEGORY[chip]
    ? [CHIP_CATEGORY[chip]!]
    : undefined;
  // The toggle flips the business stream BUSINESS→ALL (server brings in
  // status-change / note-delete CHANGE rows); BUSINESS hides that churn.
  const classification = showChanges ? 'ALL' : 'BUSINESS';

  const filterGroupRef = useRef<HTMLDivElement>(null);

  // `/` focuses the active chip — keyboard-first CSRs can arrow through filters.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
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
      const group = filterGroupRef.current;
      if (!group) return;
      const selected = group.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      const target2 = selected ?? group.querySelector<HTMLButtonElement>('button');
      if (target2) {
        e.preventDefault();
        target2.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Entity-backed chips flow through the glossary so a tenant who renames
  // Dispatch → Visit (or Work Order → Job) sees the filter match the rest of
  // the UI. Notes/Changes aren't glossary entities, so they stay static.
  const typeChips: { id: ChipId; label: string }[] = [
    { id: 'all', label: t('serviceLocations.activity.filter.all') },
    { id: 'job', label: getName('work_order', true) },
    { id: 'visit', label: getName('dispatch', true) },
    { id: 'invoice', label: getName('invoice', true) },
    { id: 'payment', label: getName('payment', true) },
    { id: 'note', label: t('serviceLocations.activity.filter.notes') },
    ...(canViewAudit && isLocation
      ? [{ id: 'change' as const, label: t('serviceLocations.activity.filter.changes') }]
      : []),
  ];

  // Stream 1 — business (cursor-paginated, the volume driver).
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: businessLoading,
    error: businessError,
  } = useInfiniteQuery({
    queryKey: [isLocation ? 'location-activity' : 'customer-activity', scope.id, businessCategory ?? 'ALL', classification],
    queryFn: ({ pageParam }) => {
      const params: ListActivityParams = {
        cursor: pageParam,
        limit: PAGE_SIZE,
        categories: businessCategory,
        classification,
      };
      return isLocation
        ? activityApi.listForLocation(scope.id, params)
        : activityApi.listForCustomer(scope.id, params);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!scope.id && businessActive,
  });

  // Stream 4 — financial milestones. Cursor-paginated for both scopes (same
  // envelope), co-paginated with the business stream below.
  const {
    data: financialPages,
    fetchNextPage: fetchNextFinancial,
    hasNextPage: financialHasNext,
    isFetchingNextPage: financialFetchingNext,
    isLoading: financialLoading,
    error: financialError,
  } = useInfiniteQuery({
    queryKey: ['financial-activity', scope.type, scope.id],
    queryFn: ({ pageParam }) => {
      const params = { cursor: pageParam, limit: PAGE_SIZE };
      return isLocation
        ? financialActivityApi.getForLocation(scope.id, params)
        : financialActivityApi.getForCustomer(scope.id, params);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!scope.id && financialActive,
  });
  const financialData = useMemo(
    () => financialPages?.pages.flatMap((p) => p.content) ?? [],
    [financialPages],
  );
  const financialHasMore = financialHasNext ?? false;

  // Stream 2 — audit (location field edits, bounded).
  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: ['location-audit', scope.id],
    queryFn: () => auditApi.getServiceLocationChanges(scope.id, AUDIT_LIMIT),
    enabled: !!scope.id && auditActive,
  });

  const events = useMemo(() => data?.pages.flatMap((p) => p.content) ?? [], [data]);

  // Co-pagination frontier. Two independently-paginated cursor streams can be
  // safely merged only down to the NEWEST of the still-undrained streams'
  // oldest-loaded timestamps — past that, the other stream may hold un-loaded
  // events that belong in between. Hold anything older back until the drained
  // stream loads more (advanced below). When both streams are fully loaded the
  // boundary is -∞ and nothing is held.
  const businessActiveHasMore = businessActive && (hasNextPage ?? false);
  const financialActiveHasMore = financialActive && financialHasMore;
  const boundaryMs = useMemo(() => {
    const undrained: number[] = [];
    if (businessActiveHasMore && events.length) undrained.push(tsMs(events[events.length - 1].timestamp));
    if (financialActiveHasMore && financialData.length) undrained.push(tsMs(financialData[financialData.length - 1].timestamp));
    return undrained.length ? Math.max(...undrained) : -Infinity;
  }, [businessActiveHasMore, financialActiveHasMore, events, financialData]);

  // Merge the live streams onto one day-grouped, WO-collapsed timeline. Disabled
  // React Query hooks retain their last data, so gate each stream by its active
  // flag — otherwise a previous chip's rows leak into the current view.
  const days = useMemo(
    () =>
      buildDays({
        events: businessActive ? events.filter((e) => tsMs(e.timestamp) >= boundaryMs) : [],
        financial: financialActive ? financialData.filter((f) => tsMs(f.timestamp) >= boundaryMs) : [],
        audit: auditActive ? auditData ?? [] : [],
        chip,
        t,
        getName,
      }),
    [businessActive, financialActive, auditActive, events, financialData, auditData, boundaryMs, chip, t, getName]
  );

  // Combined infinite scroll across both cursor streams. On load-more, advance
  // the DRAINED stream — the one whose oldest-loaded is newest (it defines the
  // frontier) — so the held-back tail of the other stream fills in correctly.
  const combinedHasNext = businessActiveHasMore || financialActiveHasMore;
  const combinedFetching = isFetchingNextPage || (financialFetchingNext ?? false);
  const loadMore = useCallback(() => {
    if (combinedFetching) return;
    if (businessActiveHasMore && financialActiveHasMore) {
      const bizOldest = events.length ? tsMs(events[events.length - 1].timestamp) : -Infinity;
      const finOldest = financialData.length ? tsMs(financialData[financialData.length - 1].timestamp) : -Infinity;
      if (bizOldest >= finOldest) fetchNextPage();
      else fetchNextFinancial();
    } else if (businessActiveHasMore) {
      fetchNextPage();
    } else if (financialActiveHasMore) {
      fetchNextFinancial();
    }
  }, [combinedFetching, businessActiveHasMore, financialActiveHasMore, events, financialData, fetchNextPage, fetchNextFinancial]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !combinedHasNext || combinedFetching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [combinedHasNext, combinedFetching, loadMore]);

  const anyLoading =
    (businessActive && businessLoading) ||
    (financialActive && financialLoading) ||
    (auditActive && auditLoading);
  // Surface only the chip's primary stream's error — a supplementary stream
  // (e.g. financial-service down) shouldn't blank the business feed; it just
  // contributes nothing.
  const error = businessActive
    ? businessError
    : chip === 'change'
      ? auditError
      : financialError ?? null;
  const isLoading = anyLoading && days.length === 0;
  const isEmpty = !anyLoading && !error && days.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — type chips + audit toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div ref={filterGroupRef} className="flex flex-wrap gap-1" role="group"
          aria-label={t('serviceLocations.activity.heading')}>
          {typeChips.map((c) => {
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
                  border:
                    '1px solid ' +
                    (selected
                      ? 'color-mix(in oklch, var(--accent-500) 45%, var(--border))'
                      : 'var(--border)'),
                  background: selected
                    ? 'color-mix(in oklch, var(--accent-500) 9%, var(--bg-elev))'
                    : 'var(--bg-elev)',
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
        {canViewAudit && (
          <label
            className="flex cursor-pointer items-center gap-[7px] text-xs"
            style={{ color: 'var(--fg-muted)' }}
          >
            <input
              type="checkbox"
              checked={showChanges}
              onChange={(e) => setShowChanges(e.target.checked)}
              style={{ accentColor: 'var(--accent-500)' }}
            />
            {t('serviceLocations.activity.showChanges')}
          </label>
        )}
      </div>

      <div className="card">
        <div className="card-body flush">
          {isLoading && <LoadingState label={t('serviceLocations.activity.loading')} />}
          {error && (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <span className="text-sm text-danger-500">
                {t('serviceLocations.activity.errorLoading')}
              </span>
            </div>
          )}
          {isEmpty && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>
                {t('serviceLocations.activity.emptyTitle')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                {t('serviceLocations.activity.emptyHint')}
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
                row.kind === 'group' ? (
                  <WorkOrderGroupRow
                    key={row.id}
                    row={row}
                    categories={businessCategory}
                    classification={classification}
                    t={t}
                    getName={getName}
                  />
                ) : (
                  <ActivityRow key={row.id} row={row} />
                )
              )}
            </div>
          ))}

          {combinedHasNext && (
            <div ref={sentinelRef} style={{ padding: '8px 14px', textAlign: 'center' }}>
              <span className="text-xs" style={{ color: 'var(--fg-dim)' }}>
                {combinedFetching
                  ? t('serviceLocations.activity.loading')
                  : t('serviceLocations.activity.loadMore')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rows ──────────────────────────────────────────────────────────

function ActGlyph({ glyph, tone }: { glyph: string; tone: ActivityTone }) {
  const s = ACTIVITY_TONE_STYLE[tone] ?? ACTIVITY_TONE_STYLE.neutral;
  return (
    <div
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        display: 'grid',
        placeItems: 'center',
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {glyph}
    </div>
  );
}

function ActorCell({ name, isPerson }: { name: string; isPerson: boolean }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isPerson ? (
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            flexShrink: 0,
            background: roleColor(name),
            color: 'white',
            fontSize: 8,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {initials}
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            flexShrink: 0,
            background: 'var(--bg-active)',
            color: 'var(--fg-dim)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
          }}
        >
          ⚙
        </span>
      )}
      <span
        style={{
          fontSize: 11.5,
          color: 'var(--fg-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </div>
  );
}

function EventCell({
  row,
  groupSuffix,
  muted,
}: {
  row: Row;
  groupSuffix?: React.ReactNode;
  // Audit/change rows render in a quieter tone so business events lead the feed.
  muted?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          fontSize: 12.5,
          color: muted ? 'var(--fg-muted)' : 'var(--fg-strong)',
          fontWeight: muted ? 400 : 500,
        }}
      >
        {row.text}
      </span>
      {row.obj && (
        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          {' · '}
          {row.objHref ? (
            <Link
              to={row.objHref}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--fg-accent)', textDecoration: 'none' }}
            >
              {row.obj}
            </Link>
          ) : (
            <span style={{ color: 'var(--fg-accent)' }}>{row.obj}</span>
          )}
        </span>
      )}
      {groupSuffix}
    </div>
  );
}

// One field's before→after, styled so values lead and the connector recedes:
// values in --fg, the arrow dimmed (it's a connector, not data), and a cleared
// value as a muted "—" so it reads as "cleared", not a broken row.
function DeltaValue({ change }: { change: AuditChange }) {
  const value = (v: string) => <span style={{ color: 'var(--fg)' }}>{v}</span>;
  const dash = <span style={{ color: 'var(--fg-muted)' }}>—</span>;
  // A set-from-nothing edit has no "before" — show just the new value.
  if (change.oldValue == null && change.newValue != null) return value(change.newValue);
  return (
    <>
      {change.oldValue != null ? value(change.oldValue) : dash}
      <span style={{ color: 'var(--fg-dim)' }}> → </span>
      {change.newValue != null ? value(change.newValue) : dash}
    </>
  );
}

function ActivityRow({ row }: { row: SingleRow | AuditRowModel | FinancialRow }) {
  if (row.kind === 'audit') return <AuditRow row={row} />;
  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div className="activity-row">
        <ActGlyph glyph={row.glyph} tone={row.tone} />
        <ActorCell name={row.actor} isPerson={row.isPerson} />
        <EventCell row={row} />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>
    </div>
  );
}

// Audit rows sit on a recessed surface with muted text so that, with "Show all
// changes" on, business events still visually lead. A lone short field renders
// its delta inline; a long field or several render indented below.
function AuditRow({ row }: { row: AuditRowModel }) {
  const [open, setOpen] = useState(false);
  const reverted = !!row.reverted;
  // A lone short field shows its delta inline; reverted pairs collapse to the
  // header and reveal both steps on expand; everything else lists its deltas.
  const inlineChange =
    !reverted && row.changes.length === 1 && !isLongChange(row.changes[0]) ? row.changes[0] : null;
  const indented = reverted ? (open ? row.changes : []) : inlineChange ? [] : row.changes;
  const toggle = () => setOpen((v) => !v);

  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--bg-sunken)' }}>
      <div
        className={`activity-row${reverted ? ' cursor-pointer' : ''}`}
        {...(reverted
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
          muted
          groupSuffix={
            reverted ? (
              <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 6 }}>{open ? '▾' : '▸'}</span>
            ) : inlineChange ? (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                {' · '}
                <DeltaValue change={inlineChange} />
              </span>
            ) : undefined
          }
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>
      {indented.length > 0 && (
        <div style={{ padding: '0 14px 8px 46px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {indented.map((c, idx) => (
            <AuditChangeLine key={idx} change={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// One field diff under a multi-field audit row. Short values render inline as a
// styled before→after; long free-text values (summary, notes) collapse to a
// toggle that expands the full diff — so a 200-char summary edit can't blow the
// row out. The label is muted (audit tone); the value styling lives in DeltaValue.
function AuditChangeLine({ change }: { change: AuditChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = isLongChange(change);

  if (!long) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{change.label}:</span>
        <span style={{ fontSize: 12 }}>
          <DeltaValue change={change} />
        </span>
      </div>
    );
  }

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      style={{ fontSize: 11, color: 'var(--fg-accent)', background: 'none', cursor: 'pointer' }}
    >
      {open ? t('serviceLocations.activity.audit.hideDiff') : t('serviceLocations.activity.audit.showDiff')}
    </button>
  );

  // Free-text fields (summary, notes) never inline their before/after — even a
  // truncated preview wraps the row. Show just the field name + a toggle; the
  // full old→new lives behind the expand.
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{change.label}</span>
        {toggle}
      </div>
      {open && (
        <div className="flex flex-col gap-0.5" style={{ paddingLeft: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap' }}>
            − {change.oldValue ?? '—'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>
            + {change.newValue ?? '—'}
          </span>
        </div>
      )}
    </div>
  );
}

function WorkOrderGroupRow({
  row,
  categories,
  classification,
  t,
  getName,
}: {
  row: GroupRow;
  categories: ActivityCategory[] | undefined;
  classification: 'BUSINESS' | 'ALL';
  t: TFunc;
  getName: GetName;
}) {
  const [expanded, setExpanded] = useState(false);
  // Expand under the SAME category + classification filter the feed is showing,
  // so the rows that drop out match the group they belong to.
  const { data, isLoading, error } = useQuery({
    queryKey: ['work-order-activity-full', row.woId, categories ?? 'ALL', classification],
    queryFn: () => activityApi.list(row.woId, { limit: 200, categories, classification }),
    enabled: expanded,
  });
  const subEvents = data?.content ?? [];
  // The backend's pre-fetch count can drift from what actually expands under
  // this filter; once loaded, the label tracks the rows the CSR can see.
  const count = expanded && data ? subEvents.length : row.count;

  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="activity-row cursor-pointer"
      >
        <ActGlyph glyph={row.glyph} tone={row.tone} />
        <ActorCell name={row.actor} isPerson={row.isPerson} />
        <EventCell
          row={row}
          groupSuffix={
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 6 }}>
              {' · '}
              {t('serviceLocations.activity.updates', { count })} {expanded ? '▾' : '▸'}
            </span>
          }
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>

      {/* Sub-events sit on a recessed (sunken) panel inset under the parent so
          it reads as belonging to the group, not the main feed. */}
      {expanded && (
        <div
          style={{
            margin: '0 14px 8px 40px',
            padding: '6px 12px',
            background: 'var(--bg-sunken)',
            borderRadius: 'var(--r-md)',
            borderLeft: '2px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {isLoading && (
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
              {t('serviceLocations.activity.loading')}
            </span>
          )}
          {error && (
            <span className="text-danger-500" style={{ fontSize: 11 }}>
              {t('serviceLocations.activity.errorLoading')}
            </span>
          )}
          {subEvents.map((sub) => {
            const { glyph, tone } = glyphFor(sub);
            const summary = resolveEventSummary(sub, t, getName);
            return (
              <div key={sub.id} className="flex items-baseline gap-2">
                {/* Tone-coded like the top-level glyphs so arrivals/notes/$ pop
                    inside the group too, instead of a gray sub-dump. */}
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: (ACTIVITY_TONE_STYLE[tone] ?? ACTIVITY_TONE_STYLE.neutral).fg,
                    width: 14,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {glyph}
                </span>
                {/* Long field-diff sub-events collapse to "{field} changed"
                    upstream, so a single clamped line is enough here. */}
                <span className="line-clamp-1 min-w-0 flex-1" style={{ fontSize: 12, color: 'var(--fg)' }}>
                  {summary}
                </span>
                <span
                  style={{ fontSize: 10.5, color: 'var(--fg-dim)', flexShrink: 0 }}
                  title={formatExactTimestamp(sub.timestamp)}
                >
                  {formatTimestamp(sub.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
