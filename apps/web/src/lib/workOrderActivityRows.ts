// ─────────────────────────────────────────────────────────────────
// workOrderActivityRows.ts — the view-model for the work order Activity tab.
// Merges the work order's own feed with its field-change audit stream onto
// day-grouped rows, and folds each dispatch's steps (assigned → en route →
// arrived → checked out) into one row by the events' `subject`. Pure, so it
// tests without rendering.
// ─────────────────────────────────────────────────────────────────
import { formatExactTimestamp, formatTimestamp, workItemLabel } from '@dispatch/utils';
import type { ActivityEvent, ActivitySubject, ServiceLocationAuditEntry } from '../api/setup';
import { resolveEventSummary } from '../components/activityFormatters';
import { getDayBucket } from './activityDayBucket';
import { glyphFor, type ActivityTone } from './activityGlyph';
import type { AuditRowModel, BaseRow, GetName, TFunc } from './locationActivityRows';

/** Subjects whose steps fold into one row. Purchase orders join when their stream lands. */
const GROUPED: ReadonlySet<ActivitySubject['type']> = new Set(['DISPATCH', 'QUOTE', 'INVOICE']);

export interface StepRow {
  id: string;
  glyph: string;
  text: string;
  /** A CHANGE row: muted, tagged as audit detail. */
  change: boolean;
  ts: string;
  tsExact: string;
}

/** One event, or a thing whose earlier steps sit under it ("n updates ▸"). */
export type WoSingleRow = BaseRow & { kind: 'single'; change: boolean; steps: StepRow[] };
export type WoRow = WoSingleRow | AuditRowModel;

export interface WoDayGroup {
  key: string;
  label: string;
  rows: WoRow[];
}

type GetAbbrev = (entityCode: string) => string;

function actorOf(evt: ActivityEvent, t: TFunc, getName: GetName): { actor: string; isPerson: boolean } {
  const name = evt.actor?.userName?.trim();
  // A customer viewing a quote has no name; approving one carries the name they typed.
  if (evt.actor?.type === 'CUSTOMER') return { actor: name || getName('customer'), isPerson: true };
  const isPerson = evt.actor?.type !== 'SYSTEM' && !!name && name.toLowerCase() !== 'unknown';
  return { actor: isPerson ? name! : t('workOrders.activity.systemActor'), isPerson };
}

/** The link text and tab for what a row is about; the work order itself needs none here. */
export function subjectLink(
  subject: ActivitySubject | null | undefined,
  getName: GetName,
  getAbbrev: GetAbbrev,
): { obj: string | null; objHref: string | null } {
  if (!subject) return { obj: null, objHref: null };
  switch (subject.type) {
    case 'DISPATCH': {
      const obj = subject.label ?? (subject.number != null ? `${getName('dispatch')} ${subject.number}` : getName('dispatch'));
      return { obj, objHref: '?tab=trips' };
    }
    case 'WORK_ITEM':
      return {
        obj: subject.number != null ? workItemLabel(getAbbrev('work_item'), subject.number) : getName('work_item'),
        objHref: '?tab=items',
      };
    case 'QUOTE':
      return { obj: subject.label ?? getName('quote'), objHref: `/quotes/${subject.id}` };
    case 'INVOICE':
      return { obj: subject.label ?? getName('invoice'), objHref: `/invoices/${subject.id}` };
    default:
      return { obj: null, objHref: null };
  }
}

const money = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';

/** " by email and text" from the send's channels; empty means it was marked sent by hand. */
const via = (channels: unknown): string => {
  const list = Array.isArray(channels) ? channels : [];
  const words = list.map((c) => (c === 'SMS' ? 'text' : String(c).toLowerCase()));
  return words.length ? ` by ${words.join(' and ')}` : '';
};

const WINDOW_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const WINDOW_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
/** "May 15, 12:00 PM–2:00 PM" for a same-day window. */
function arrivalWindow(start: unknown, end: unknown): string {
  const s = typeof start === 'string' ? new Date(start) : null;
  if (!s || Number.isNaN(s.getTime())) return '—';
  const e = typeof end === 'string' ? new Date(end) : null;
  const tail = e && !Number.isNaN(e.getTime()) ? `–${WINDOW_TIME.format(e)}` : '';
  return `${WINDOW_DAY.format(s)}, ${WINDOW_TIME.format(s)}${tail}`;
}

/** The sentence for kinds whose words are built here rather than from raw `data`. */
function builtText(evt: ActivityEvent, t: TFunc): string | null {
  const d = evt.data;
  const key = (k: string) => `workOrders.activity.kind.${k}`;
  const rev = typeof d.revision === 'number' && d.revision > 1 ? ` · rev ${d.revision}` : '';
  const amount = money(d.totalAmount ?? d.amount);
  switch (evt.kind) {
    case 'DISPATCH_RESCHEDULED':
      return t(key('dispatchRescheduled'), { window: arrivalWindow(d.arrivalWindowStart, d.arrivalWindowEnd) });
    case 'FILES_UPLOADED': {
      const count = typeof d.count === 'number' ? d.count : 0;
      const photos = count > 0 && d.photoCount === count;
      const what = photos ? (count === 1 ? 'photo' : 'photos') : count === 1 ? 'file' : 'files';
      return t(key('filesUploaded'), { count, what });
    }
    case 'QUOTE_SENT':
      return via(d.channels)
        ? t(key('quoteSent'), { via: via(d.channels), rev, amount })
        : t(key('quoteMarkedSent'), { rev, amount });
    case 'QUOTE_VIEWED':
      return t(key('quoteViewed'), { rev });
    case 'QUOTE_ACCEPTED':
      return t(key('quoteAccepted'), { amount });
    case 'QUOTE_DECLINED':
      return t(key('quoteDeclined'), { amount });
    case 'INVOICE_SENT':
      return via(d.channels) ? t(key('invoiceSent'), { via: via(d.channels), amount }) : t(key('invoiceMarkedSent'), { amount });
    case 'INVOICE_PAID':
      return t(key('invoicePaid'), { amount });
    case 'INVOICE_VOIDED':
      return t(key('invoiceVoided'), { amount });
    case 'PAYMENT_RECEIVED': {
      const method = typeof d.method === 'string' && d.method ? ` · ${d.method.replace(/_/g, ' ').toLowerCase()}` : '';
      return t(key('paymentReceived'), { paymentNumber: typeof d.paymentNumber === 'string' ? d.paymentNumber : '', amount, method });
    }
    default:
      return null;
  }
}

/** The row's sentence: the kind's template, plus what the feed adds beyond it. */
function eventText(evt: ActivityEvent, t: TFunc, getName: GetName): string {
  const built = builtText(evt, t);
  if (built) return built;
  const base = resolveEventSummary(evt, t, getName);
  const note = typeof evt.data.note === 'string' ? evt.data.note.trim() : '';
  if (evt.kind === 'WORK_ITEM_STATUS_CHANGED' && note) return `${base} · ${note}`;
  const items = evt.data.workItemCount;
  if (evt.kind === 'WORK_ORDER_CREATED' && typeof items === 'number' && items > 0) {
    return `${base} · ${items} ${getName('work_item', items !== 1).toLowerCase()}`;
  }
  return base;
}

function stepOf(evt: ActivityEvent, t: TFunc, getName: GetName): StepRow {
  return {
    id: evt.id,
    glyph: glyphFor(evt).glyph,
    text: eventText(evt, t, getName),
    change: evt.classification === 'CHANGE',
    ts: formatTimestamp(evt.timestamp),
    tsExact: formatExactTimestamp(evt.timestamp),
  };
}

function auditRow(a: ServiceLocationAuditEntry, t: TFunc, getName: GetName): AuditRowModel {
  const name = a.userName?.trim();
  const isPerson = !!name && name.toLowerCase() !== 'unknown';
  const entity = getName('work_order');
  const single = a.changes.length === 1 ? a.changes[0] : null;
  const text =
    a.action === 'CREATE'
      ? t('serviceLocations.activity.audit.created', { entity })
      : a.action === 'DELETE'
        ? t('serviceLocations.activity.audit.deleted', { entity })
        : single
          ? t('serviceLocations.activity.audit.fieldChanged', { field: single.label })
          : t('serviceLocations.activity.audit.editedObject', { object: entity.toLowerCase() });
  return {
    kind: 'audit',
    id: a.id,
    glyph: '⟳',
    tone: 'neutral',
    actor: isPerson ? name! : t('workOrders.activity.systemActor'),
    isPerson,
    text,
    obj: null,
    objHref: null,
    ts: formatTimestamp(a.timestamp),
    tsExact: formatExactTimestamp(a.timestamp),
    changes: a.changes,
  };
}

export function buildWorkOrderDays({
  events,
  audit,
  t,
  getName,
  getAbbrev,
}: {
  events: ActivityEvent[];
  audit: ServiceLocationAuditEntry[];
  t: TFunc;
  getName: GetName;
  getAbbrev: GetAbbrev;
}): WoDayGroup[] {
  // A save that touched nothing isn't an event.
  const changes = audit.filter((a) => !(a.action === 'UPDATE' && a.changes.length === 0));

  // Each grouped subject's events, newest first (the feed's order).
  const bySubject = new Map<string, ActivityEvent[]>();
  const keyOf = (evt: ActivityEvent) =>
    evt.subject && GROUPED.has(evt.subject.type) ? `${evt.subject.type}:${evt.subject.id}` : null;
  for (const evt of events) {
    const key = keyOf(evt);
    if (key) bySubject.set(key, [...(bySubject.get(key) ?? []), evt]);
  }

  type Item = { ts: string; evt: ActivityEvent } | { ts: string; audit: ServiceLocationAuditEntry };
  const timeline: Item[] = [
    ...events.map((evt) => ({ ts: evt.timestamp, evt })),
    ...changes.map((a) => ({ ts: a.timestamp, audit: a })),
  ];
  timeline.sort((a, b) => b.ts.localeCompare(a.ts));

  const days: WoDayGroup[] = [];
  let current: WoDayGroup | null = null;
  const push = (ts: string, row: WoRow) => {
    const bucket = getDayBucket(ts, t);
    if (!current || current.key !== bucket.key) {
      current = { key: bucket.key, label: bucket.label, rows: [] };
      days.push(current);
    }
    current.rows.push(row);
  };

  // A grouped subject shows once, at its newest step; the rest list under it, oldest first.
  const shown = new Set<string>();
  for (const item of timeline) {
    if ('audit' in item) {
      push(item.ts, auditRow(item.audit, t, getName));
      continue;
    }
    const evt = item.evt;
    const key = keyOf(evt);
    if (key) {
      if (shown.has(key)) continue;
      shown.add(key);
    }
    const earlier = key ? bySubject.get(key)!.slice(1).reverse() : [];
    const { glyph, tone } = glyphFor(evt);
    const { actor, isPerson } = actorOf(evt, t, getName);
    const { obj, objHref } = subjectLink(evt.subject, getName, getAbbrev);
    push(item.ts, {
      kind: 'single',
      id: evt.id,
      glyph,
      tone: tone as ActivityTone,
      actor,
      isPerson,
      text: eventText(evt, t, getName),
      obj,
      objHref,
      ts: formatTimestamp(evt.timestamp),
      tsExact: formatExactTimestamp(evt.timestamp),
      change: evt.classification === 'CHANGE',
      steps: earlier.map((e) => stepOf(e, t, getName)),
    });
  }
  return days;
}
