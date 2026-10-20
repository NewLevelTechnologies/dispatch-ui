// ─────────────────────────────────────────────────────────────────
// workOrderActivityRows.ts — the view-model for the work order Activity tab.
// Merges the work order's own feed with its field-change audit stream onto
// day-grouped rows, and folds each dispatch's steps (assigned → en route →
// arrived → checked out) into one row by the events' `subject`. Pure, so it
// tests without rendering.
// ─────────────────────────────────────────────────────────────────
import { formatExactTimestamp, formatTimestamp, workItemLabel } from '@dispatch/utils';
import type { ActivityEvent, ActivitySubject, NotificationLogDto, ServiceLocationAuditEntry } from '../api/setup';
import { resolveEventSummary } from '../components/activityFormatters';
import { getDayBucket } from './activityDayBucket';
import { glyphFor, type ActivityTone } from './activityGlyph';
import type { AuditRowModel, BaseRow, GetName, TFunc } from './locationActivityRows';

/** Subjects whose steps fold into one row. */
const GROUPED: ReadonlySet<ActivitySubject['type']> = new Set(['DISPATCH', 'QUOTE', 'INVOICE', 'PURCHASE_ORDER']);

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

export function actorOf(evt: ActivityEvent, t: TFunc, getName: GetName): { actor: string; isPerson: boolean } {
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
    case 'PURCHASE_ORDER':
      return { obj: subject.label ?? 'Purchase order', objHref: `/purchase-orders/${subject.id}` };
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

const PO_STATUS: Record<string, string> = {
  DRAFT: 'draft',
  ORDERED: 'ordered',
  PARTIALLY_RECEIVED: 'partly received',
  RECEIVED: 'received',
  BILLED: 'billed',
  CANCELLED: 'cancelled',
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

/** "24.8%" from a fraction; "—" without one. */
const pctOf = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 1000) / 10}%` : '—');
/** ": “Matching a bid”" when there's a note or reason. */
const said = (v: unknown) => (typeof v === 'string' && v.trim() ? `: “${v.trim()}”` : '');

const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * A stretch of the customer clicking through a proposal: "Looked at Ultimate,
 * then switched to Comfort · added Duct sealing · $17,700.00". One option and
 * no add-on changes means they ended where they started.
 */
function choiceText(d: Record<string, unknown>, t: TFunc, amount: string): string {
  const key = (k: string) => `workOrders.activity.kind.${k}`;
  const path = names(d.path);
  const added = names(d.added);
  const removed = names(d.removed);
  const last = path[path.length - 1] ?? '';
  const parts = [
    path.length > 1
      ? t(key('quoteChoicePath'), { seen: path.slice(0, -1).join(', '), last })
      : added.length || removed.length
        ? t(key('quoteChoiceOn'), { last })
        : t(key('quoteChoiceSame'), { last }),
    ...(added.length ? [t(key('quoteChoiceAdded'), { list: added.join(', ') })] : []),
    ...(removed.length ? [t(key('quoteChoiceRemoved'), { list: removed.join(', ') })] : []),
    ...(typeof d.totalAmount === 'number' ? [amount] : []),
  ];
  return parts.join(' · ');
}

/**
 * The sentence for kinds whose words are built here rather than from raw `data`
 * (quote, invoice, payment and PO steps, reschedules, uploads). Shared with the
 * location, customer and home feeds, which carry the same financial rows.
 */
export function builtText(evt: ActivityEvent, t: TFunc): string | null {
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
    case 'QUOTE_DELETED':
      return t(key('quoteDeleted'), { amount });
    case 'QUOTE_CHOICE_CHANGED':
      return choiceText(d, t, amount);
    case 'QUOTE_PRICE_APPROVAL_REQUESTED':
      return t(key('quotePriceRequested'), { margin: pctOf(d.lowestMargin), floor: pctOf(d.floor), why: said(d.reason) });
    case 'QUOTE_PRICE_APPROVED':
      return t(key('quotePriceApproved'), { why: said(d.note) });
    case 'QUOTE_PRICE_REJECTED':
      return t(key('quotePriceRejected'), { why: said(d.note) });
    case 'QUOTE_MEMBERSHIP_SIGNUP':
      return t(key('quoteMembershipSignup'), { plan: typeof d.planName === 'string' ? d.planName : '' });
    case 'INVOICE_SENT':
      return via(d.channels) ? t(key('invoiceSent'), { via: via(d.channels), amount }) : t(key('invoiceMarkedSent'), { amount });
    case 'INVOICE_PAID':
      return t(key('invoicePaid'), { amount });
    case 'INVOICE_VOIDED':
      return t(key('invoiceVoided'), { amount });
    case 'PO_CREATED':
      return t(key('poCreated'), {
        vendor: typeof d.vendorName === 'string' && d.vendorName ? ` · ${d.vendorName}` : '',
        amount: money(d.totalCost),
      });
    case 'PO_STATUS_CHANGED': {
      const status = typeof d.toStatus === 'string' ? (PO_STATUS[d.toStatus] ?? d.toStatus.toLowerCase()) : '—';
      const reason = typeof d.reason === 'string' && d.reason.trim() ? ` · ${d.reason.trim()}` : '';
      return t(key('poStatusChanged'), { status, reason });
    }
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
  return auditEntryRow(a, t, getName('work_order'));
}

/** One audit-service entry as an activity row, for any entity (`entity` is
 *  its display name: the work order here, a work item in its History card). */
export function auditEntryRow(a: ServiceLocationAuditEntry, t: TFunc, entity: string): AuditRowModel {
  const name = a.userName?.trim();
  const isPerson = !!name && name.toLowerCase() !== 'unknown';
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

/** A text or email: what it was, how it went, to whom, and whether it went out. */
function messageText(m: NotificationLogDto, t: TFunc): string {
  const base = t(`workOrders.activity.message.${m.channel === 'SMS' ? 'texted' : 'emailed'}`, {
    what: m.notificationTypeName || t('workOrders.activity.message.fallback'),
    recipient: m.recipientName || m.recipientPhone || m.recipientEmail || '—',
  });
  // Delivery is reported back by the providers; SENT stays when no report comes.
  if (m.status === 'DELIVERED') return t('workOrders.activity.message.delivered', { base });
  if (m.status === 'BOUNCED') return t('workOrders.activity.message.bounced', { base });
  if (m.status === 'FAILED') return t('workOrders.activity.message.failed', { base });
  if (m.status === 'SUPPRESSED') return t('workOrders.activity.message.suppressed', { base });
  return base;
}

function messageGlyph(m: NotificationLogDto): { glyph: string; tone: ActivityTone } {
  return m.status === 'FAILED' || m.status === 'BOUNCED' ? { glyph: '!', tone: 'warning' } : { glyph: '✉', tone: 'neutral' };
}

type Entry =
  | { kind: 'event'; id: string; ts: string; evt: ActivityEvent }
  | { kind: 'message'; id: string; ts: string; msg: NotificationLogDto };

export function buildWorkOrderDays({
  events,
  messages = [],
  audit,
  t,
  getName,
  getAbbrev,
}: {
  events: ActivityEvent[];
  /** Texts and emails for the work order; each folds under the quote, invoice or dispatch it was about. */
  messages?: NotificationLogDto[];
  audit: ServiceLocationAuditEntry[];
  t: TFunc;
  getName: GetName;
  getAbbrev: GetAbbrev;
}): WoDayGroup[] {
  // A save that touched nothing isn't an event.
  const changes = audit.filter((a) => !(a.action === 'UPDATE' && a.changes.length === 0));

  const entries: Entry[] = [
    ...events.map((evt): Entry => ({ kind: 'event', id: evt.id, ts: evt.timestamp, evt })),
    ...messages.map((msg): Entry => ({ kind: 'message', id: msg.id, ts: msg.createdAt, msg })),
  ];
  entries.sort((a, b) => b.ts.localeCompare(a.ts));

  const keyOf = (e: Entry): string | null => {
    const ref = e.kind === 'event' ? e.evt.subject : e.msg.about;
    return ref && GROUPED.has(ref.type as ActivitySubject['type']) ? `${ref.type}:${ref.id}` : null;
  };
  // Each grouped subject's entries, newest first.
  const bySubject = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = keyOf(e);
    if (key) bySubject.set(key, [...(bySubject.get(key) ?? []), e]);
  }

  const stepOfEntry = (e: Entry): StepRow =>
    e.kind === 'event'
      ? stepOf(e.evt, t, getName)
      : {
          id: e.id,
          glyph: messageGlyph(e.msg).glyph,
          text: messageText(e.msg, t),
          change: false,
          ts: formatTimestamp(e.ts),
          tsExact: formatExactTimestamp(e.ts),
        };

  const rowOf = (e: Entry, steps: StepRow[]): WoSingleRow => {
    if (e.kind === 'message') {
      const about = e.msg.about;
      const { obj, objHref } =
        about && about.type !== 'APPROVAL_REQUEST'
          ? subjectLink({ type: about.type, id: about.id, number: null, label: null }, getName, getAbbrev)
          : { obj: null, objHref: null };
      return {
        kind: 'single',
        id: e.id,
        ...messageGlyph(e.msg),
        // Logs don't record who triggered a send; the quote, invoice or dispatch row does.
        actor: t('workOrders.activity.systemActor'),
        isPerson: false,
        text: messageText(e.msg, t),
        obj,
        objHref,
        ts: formatTimestamp(e.ts),
        tsExact: formatExactTimestamp(e.ts),
        change: false,
        steps,
      };
    }
    const evt = e.evt;
    const { glyph, tone } = glyphFor(evt);
    const { actor, isPerson } = actorOf(evt, t, getName);
    const link = subjectLink(evt.subject, getName, getAbbrev);
    // A deleted quote no longer loads: name it, don't link it.
    const { obj, objHref } = evt.kind === 'QUOTE_DELETED' ? { ...link, objHref: null } : link;
    return {
      kind: 'single',
      id: evt.id,
      glyph,
      tone,
      actor,
      isPerson,
      text: eventText(evt, t, getName),
      obj,
      objHref,
      ts: formatTimestamp(evt.timestamp),
      tsExact: formatExactTimestamp(evt.timestamp),
      change: evt.classification === 'CHANGE',
      steps,
    };
  };

  type Item = { ts: string; entry: Entry } | { ts: string; audit: ServiceLocationAuditEntry };
  const timeline: Item[] = [
    ...entries.map((entry) => ({ ts: entry.ts, entry })),
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

  // A grouped subject shows once, at its newest entry. Its newest event heads
  // the row (a send's text reads under the step that caused it); the rest list
  // under it, oldest first.
  const shown = new Set<string>();
  for (const item of timeline) {
    if ('audit' in item) {
      push(item.ts, auditRow(item.audit, t, getName));
      continue;
    }
    const key = keyOf(item.entry);
    if (!key) {
      push(item.ts, rowOf(item.entry, []));
      continue;
    }
    if (shown.has(key)) continue;
    shown.add(key);
    const group = bySubject.get(key)!;
    const head = group.find((e) => e.kind === 'event') ?? group[0];
    const rest = group.filter((e) => e !== head).reverse();
    push(item.ts, rowOf(head, rest.map(stepOfEntry)));
  }
  return days;
}
