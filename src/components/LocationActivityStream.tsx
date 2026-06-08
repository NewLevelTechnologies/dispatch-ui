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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  activityApi,
  auditApi,
  type ActivityCategory,
  type ActivityKind,
  type ActivityWorkOrderRef,
  type LocationActivityEvent,
  type ServiceLocationAuditEntry,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { formatExactTimestamp, formatTimestamp } from '../lib/formatTimestamp';
import { getDayBucket } from '../lib/activityDayBucket';
import { ACTIVITY_TONE_STYLE, glyphFor, type ActivityTone } from '../lib/activityGlyph';
import { resolveEventSummary } from './activityFormatters';
import { roleColor } from '../utils/roleColor';

const PAGE_SIZE = 50;
// Audit is low-volume and fetched whole in one shot; request the server max so
// a busy location's change history isn't silently truncated.
const AUDIT_LIMIT = 500;

type ChipId = 'all' | 'job' | 'visit' | 'invoice' | 'payment' | 'note' | 'change';

// The business endpoint filters by one coarse category; the mock's finer chips
// map onto them, with Invoices/Payments split client-side (both are FINANCIAL).
const CHIP_CATEGORY: Record<Exclude<ChipId, 'all' | 'change'>, ActivityCategory> = {
  job: 'STATUS',
  visit: 'DISPATCH',
  invoice: 'FINANCIAL',
  payment: 'FINANCIAL',
  note: 'NOTE',
};

interface Props {
  serviceLocationId: string;
}

export default function LocationActivityStream({ serviceLocationId }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canViewAudit = useHasCapability('VIEW_AUDIT_LOGS');
  const [chip, setChip] = useState<ChipId>('all');
  const [showAudit, setShowAudit] = useState(false);

  // The toggle is the master audit gate (matching the mock): change rows only
  // appear when it's on, and only on the All or Changes chip.
  const wantAudit = canViewAudit && showAudit;
  const businessActive = chip !== 'change';
  const businessCategory: ActivityCategory[] | undefined =
    chip === 'all' || chip === 'change' ? undefined : [CHIP_CATEGORY[chip]];

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

  const typeChips: { id: ChipId; label: string }[] = [
    { id: 'all', label: t('serviceLocations.activity.filter.all') },
    { id: 'job', label: getName('work_order', true) },
    { id: 'visit', label: t('serviceLocations.activity.filter.visits') },
    { id: 'invoice', label: getName('invoice', true) },
    { id: 'payment', label: t('serviceLocations.activity.filter.payments') },
    { id: 'note', label: t('serviceLocations.activity.filter.notes') },
    ...(canViewAudit
      ? [{ id: 'change' as const, label: t('serviceLocations.activity.filter.changes') }]
      : []),
  ];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: businessLoading,
    error: businessError,
  } = useInfiniteQuery({
    queryKey: ['location-activity', serviceLocationId, businessCategory ?? 'ALL'],
    queryFn: ({ pageParam }) =>
      activityApi.listForLocation(serviceLocationId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        categories: businessCategory,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!serviceLocationId && businessActive,
  });

  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: ['location-audit', serviceLocationId],
    queryFn: () => auditApi.getServiceLocationChanges(serviceLocationId, AUDIT_LIMIT),
    enabled: !!serviceLocationId && wantAudit,
  });

  const events = useMemo(() => data?.pages.flatMap((p) => p.content) ?? [], [data]);

  // Build the merged, day-grouped, WO-collapsed view the mock renders.
  const days = useMemo(
    () => buildDays({ events, audit: auditData ?? [], chip, wantAudit, t, getName }),
    [events, auditData, chip, wantAudit, t, getName]
  );

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isLoading = (businessActive && businessLoading) || (wantAudit && auditLoading);
  const error = businessError ?? auditError ?? null;
  const isEmpty = !isLoading && !error && days.length === 0;

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
              checked={showAudit}
              onChange={(e) => setShowAudit(e.target.checked)}
              style={{ accentColor: 'var(--accent-500)' }}
            />
            {t('serviceLocations.activity.showChanges')}
          </label>
        )}
      </div>

      <div className="card">
        <div className="card-body flush">
          {isLoading && (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                {t('serviceLocations.activity.loading')}
              </span>
            </div>
          )}
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
                  <WorkOrderGroupRow key={row.id} row={row} categories={businessCategory} t={t} getName={getName} />
                ) : (
                  <ActivityRow key={row.id} row={row} />
                )
              )}
            </div>
          ))}

          {hasNextPage && (
            <div ref={sentinelRef} style={{ padding: '8px 14px', textAlign: 'center' }}>
              <span className="text-xs" style={{ color: 'var(--fg-dim)' }}>
                {isFetchingNextPage
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

// ── View model ────────────────────────────────────────────────────
// Map the two backend streams onto the mock's day → row shape. A row is a
// single business event, a collapsible WO group (lead event + count), or an
// audit/change row.

interface BaseRow {
  id: string;
  glyph: string;
  tone: ActivityTone;
  actor: string;
  isPerson: boolean;
  text: string;
  obj: string | null;
  objHref: string | null;
  ts: string;
  tsExact: string;
}
interface AuditChange {
  label: string;
  oldValue: string | null;
  newValue: string | null;
}
type SingleRow = BaseRow & { kind: 'single' };
type GroupRow = BaseRow & { kind: 'group'; woId: string; count: number };
type AuditRowModel = BaseRow & { kind: 'audit'; changes: AuditChange[] };
type Row = SingleRow | GroupRow | AuditRowModel;

// Long free-text fields (summary, notes, instructions) blow rows out to three
// lines if their before/after is inlined — past this they collapse to a preview
// with click-to-expand. Short values (codes, enums) stay inline.
const LONG_VALUE = 48;

function isLongChange(c: AuditChange): boolean {
  return (c.oldValue?.length ?? 0) > LONG_VALUE || (c.newValue?.length ?? 0) > LONG_VALUE;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

interface DayGroup {
  key: string;
  label: string;
  rows: Row[];
}

type TFunc = (key: string, params?: Record<string, unknown>) => string;
type GetName = (entityCode: string, plural?: boolean) => string;

function actorOf(name: string | undefined, t: TFunc): { actor: string; isPerson: boolean } {
  const raw = name?.trim();
  const isPerson = !!raw && raw.toLowerCase() !== 'unknown';
  return { actor: isPerson ? raw! : t('workOrders.activity.systemActor'), isPerson };
}

function woBacklink(wo: ActivityWorkOrderRef | null): { obj: string | null; objHref: string | null } {
  if (!wo) return { obj: null, objHref: null };
  const obj = wo.summary ? `${wo.workOrderNumber} · ${wo.summary}` : wo.workOrderNumber;
  return { obj, objHref: `/work-orders/${wo.id}` };
}

/** Whether a FINANCIAL event reads as a payment (vs an invoice/quote) — drives
 * the client-side Invoices/Payments split the backend can't do server-side. */
function isPaymentKind(kind: ActivityKind): boolean {
  return kind === 'PAYMENT_RECEIVED' || kind === 'INVOICE_PAID';
}

function buildDays({
  events,
  audit,
  chip,
  wantAudit,
  t,
  getName,
}: {
  events: LocationActivityEvent[];
  audit: ServiceLocationAuditEntry[];
  chip: ChipId;
  wantAudit: boolean;
  t: TFunc;
  getName: GetName;
}): DayGroup[] {
  // 1) Filter business events to the active chip (server already narrowed to a
  //    category; only Invoices/Payments need the client split).
  let business: LocationActivityEvent[] = chip === 'change' ? [] : events;
  if (chip === 'invoice') business = business.filter((e) => !isPaymentKind(e.kind));
  if (chip === 'payment') business = business.filter((e) => isPaymentKind(e.kind));

  // 2) Audit rows appear only when the gate is on AND the chip shows them.
  const includeAudit = wantAudit && (chip === 'all' || chip === 'change');

  type TimelineItem =
    | { type: 'event'; ts: string; event: LocationActivityEvent }
    | { type: 'audit'; ts: string; audit: ServiceLocationAuditEntry };
  const timeline: TimelineItem[] = business.map((event) => ({
    type: 'event',
    ts: event.timestamp,
    event,
  }));
  if (includeAudit) {
    for (const a of audit) timeline.push({ type: 'audit', ts: a.timestamp, audit: a });
  }
  timeline.sort((a, b) => b.ts.localeCompare(a.ts));

  // 3) Walk the timeline: day headers, then collapse each work order's lifecycle
  //    into ONE group row. A WO's status/dispatch events (the noisy "status
  //    changed", "added work item", "arrived" lifecycle) fold into a single
  //    "WO-N · M updates ▸" row positioned at the WO's newest event — they never
  //    render flat. Notes and financial events stay standalone (distinct business
  //    moments), and audit rows pass through. Dedup is global, not per-run, so a
  //    WO whose events are scattered by timestamp still collapses to one row.
  const days: DayGroup[] = [];
  let current: DayGroup | null = null;
  const pushRow = (ts: string, row: Row) => {
    const bucket = getDayBucket(ts, t);
    if (!current || current.key !== bucket.key) {
      current = { key: bucket.key, label: bucket.label, rows: [] };
      days.push(current);
    }
    current.rows.push(row);
  };

  const groupedWos = new Set<string>();
  for (const item of timeline) {
    if (item.type === 'audit') {
      pushRow(item.ts, auditRowModel(item.audit, t, getName));
      continue;
    }
    const evt = item.event;
    const wo = evt.workOrder;
    const isLifecycle = !!wo && (evt.category === 'STATUS' || evt.category === 'DISPATCH');
    if (isLifecycle && wo!.activityCount > 1) {
      // The WO's lifecycle collapses to one group; later events fold in silently.
      if (groupedWos.has(wo!.id)) continue;
      groupedWos.add(wo!.id);
      pushRow(item.ts, groupRowModel(evt, wo!, t, getName));
    } else {
      pushRow(item.ts, singleRowModel(evt, t, getName));
    }
  }
  return days;
}

function singleRowModel(evt: LocationActivityEvent, t: TFunc, getName: GetName): SingleRow {
  const { glyph, tone } = glyphFor(evt);
  const { actor, isPerson } = actorOf(evt.actor?.userName, t);
  const { obj, objHref } = woBacklink(evt.workOrder);
  return {
    kind: 'single',
    id: evt.id,
    glyph,
    tone,
    actor,
    isPerson,
    text: resolveEventSummary(evt, t, getName),
    obj,
    objHref,
    ts: formatTimestamp(evt.timestamp),
    tsExact: formatExactTimestamp(evt.timestamp),
  };
}

function groupRowModel(
  evt: LocationActivityEvent,
  wo: ActivityWorkOrderRef,
  t: TFunc,
  getName: GetName
): GroupRow {
  const single = singleRowModel(evt, t, getName);
  return { ...single, kind: 'group', woId: wo.id, count: wo.activityCount };
}

function auditRowModel(a: ServiceLocationAuditEntry, t: TFunc, getName: GetName): AuditRowModel {
  const { actor, isPerson } = actorOf(a.userName, t);
  const entity = getName('service_location');
  const single = a.changes.length === 1 ? a.changes[0] : null;
  let text: string;
  let obj: string | null = null;
  let listed: AuditChange[] = [];
  if (a.action === 'CREATE') {
    text = t('serviceLocations.activity.audit.created', { entity });
  } else if (a.action === 'DELETE') {
    text = t('serviceLocations.activity.audit.deleted', { entity });
  } else if (single && !isLongChange(single)) {
    // One short field → one-line "{label} changed · old → new", like the mock.
    text = t('serviceLocations.activity.audit.fieldChanged', { field: single.label });
    obj = changeDetail(single);
  } else {
    // One long field or several → header + a list below (each truncates/expands).
    text = single
      ? t('serviceLocations.activity.audit.fieldChanged', { field: single.label })
      : t('serviceLocations.activity.audit.changedFields', { count: a.changes.length });
    listed = a.changes;
  }
  return {
    kind: 'audit',
    id: a.id,
    glyph: '⟳',
    tone: 'neutral',
    actor,
    isPerson,
    text,
    obj,
    objHref: null,
    ts: formatTimestamp(a.timestamp),
    tsExact: formatExactTimestamp(a.timestamp),
    changes: listed,
  };
}

function changeDetail(c: AuditChange): string {
  const arrow = '→';
  if (c.oldValue == null && c.newValue != null) return c.newValue;
  if (c.oldValue != null && c.newValue == null) return `${c.oldValue} ${arrow} —`;
  return `${c.oldValue ?? '—'} ${arrow} ${c.newValue ?? '—'}`;
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

const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '22px 150px 1fr auto',
  gap: 10,
  alignItems: 'center',
  padding: '9px 14px',
};

function EventCell({
  row,
  groupSuffix,
}: {
  row: Row;
  groupSuffix?: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 12.5, color: 'var(--fg-strong)', fontWeight: 500 }}>{row.text}</span>
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

function ActivityRow({ row }: { row: SingleRow | AuditRowModel }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div style={ROW_GRID}>
        <ActGlyph glyph={row.glyph} tone={row.tone} />
        <ActorCell name={row.actor} isPerson={row.isPerson} />
        <EventCell row={row} />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>
      {row.kind === 'audit' && row.changes.length > 0 && (
        <div style={{ padding: '0 14px 8px 46px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {row.changes.map((c, idx) => (
            <AuditChangeLine key={idx} change={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// One field diff under an audit row. Short values render inline ("old → new");
// long free-text values (summary, notes) collapse to a preview with a toggle
// that expands the full before/after on separate lines — so a 200-char summary
// edit can't blow the row out to three lines.
function AuditChangeLine({ change }: { change: AuditChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = isLongChange(change);

  if (!long) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{change.label}:</span>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{changeDetail(change)}</span>
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

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{change.label}:</span>
        {!open && (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {truncate(change.oldValue ?? '—', 36)} → {truncate(change.newValue ?? '—', 36)}
          </span>
        )}
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
  t,
  getName,
}: {
  row: GroupRow;
  categories: ActivityCategory[] | undefined;
  t: TFunc;
  getName: GetName;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['work-order-activity-full', row.woId, categories ?? 'ALL'],
    queryFn: () => activityApi.list(row.woId, { limit: 200, categories }),
    enabled: expanded,
  });
  const subEvents = data?.content ?? [];

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
        style={{ ...ROW_GRID, cursor: 'pointer' }}
      >
        <ActGlyph glyph={row.glyph} tone={row.tone} />
        <ActorCell name={row.actor} isPerson={row.isPerson} />
        <EventCell
          row={row}
          groupSuffix={
            <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 6 }}>
              {' · '}
              {t('serviceLocations.activity.updates', { count: row.count })} {expanded ? '▾' : '▸'}
            </span>
          }
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }} title={row.tsExact}>
          {row.ts}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '2px 14px 8px 46px', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
            const { glyph } = glyphFor(sub);
            const summary = resolveEventSummary(sub, t, getName);
            return (
              <div key={sub.id} className="flex items-baseline gap-2">
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {glyph}
                </span>
                {/* Clamp long field-diff sub-events ("summary changed from … to …")
                    to one line; the full text is available on hover. */}
                <span className="line-clamp-1 min-w-0 flex-1" style={{ fontSize: 12, color: 'var(--fg)' }} title={summary}>
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
