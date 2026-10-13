import { InvoiceStatus, QuoteStatus, type InvoiceListItemRow, type ListInvoicesParams, type ListQuotesParams, type QuoteListItem } from '../../api/setup';

/** "Due on receipt" for 0, "Net 30" otherwise; null when unknown. */
export const termsLabel = (days: number | null | undefined) =>
  days == null ? null : days === 0 ? 'Due on receipt' : `Net ${days}`;

/** Whole days from a YYYY-MM-DD date to today's local date (positive when it's past). */
export function daysSince(day: string, today = new Date()): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((now - then) / 86_400_000);
}

// ── Invoices ──────────────────────────────────────────────────────────

export type InvoiceView = 'unpaid' | 'overdue' | 'draft' | 'paid' | 'all' | 'void';
export const INVOICE_VIEWS: InvoiceView[] = ['unpaid', 'overdue', 'draft', 'paid', 'all', 'void'];

/** The list call for each tab; its count from `/invoices/views` equals that call's total. */
export const INVOICE_VIEW_PARAMS: Record<InvoiceView, Partial<ListInvoicesParams>> = {
  unpaid: { status: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
  overdue: { overdue: true },
  draft: { status: InvoiceStatus.DRAFT },
  paid: { status: InvoiceStatus.PAID },
  all: { status: [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PAID] },
  void: { status: [InvoiceStatus.VOID, InvoiceStatus.CANCELLED] },
};

/**
 * Exact status filters older links carry (`?status=billed` from the revenue
 * report, `?status=overdue` from the home page). Applied on the All tab as a
 * removable chip so those links land on the same rows as before.
 */
export const INVOICE_STATUS_FILTERS: Record<string, { label: string; params: Partial<ListInvoicesParams> }> = {
  billed: { label: 'Billed', params: { billed: true } },
  overdue: { label: 'Overdue', params: { overdue: true } },
  draft: { label: 'Draft', params: { status: InvoiceStatus.DRAFT } },
  sent: { label: 'Sent', params: { status: InvoiceStatus.SENT } },
  paid: { label: 'Paid', params: { status: InvoiceStatus.PAID } },
  cancelled: { label: 'Cancelled', params: { status: InvoiceStatus.CANCELLED } },
  void: { label: 'Void', params: { status: InvoiceStatus.VOID } },
};

export type InvoiceListStatus = 'Draft' | 'Sent' | 'Partial' | 'Paid' | 'Overdue' | 'Void' | 'Cancelled';

/**
 * What the row's status says. The server's `overdue` flag decides Overdue
 * (never worked out from the due date here); a sent invoice with some paid
 * is Partial.
 */
export function invoiceListStatus(i: InvoiceListItemRow): InvoiceListStatus {
  if (i.status === InvoiceStatus.VOID) return 'Void';
  if (i.status === InvoiceStatus.CANCELLED) return 'Cancelled';
  if (i.status === InvoiceStatus.DRAFT) return 'Draft';
  if (i.status === InvoiceStatus.PAID) return 'Paid';
  if (i.overdue || i.status === InvoiceStatus.OVERDUE) return 'Overdue';
  return i.amountPaid > 0 && i.balanceDue > 0 ? 'Partial' : 'Sent';
}

export const INVOICE_STATUS_TONE: Record<InvoiceListStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  Draft: 'neutral',
  Sent: 'info',
  Partial: 'warning',
  Paid: 'success',
  Overdue: 'danger',
  Void: 'neutral',
  Cancelled: 'neutral',
};

// ── Quotes ────────────────────────────────────────────────────────────

export type QuoteView = 'open' | 'ready' | 'accepted' | 'closed' | 'all';
export const QUOTE_VIEWS: QuoteView[] = ['open', 'ready', 'accepted', 'closed', 'all'];

export const QUOTE_VIEW_PARAMS: Record<QuoteView, Partial<ListQuotesParams>> = {
  open: { status: [QuoteStatus.DRAFT, QuoteStatus.SENT] },
  ready: { readyToInvoice: true },
  accepted: { status: [QuoteStatus.ACCEPTED] },
  closed: { status: [QuoteStatus.DECLINED, QuoteStatus.EXPIRED] },
  all: {},
};

export type QuoteListStatus = 'Draft' | 'Being updated' | 'Sent' | 'Viewed' | 'Accepted' | 'Declined' | 'Expired';

/** A draft that was sent before is a revision in progress: the customer's link is paused. */
export function quoteListStatus(q: QuoteListItem): QuoteListStatus {
  switch (q.status) {
    case QuoteStatus.DRAFT:
      return q.firstSentAt ? 'Being updated' : 'Draft';
    case QuoteStatus.SENT:
      return q.firstViewedAt ? 'Viewed' : 'Sent';
    case QuoteStatus.ACCEPTED:
      return 'Accepted';
    case QuoteStatus.DECLINED:
      return 'Declined';
    default:
      return 'Expired';
  }
}

export const QUOTE_STATUS_TONE: Record<QuoteListStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  Draft: 'neutral',
  'Being updated': 'warning',
  Sent: 'info',
  Viewed: 'info',
  Accepted: 'success',
  Declined: 'neutral',
  Expired: 'danger',
};

/** Days until a quote expires (negative once past). */
export const daysUntil = (day: string, today = new Date()) => -daysSince(day, today);
