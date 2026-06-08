// ─────────────────────────────────────────────────────────────────
// locationActivityRows.ts — the view-model layer for the Location Activity
// feed. Maps the merged streams (business / financial / audit) onto
// day-grouped, render-ready rows, and collapses each work order's lifecycle
// into one group row. Kept out of the component file so the Overview teaser
// can reuse buildRecentActivity without tripping react-refresh.
// ─────────────────────────────────────────────────────────────────
import type {
  ActivityWorkOrderRef,
  FinancialActivityEvent,
  LocationActivityEvent,
  ServiceLocationAuditEntry,
} from '../api';
import { getDayBucket } from './activityDayBucket';
import { glyphFor, type ActivityTone } from './activityGlyph';
import { resolveEventSummary } from '../components/activityFormatters';
import { formatExactTimestamp, formatTimestamp } from './formatTimestamp';

export type ChipId = 'all' | 'job' | 'visit' | 'invoice' | 'payment' | 'note' | 'change';

export interface BaseRow {
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
export interface AuditChange {
  label: string;
  oldValue: string | null;
  newValue: string | null;
}
export type SingleRow = BaseRow & { kind: 'single' };
export type GroupRow = BaseRow & { kind: 'group'; woId: string; count: number };
// `reverted` rows are a backend-flagged toggle-and-undo: `changes` holds both
// steps (original edit, then the undo) for the expandable detail.
export type AuditRowModel = BaseRow & { kind: 'audit'; changes: AuditChange[]; reverted?: boolean };
export type FinancialRow = BaseRow & { kind: 'financial' };
export type Row = SingleRow | GroupRow | AuditRowModel | FinancialRow;

export interface DayGroup {
  key: string;
  label: string;
  rows: Row[];
}

export type TFunc = (key: string, params?: Record<string, unknown>) => string;
export type GetName = (entityCode: string, plural?: boolean) => string;

// Long free-text fields (summary, notes, instructions) blow rows out to three
// lines if their before/after is inlined — past this they collapse to a preview
// with click-to-expand. Short values (codes, enums) stay inline.
const LONG_VALUE = 48;

export function isLongChange(c: AuditChange): boolean {
  return (c.oldValue?.length ?? 0) > LONG_VALUE || (c.newValue?.length ?? 0) > LONG_VALUE;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

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

export function buildDays({
  events,
  financial,
  audit,
  chip,
  t,
  getName,
}: {
  events: LocationActivityEvent[];
  financial: FinancialActivityEvent[];
  audit: ServiceLocationAuditEntry[];
  chip: ChipId;
  t: TFunc;
  getName: GetName;
}): DayGroup[] {
  // The financial stream carries both kinds; the Invoices/Payments chips split
  // it client-side (Invoices = sent, Payments = paid).
  const fin =
    chip === 'invoice'
      ? financial.filter((f) => f.kind === 'INVOICE_SENT')
      : chip === 'payment'
        ? financial.filter((f) => f.kind === 'INVOICE_PAID')
        : financial;

  // A save that touched nothing isn't an event — drop UPDATE audit rows with no
  // field deltas defensively (CREATE/DELETE legitimately carry none, so only
  // UPDATE is filtered).
  const cleaned = audit.filter((a) => !(a.action === 'UPDATE' && a.changes.length === 0));

  // Toggle-and-undo is detected server-side: the undo carries `netNoOp` and
  // points at the edit it cancels via `revertsEntryId`. Fold the pair into one
  // "edited and reverted" row at the undo's position, and drop the original edit
  // from the standalone stream so the net no-op doesn't take two lines.
  const byId = new Map(cleaned.map((a) => [a.id, a]));
  const foldedOriginalIds = new Set<string>();
  for (const a of cleaned) {
    if (a.netNoOp && a.revertsEntryId && byId.has(a.revertsEntryId)) {
      foldedOriginalIds.add(a.revertsEntryId);
    }
  }
  const visibleAudit = cleaned.filter((a) => !foldedOriginalIds.has(a.id));

  // Each stream's rows carry a timestamp; merge onto one descending timeline.
  type TimelineItem =
    | { type: 'event'; ts: string; event: LocationActivityEvent }
    | { type: 'financial'; ts: string; fin: FinancialActivityEvent }
    | {
        type: 'audit';
        ts: string;
        audit: ServiceLocationAuditEntry;
        // The edit this entry reverts (resolved from revertsEntryId), or null.
        revertedOf: ServiceLocationAuditEntry | null;
      };
  const timeline: TimelineItem[] = [
    ...events.map((event): TimelineItem => ({ type: 'event', ts: event.timestamp, event })),
    ...fin.map((f): TimelineItem => ({ type: 'financial', ts: f.timestamp, fin: f })),
    ...visibleAudit.map(
      (a): TimelineItem => ({
        type: 'audit',
        ts: a.timestamp,
        audit: a,
        revertedOf: a.netNoOp && a.revertsEntryId ? byId.get(a.revertsEntryId) ?? null : null,
      })
    ),
  ];
  timeline.sort((a, b) => b.ts.localeCompare(a.ts));

  // Walk the timeline: day headers, then collapse each work order's lifecycle
  // into ONE group row. A WO's status/dispatch events (the noisy "status
  // changed", "added work item", "arrived" lifecycle) fold into a single
  // "WO-N · M updates ▸" row positioned at the WO's newest event — they never
  // render flat. Notes and financial events stay standalone (distinct business
  // moments), and audit rows pass through. Dedup is global, not per-run, so a
  // WO whose events are scattered by timestamp still collapses to one row.
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
      pushRow(item.ts, auditRowModel(item.audit, t, getName, item.revertedOf));
      continue;
    }
    if (item.type === 'financial') {
      pushRow(item.ts, financialRowModel(item.fin, t, getName));
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

function auditRowModel(
  a: ServiceLocationAuditEntry,
  t: TFunc,
  getName: GetName,
  revertedOf: ServiceLocationAuditEntry | null
): AuditRowModel {
  const { actor, isPerson } = actorOf(a.userName, t);
  const entity = getName('service_location');
  const single = a.changes.length === 1 ? a.changes[0] : null;
  let text: string;
  // The component decides delta rendering off `changes` + `reverted`: a reverted
  // pair collapses and reveals both steps on expand; one short field renders
  // inline; one long field or several render below.
  let changes: AuditChange[] = a.changes;
  const reverted = revertedOf != null;
  if (reverted) {
    // Toggle-and-undo: name the field/object that was put back; carry both steps
    // (the original edit, then this undo) for the expandable detail.
    const fieldName = single ? single.label : t(objectLabelKey(a.changes));
    text = t('serviceLocations.activity.audit.editedReverted', { field: fieldName });
    changes = [...revertedOf.changes, ...a.changes];
  } else if (a.action === 'CREATE') {
    text = t('serviceLocations.activity.audit.created', { entity });
  } else if (a.action === 'DELETE') {
    text = t('serviceLocations.activity.audit.deleted', { entity });
  } else if (single) {
    text = t('serviceLocations.activity.audit.fieldChanged', { field: single.label });
  } else {
    // Several fields → lead with the object touched, not a count. The deltas
    // below say which fields; the count is secondary.
    text = t('serviceLocations.activity.audit.editedObject', {
      object: t(objectLabelKey(a.changes)),
    });
  }
  return {
    kind: 'audit',
    id: a.id,
    glyph: '⟳',
    tone: 'neutral',
    actor,
    isPerson,
    text,
    obj: null,
    objHref: null,
    ts: formatTimestamp(a.timestamp),
    tsExact: formatExactTimestamp(a.timestamp),
    changes,
    reverted,
  };
}

// Group a service-location field into the object it belongs to, so a multi-field
// edit can be headed "Edited site contact" rather than "Changed 2 fields". Nested
// fields arrive dotted (e.g. `address.line1`), so prefix-matching covers them.
function fieldObject(field: string): 'siteContact' | 'address' | 'other' {
  if (field.startsWith('siteContact')) return 'siteContact';
  if (field.startsWith('address')) return 'address';
  return 'other';
}

function objectLabelKey(changes: ServiceLocationAuditEntry['changes']): string {
  const objects = new Set(changes.map((c) => fieldObject(c.field)));
  if (objects.size === 1) {
    const only = [...objects][0];
    if (only === 'siteContact') return 'serviceLocations.activity.audit.object.siteContact';
    if (only === 'address') return 'serviceLocations.activity.audit.object.address';
  }
  // Mixed objects, or fields with no named group → the generic location bucket.
  return 'serviceLocations.activity.audit.object.location';
}

function formatMoney(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function financialRowModel(f: FinancialActivityEvent, t: TFunc, getName: GetName): FinancialRow {
  const paid = f.kind === 'INVOICE_PAID';
  const key = paid
    ? 'serviceLocations.activity.financial.paid'
    : 'serviceLocations.activity.financial.sent';
  const text = t(key, { invoice: f.invoiceNumber, amount: formatMoney(f.amount) });
  const { actor, isPerson } = actorOf(f.actor?.userName ?? undefined, t);
  return {
    kind: 'financial',
    id: f.id,
    glyph: '$',
    // Money events read green pre-attentively — both sent and paid. (paid is
    // retained above for the summary copy, not the tone.)
    tone: 'success',
    actor,
    isPerson,
    text,
    // The invoice number reads in the summary; when a WO is attached, backlink
    // to it (financial rows carry only the WO id, not its number).
    obj: f.workOrderId ? t('serviceLocations.activity.financial.viewJob', { entity: getName('work_order') }) : null,
    objHref: f.workOrderId ? `/work-orders/${f.workOrderId}` : null,
    ts: formatTimestamp(f.timestamp),
    tsExact: formatExactTimestamp(f.timestamp),
  };
}

/** One flattened, render-ready row for the Overview "Recent activity" teaser. */
export interface RecentActivityItem {
  id: string;
  glyph: string;
  tone: ActivityTone;
  text: string;
  obj: string | null;
  objHref: string | null;
  ts: string;
  tsExact: string;
}

/**
 * The default-view streams (business BUSINESS + financial) merged to the N
 * most-recent flat rows for the Overview teaser. Reuses the tab's row models so
 * the teaser reads identically — no WO collapse, no audit (mirrors toggle-OFF).
 */
export function buildRecentActivity(
  streams: {
    events: LocationActivityEvent[];
    financial: FinancialActivityEvent[];
  },
  t: TFunc,
  getName: GetName,
  limit = 3
): RecentActivityItem[] {
  const rows: { ts: string; row: BaseRow }[] = [
    ...streams.events.map((e) => ({ ts: e.timestamp, row: singleRowModel(e, t, getName) })),
    ...streams.financial.map((f) => ({ ts: f.timestamp, row: financialRowModel(f, t, getName) })),
  ];
  rows.sort((a, b) => b.ts.localeCompare(a.ts));
  return rows.slice(0, limit).map(({ row }) => ({
    id: row.id,
    glyph: row.glyph,
    tone: row.tone,
    text: row.text,
    obj: row.obj,
    objHref: row.objHref,
    ts: row.ts,
    tsExact: row.tsExact,
  }));
}
