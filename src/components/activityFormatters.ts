import type { ActivityEvent, ActivityKind } from '../api';

/**
 * Maps each ActivityKind to its i18n template key. The template lives at
 * the returned path in en_us.json under `workOrders.activity.kind.*` and
 * uses `{{fieldName}}` placeholders that interpolate from preFormatEventData.
 *
 * If a kind isn't in this map, the renderer falls back to a generic
 * "untitled event" template — keeps the UI from breaking when the API
 * adds a new kind ahead of the UI.
 */
const KIND_TEMPLATE_KEYS: Record<ActivityKind, string> = {
  WORK_ORDER_CREATED: 'workOrders.activity.kind.workOrderCreated',
  WORK_ORDER_UPDATED: 'workOrders.activity.kind.workOrderUpdated',
  WORK_ORDER_CANCELLED: 'workOrders.activity.kind.workOrderCancelled',
  WORK_ORDER_ARCHIVED: 'workOrders.activity.kind.workOrderArchived',
  WORK_ORDER_UNARCHIVED: 'workOrders.activity.kind.workOrderUnarchived',
  WORK_ITEM_CREATED: 'workOrders.activity.kind.workItemCreated',
  WORK_ITEM_UPDATED: 'workOrders.activity.kind.workItemUpdated',
  WORK_ITEM_STATUS_CHANGED: 'workOrders.activity.kind.workItemStatusChanged',
  WORK_ITEM_DELETED: 'workOrders.activity.kind.workItemDeleted',
  DISPATCH_ASSIGNED: 'workOrders.activity.kind.dispatchAssigned',
  DISPATCH_DEPARTED: 'workOrders.activity.kind.dispatchDeparted',
  DISPATCH_ARRIVED: 'workOrders.activity.kind.dispatchArrived',
  DISPATCH_CHECKED_OUT: 'workOrders.activity.kind.dispatchCheckedOut',
  DISPATCH_CANCELLED: 'workOrders.activity.kind.dispatchCancelled',
  NOTE_ADDED: 'workOrders.activity.kind.noteAdded',
  NOTE_DELETED: 'workOrders.activity.kind.noteDeleted',
  QUOTE_SENT: 'workOrders.activity.kind.quoteSent',
  QUOTE_ACCEPTED: 'workOrders.activity.kind.quoteAccepted',
  QUOTE_DECLINED: 'workOrders.activity.kind.quoteDeclined',
  INVOICE_ISSUED: 'workOrders.activity.kind.invoiceIssued',
  INVOICE_PAID: 'workOrders.activity.kind.invoicePaid',
  PAYMENT_RECEIVED: 'workOrders.activity.kind.paymentReceived',
  PO_CREATED: 'workOrders.activity.kind.poCreated',
};

export const FALLBACK_TEMPLATE_KEY = 'workOrders.activity.kind.unknown';

/**
 * Maps each ActivityKind to the glossary entity code its template references.
 * The renderer uses this to resolve `{{entity}}` and `{{entities}}` placeholders
 * in templates via getName(), so tenants who rename "Work Order" to "Job" see
 * "Job created" in the activity feed instead of "Work order created".
 *
 * Kinds whose templates don't name an entity (e.g. WORK_ITEM_STATUS_CHANGED,
 * NOTE_ADDED, dispatch lifecycle events that just say "{{techName}} departed")
 * are intentionally absent.
 */
export const KIND_TO_ENTITY: Partial<Record<ActivityKind, string>> = {
  WORK_ORDER_CREATED: 'work_order',
  WORK_ORDER_CANCELLED: 'work_order',
  WORK_ORDER_ARCHIVED: 'work_order',
  WORK_ORDER_UNARCHIVED: 'work_order',
  WORK_ITEM_CREATED: 'work_item',
  WORK_ITEM_UPDATED: 'work_item',
  WORK_ITEM_DELETED: 'work_item',
  DISPATCH_ASSIGNED: 'dispatch',
  DISPATCH_CANCELLED: 'dispatch',
  QUOTE_SENT: 'quote',
  QUOTE_ACCEPTED: 'quote',
  QUOTE_DECLINED: 'quote',
  INVOICE_ISSUED: 'invoice',
  INVOICE_PAID: 'invoice',
  PAYMENT_RECEIVED: 'payment',
};

export function getEventTemplateKey(kind: ActivityKind | string): string {
  return KIND_TEMPLATE_KEYS[kind as ActivityKind] || FALLBACK_TEMPLATE_KEY;
}

export function getEventEntityCode(kind: ActivityKind | string): string | undefined {
  return KIND_TO_ENTITY[kind as ActivityKind];
}

/**
 * Resolves a backend field key (e.g. `workOrderTypeId`, `divisionId`) to the
 * label a CSR expects to read in the activity feed. The backend emits stable
 * keys; the user-facing copy lives here so it can be translated and routed
 * through the glossary where appropriate.
 *
 * `divisionId` flows through the glossary so a tenant who renames "Division"
 * to "Region" sees the activity feed match the rest of the UI. Other fields
 * use static i18n labels under `workOrders.activity.fieldLabel.*`.
 *
 * Falls back to the raw key for anything unmapped — better than crashing or
 * rendering an empty string when the backend adds a new field ahead of the UI.
 */
export function getFieldLabel(
  field: string,
  t: (key: string) => string,
  getName: (entityCode: string) => string
): string {
  if (!field) return field;
  if (field === 'divisionId') return getName('division');
  const labelKey = `workOrders.activity.fieldLabel.${field}`;
  const translated = t(labelKey);
  // i18next returns the key when no translation exists; treat that as the
  // miss case and fall back to the raw field key.
  return translated === labelKey ? field : translated;
}

/**
 * Returns a short identifier for which entity this event is *about*, rendered
 * as a secondary muted line below the action summary in the activity rail.
 *
 * Today the only entities surfaced this way are work items (description acts as
 * a stop-gap label until equipment FK lands per design §7.5). When the equipment
 * relation ships, this function should return the equipment name instead — the
 * UI structure stays the same; only the source field changes.
 *
 * Returns null for events that don't reference a sub-entity (WO-level events,
 * notes, dispatches, financial events) — those render summary-only.
 */
export function getEventContext(event: ActivityEvent): string | null {
  switch (event.kind) {
    case 'WORK_ITEM_CREATED':
    case 'WORK_ITEM_UPDATED':
    case 'WORK_ITEM_STATUS_CHANGED':
    case 'WORK_ITEM_DELETED': {
      const desc =
        (typeof event.data.workItemDescription === 'string' &&
          event.data.workItemDescription) ||
        (typeof event.data.description === 'string' && event.data.description) ||
        null;
      return desc;
    }
    default:
      return null;
  }
}

/**
 * Stringify event.data fields for i18n interpolation. Numbers and dates that
 * benefit from formatting (currency amounts, ISO timestamps) are pre-formatted
 * here so templates stay readable. Everything else falls through as a string.
 */
export function preFormatEventData(event: ActivityEvent): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(event.data)) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (typeof value === 'number') {
      out[key] = String(value);
    } else if (typeof value === 'string' || typeof value === 'boolean') {
      out[key] = String(value);
    } else {
      // Nested objects — render as JSON for now. Templates that need nested
      // fields should reference the leaves directly via the API contract.
      out[key] = JSON.stringify(value);
    }
  }

  // Kind-specific formatting for amounts (presence of any field named "amount"
  // is a good heuristic that it's currency in this domain).
  if ('amount' in event.data && typeof event.data.amount === 'number') {
    out.amount = formatCurrency(event.data.amount);
  }

  return out;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Maps each category to a heroicon name (resolved at the component layer).
 * Used to give the activity row a glanceable left-edge marker.
 */
export const CATEGORY_ICON_KEY: Record<string, 'note' | 'dispatch' | 'status' | 'financial'> = {
  NOTE: 'note',
  DISPATCH: 'dispatch',
  STATUS: 'status',
  FINANCIAL: 'financial',
};
