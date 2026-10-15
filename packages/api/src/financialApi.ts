// Financial API Client
import apiClient from './client';
import type { ActivityEvent } from './activityApi';

// ========== PRICING (shared by quotes and invoices) ==========
//
// Pricebook Phase 1 (dispatch-api handoff FE_HANDOFF_pricebook_phase1.md).
// The server prices everything: the client sends lines and adjustments, never
// tax or totals. Every percent here is a FRACTION (15% is 0.15) — display ×100.

/** What a line is. LABOR has no pricebook item; the other four map 1:1 to item types. */
export type LineType = 'LABOR' | 'SERVICE' | 'MATERIAL' | 'EQUIPMENT' | 'FEE';

/** What a line is for tax. Defaults from the line type (LABOR/SERVICE → LABOR, MATERIAL → MATERIALS, …). */
export type TaxClass = 'LABOR' | 'MATERIALS' | 'EQUIPMENT' | 'FEE';

/** Which fee a FEE line is; the member trip-fee waiver finds the TRIP one. */
export type FeeRole = 'TRIP' | 'DIAGNOSTIC' | 'AFTER_HOURS' | 'DISPOSAL' | 'OTHER';

/**
 * LEGACY documents predate the pricing engine: read-only (every edit is 409
 * DOCUMENT_NOT_EDITABLE) and taxed at the header `taxRate`. ENGINE documents
 * are taxed per line — read `tax` and the line tax fields instead.
 */
export type PricingModel = 'LEGACY' | 'ENGINE';

/** What the account's rate plan did to a line; `pricingRuleValue` is the markup or multiplier (a fraction). */
export type PricingRule = 'MARKUP_TIER' | 'PLAN_LABOR_RATE' | 'CATEGORY_MULTIPLIER' | 'PRICE_MULTIPLIER';

export type AdjustmentKind = 'PERCENT' | 'AMOUNT' | 'WAIVE';

/** MEMBER only comes from an agreement; the server refuses it on a manual add. */
export type AdjustmentReason =
  | 'MEMBER'
  | 'REPAIR_APPROVED'
  | 'GOODWILL'
  | 'PROMOTION'
  | 'INCENTIVE'
  | 'DISCRETIONARY'
  | 'OTHER';

export type AdjustmentSource = 'MANUAL' | 'AGREEMENT';

/** Codes a draft can warn with; branch on these, never show `message` verbatim. */
export type PricingWarningCode = 'TAX_JURISDICTION_NOT_SET' | 'TAX_RATE_NOT_SET' | 'NTE_EXCEEDED';

/** Needs attention but doesn't block saving. Drafts only. */
export interface PricingWarning {
  code: PricingWarningCode | string;
  message: string;
}

/** The jurisdiction and exemption an ENGINE document was taxed under. Null on LEGACY. */
export interface DocumentTax {
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  /** A fraction; null when the jurisdiction has no rate yet (nothing taxed, draft warns). */
  jurisdictionRate: number | null;
  exempt: boolean;
  exemptCertificate: string | null;
}

/** A discount or waive, on one line (`lineId`) or the whole document (`lineId` null). */
export interface DocumentAdjustment {
  id: string;
  lineId: string | null;
  kind: AdjustmentKind;
  /** PERCENT: a fraction. AMOUNT: dollars. WAIVE: null. */
  value: number | null;
  reasonCode: AdjustmentReason;
  reasonNote: string | null;
  /** What it came to, in dollars. */
  computedAmount: number;
  createdByUserId: string | null;
  createdAt: string | null;
  /** On an invoice billed from a quote: the quote adjustment it was copied from. */
  copiedFromAdjustmentId?: string | null;
  sourceType: AdjustmentSource;
  /** AGREEMENT: the agreement id and its label ("Silver"). Internal — never customer-facing. */
  sourceId?: string | null;
  sourceLabel?: string | null;
}

/**
 * A priced quote or invoice line. Everything past `lineTotal` is optional so
 * LEGACY lines (and older fixtures) fit; the server sends them on ENGINE lines.
 * Display by `sortOrder`.
 */
export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** List amount: quantity × unitPrice. */
  lineTotal: number;
  /** This line's adjustments, including its share of document-wide ones. Null on LEGACY. */
  adjustmentAmount?: number | null;
  /** lineTotal − adjustmentAmount; tax is charged on this. Null on LEGACY. */
  netAmount?: number | null;
  type?: LineType | null;
  unit?: string | null;
  /** Internal only — never on anything customer-facing. */
  unitCost?: number | null;
  sortOrder?: number;
  taxClass?: TaxClass | null;
  taxable?: boolean | null;
  /** A fraction. */
  taxRate?: number | null;
  taxAmount?: number | null;
  sourcePoLineId?: string | null;
  /** Labor lines: the rate type, and its name when the line was added. */
  laborRateTypeId?: string | null;
  laborRateTypeName?: string | null;
  /** Pricebook lines: the item, its SKU when added, and which fee it is. */
  itemId?: string | null;
  itemSku?: string | null;
  feeRole?: FeeRole | null;
  /** Price before the rate plan; show "list $X" when it differs from unitPrice. */
  catalogUnitPrice?: number | null;
  /** The user typed the price. */
  priceOverridden?: boolean;
  pricingRule?: PricingRule | null;
  pricingRuleValue?: number | null;
}

/**
 * A line's contents, to add or to replace one. Which fields are sent decides
 * the kind of line:
 *   - freeform: `type`, `description`, `quantity`, `unitPrice` (all required)
 *   - labor:    `laborRateTypeId` + `quantity` (hours); the rate prices it
 *   - pricebook: `itemId` + `quantity`; the item fills in the rest
 * On labor/pricebook lines any of description/unitPrice/unitCost/unit/taxClass
 * sent override the copied value. A replace must send the full contents.
 */
export interface LineFieldsRequest {
  /** The document version the edit was made against (409 STALE_VERSION on mismatch). */
  version: number;
  type?: LineType;
  description?: string;
  quantity: number;
  unitPrice?: number;
  unitCost?: number;
  unit?: string;
  taxClass?: TaxClass;
  laborRateTypeId?: string;
  itemId?: string;
}

export interface AddLineRequest extends LineFieldsRequest {
  /** A part bought on a purchase order; priced at whatever the user bills it at. */
  sourcePoLineId?: string;
}

export type UpdateLineRequest = LineFieldsRequest;

export interface ReorderLinesRequest {
  version: number;
  /** Every line exactly once, in the new order. */
  lineIds: string[];
}

export interface AddAdjustmentRequest {
  version: number;
  /** Omit for a document-wide adjustment (spread over the lines before tax). */
  lineId?: string;
  kind: AdjustmentKind;
  /** PERCENT: a fraction (0.15). AMOUNT: dollars. WAIVE: omit (lines only). */
  value?: number;
  /** Never MEMBER — the server refuses it. */
  reasonCode: Exclude<AdjustmentReason, 'MEMBER'>;
  /** ≤ 500 chars. */
  reasonNote?: string;
}

/**
 * The edit routes quotes and invoices share. Every call returns the whole
 * recomputed document; take `version` from it for the next edit.
 */
function documentEditRoutes<D>(base: string) {
  return {
    addLine: async (id: string, request: AddLineRequest): Promise<D> => {
      const response = await apiClient.post<D>(`${base}/${id}/lines`, request);
      return response.data;
    },

    updateLine: async (id: string, lineId: string, request: UpdateLineRequest): Promise<D> => {
      const response = await apiClient.put<D>(`${base}/${id}/lines/${lineId}`, request);
      return response.data;
    },

    deleteLine: async (id: string, lineId: string, version: number): Promise<D> => {
      const response = await apiClient.delete<D>(`${base}/${id}/lines/${lineId}`, { params: { version } });
      return response.data;
    },

    reorderLines: async (id: string, request: ReorderLinesRequest): Promise<D> => {
      const response = await apiClient.put<D>(`${base}/${id}/lines/order`, request);
      return response.data;
    },

    addAdjustment: async (id: string, request: AddAdjustmentRequest): Promise<D> => {
      const response = await apiClient.post<D>(`${base}/${id}/adjustments`, request);
      return response.data;
    },

    deleteAdjustment: async (id: string, adjustmentId: string, version: number): Promise<D> => {
      const response = await apiClient.delete<D>(`${base}/${id}/adjustments/${adjustmentId}`, {
        params: { version },
      });
      return response.data;
    },
  };
}

// ========== INVOICES ==========

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'VOID';

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
} as const;

// Aging-bucket filter for GET /financial/invoices. Open invoices (SENT/OVERDUE)
// bucketed by days past `dueDate` (today − dueDate, server clock), the SAME rule
// as GET /financial/customers/{id}/ar-summary — so a bucket's filtered count
// equals that customer's matching ar-summary bucket count. Due today/future =
// CURRENT; 1–30 / 31–60 / 61–90 / 91+ are the overdue bands. The bucket already
// implies open statuses, so don't combine with a conflicting `status` (e.g.
// PAID) — that just returns empty.
export type InvoiceAgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_91_PLUS';

export const InvoiceAgingBucket = {
  CURRENT: 'CURRENT',
  DAYS_1_30: 'DAYS_1_30',
  DAYS_31_60: 'DAYS_31_60',
  DAYS_61_90: 'DAYS_61_90',
  DAYS_91_PLUS: 'DAYS_91_PLUS',
} as const;

export interface InvoiceLineItem extends DocumentLineItem {
  /** The quote line this was billed from, if any. */
  sourceQuoteLineId?: string | null;
}

/**
 * Status of a payment record. `RECEIVED` is the default for newly created
 * payments; `VOID` is set by the (pending) void endpoint and excluded from
 * the parent invoice's `amountPaid` server-side. Voided rows still appear
 * in nested `payments` arrays for audit visibility — render them muted.
 */
export type PaymentStatus = 'RECEIVED' | 'VOID';

/**
 * A payment row as it appears nested under an invoice in the response of
 * `GET /financial/work-orders/{id}/invoices`. CRITICAL semantic: `amount`
 * is the slice of the payment applied to *this* invoice, not the payment's
 * gross amount. A single check covering N invoices appears once in each
 * invoice's `payments[]` with its respective slice. `sum(invoice.payments
 * [].amount) === invoice.amountPaid` is a server-side guarantee.
 *
 * To get the full payment amount, call `paymentsApi.getById(id)` directly.
 * Not needed for the per-invoice view — the slice is the meaningful number.
 *
 * No `invoiceId` / `customerId` / `workOrderId` on the nested shape — those
 * are redundant with the parent invoice. The standalone `Payment` interface
 * still carries them for the `getById` / `getByInvoice` endpoints.
 */
export interface NestedInvoicePayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Set when the invoice was voided or cancelled and this slice went back to
   * the payment's unapplied balance. The row stays as history but no longer
   * counts toward `amountPaid` — render it as returned to credit.
   */
  reversedAt?: string | null;
}

/** `invoiceDate` / `dueDate` are null until the invoice is first issued (sent); drafts show "Not sent". */
export interface Invoice {
  id: string;
  customerId: string;
  workOrderId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: string | null;
  dueDate: string | null;
  /** When the work was done; membership is tested on it. */
  serviceDate?: string | null;
  customerPoNumber?: string | null;
  /** Send back on every edit; see the pricing block above. */
  version?: number;
  pricingModel?: PricingModel;
  /** Pre-tax, after adjustments: grossSubtotal − adjustmentTotal. */
  subtotal: number;
  /** List total before adjustments. */
  grossSubtotal?: number;
  adjustmentTotal?: number;
  adjustments?: DocumentAdjustment[];
  /** LEGACY documents only; ENGINE documents are taxed per line (see `tax`). */
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ratePlanId?: string | null;
  ratePlanName?: string | null;
  tax?: DocumentTax | null;
  warnings?: PricingWarning[];
  amountPaid: number;
  balanceDue: number;
  notes?: string;
  lineItems: InvoiceLineItem[];
  /**
   * Server-sorted by `paymentDate DESC, createdAt DESC`. Always an array;
   * `[]` when none. Includes VOID rows for audit.
   */
  payments: NestedInvoicePayment[];
  /**
   * Timestamp of the most recent successful send (Instant). `null` until
   * the first `/send` call lands. Backend denormalizes this onto the
   * invoice row so the list view doesn't have to join `notification_logs`.
   * Used by the row metadata "Last sent <date>" hint and to flip the
   * Send menu label to Resend.
   */
  lastSentAt?: string | null;
  /**
   * Comma-separated string of recipient emails resolved at the last send.
   * Backend supports 1–10 recipients per call (override the bill-to with
   * an explicit list); this stays a single string for forward-compat and
   * to match the existing DTO shape. Display layer uses `split(",")[0]`
   * for the row hint — "Last sent to alice@…" — the rare multi-recipient
   * case is acceptable to under-display in v1.
   */
  lastSentToEmails?: string | null;
  /** Comma-separated E.164 numbers texted at the last send; null when it didn't text. */
  lastSentToPhones?: string | null;
  /** On a reissue's corrected copy: the invoice it replaced ("Reissue of INV-3307"). */
  reissuedFromInvoiceId?: string | null;
  reissuedFromInvoiceNumber?: string | null;
  /** On a reissued (voided) original: its corrected copy ("Reissued as INV-3412"). */
  reissuedAsInvoiceId?: string | null;
  reissuedAsInvoiceNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A freeform line sent inline on create; labor and pricebook lines go through `addLine` after. */
export interface CreateInvoiceLineItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
  /** SERVICE when omitted. */
  type?: LineType;
  unitCost?: number;
  unit?: string;
  sourcePoLineId?: string;
  taxClass?: TaxClass;
}

/** No tax rate — the server resolves tax from the location's jurisdiction. */
export interface CreateInvoiceRequest {
  customerId: string;
  workOrderId?: string;
  /** Defaults to the work order's location; send it when there's no work order. */
  serviceLocationId?: string;
  /** Left out: dated when first sent (due = send date + the bill-to's terms). */
  invoiceDate?: string;
  dueDate?: string;
  /** Defaults to the work order's completed date, else the invoice date. */
  serviceDate?: string;
  /** Defaults from the work order's customer order number. */
  customerPoNumber?: string;
  notes?: string;
  /** Defaults to none. */
  lineItems?: CreateInvoiceLineItemRequest[];
}

/** The whole header, replaced: send every field; null clears an optional one. DRAFT only. */
export interface UpdateInvoiceHeaderRequest {
  version: number;
  invoiceDate: string | null;
  dueDate: string | null;
  serviceDate: string | null;
  customerPoNumber: string | null;
  notes: string | null;
}

/**
 * Bill an accepted quote: a new DRAFT invoice at the quote's prices and
 * adjustments, for the quantities given (each ≤ the line's remaining).
 */
export interface CreateInvoiceFromQuoteRequest {
  quoteId: string;
  lines: { quoteLineId: string; quantity: number }[];
  /** Bill someone other than the quote's customer; tax and exemption resolve for them. */
  billToCustomerId?: string;
  invoiceDate?: string;
  dueDate?: string;
  serviceDate?: string;
  notes?: string;
  /** Price afresh under the bill-to's plan and the current pricebook; typed prices are kept. */
  reprice?: boolean;
}

export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
}

/**
 * Customer-level AR rollup (FIN-1) — `GET /financial/customers/{id}/ar-summary`.
 * Drives the customer detail Billing & AR card + the attention strip's AR rule.
 * One cheap call, fired in parallel on page load. All money fields are decimal
 * dollars; aging is by days past `dueDate` on open (SENT/OVERDUE) invoices.
 *
 *  - `outstandingBalance` = sum of all 5 buckets.
 *  - Buckets are NAMED keys (not an array), each `{ amount, count }`. `current`
 *    is not-yet-due (dueDate >= today); the rest are days past due.
 *  - `oldestPastDue*` point at the oldest invoice in `days91Plus` (null if none).
 *  - `lifetimeValue` = total received (non-void) payments.
 *  - Empty customer → all zeros, `oldestPastDue*`/`mostUsedPaymentMethod` null.
 */
export interface ArAgingBucket {
  amount: number;
  count: number;
}
export type ArPaymentMethod =
  | 'CASH'
  | 'CHECK'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'ACH'
  | 'WIRE_TRANSFER'
  | 'OTHER';
export interface CustomerArSummaryResponse {
  outstandingBalance: number;
  current: ArAgingBucket;
  days1To30: ArAgingBucket;
  days31To60: ArAgingBucket;
  days61To90: ArAgingBucket;
  days91Plus: ArAgingBucket;
  oldestPastDueInvoiceId: string | null;
  oldestPastDueInvoiceDate: string | null; // ISO date yyyy-MM-dd
  lifetimeValue: number;
  mostUsedPaymentMethod: ArPaymentMethod | null;
  currency: string;
}

/**
 * Response from `POST /financial/{invoices,quotes}/{id}/send` (§4.3). The
 * server has stamped `lastSentAt` + `lastSentToEmails` on the row by the
 * time this returns — callers should invalidate the WO list query to pick
 * those up. The `shareUrl` is included primarily for a copy-link affordance
 * (not yet built).
 */
export interface SendResponse {
  notificationId: string;
  queuedAt: string;
  shareUrl: string;
  /** Null when the send went by text only. */
  lastSentToEmails: string | null;
  /** Comma-separated E.164; null when the send didn't text. */
  lastSentToPhones?: string | null;
}

/**
 * Who a send goes to and what it says. Emails and phones each left out
 * (never `[]`, which would be an explicit empty list) fall back as follows:
 * phones only → text only; neither → the customer's email on file.
 */
export interface SendOptions {
  /** At most 10. */
  recipientEmails?: string[];
  /** US numbers in any punctuation; at most 10. */
  recipientPhones?: string[];
  /** Replaces the email body for this send (≤ 2,000 chars). `{{link}}` marks where the link goes; without it the link is appended. Texts always use the SMS template. */
  message?: string;
}

const sendBody = ({ recipientEmails, recipientPhones, message }: SendOptions, date: Record<string, string>) => {
  const body = {
    ...(recipientEmails?.length ? { recipientEmails } : {}),
    ...(recipientPhones?.length ? { recipientPhones } : {}),
    ...(message?.trim() ? { message } : {}),
    ...date,
  };
  return Object.keys(body).length ? body : undefined;
};

/**
 * `POST .../preview-link`: a 30-minute link to the public page as the customer
 * will see it, for any status. Not a view; can't approve or pay.
 */
export interface PreviewLink {
  url: string;
  expiresAt: string;
}

/** `GET .../send-preview`: render `emailNotificationTypeKey` (or the SMS key) with `templateData` via `notificationTemplateApi.render`. */
export interface SendPreview {
  emailNotificationTypeKey: string;
  smsNotificationTypeKey: string;
  /** `share_url` is the literal `{{link}}` placeholder. */
  templateData: Record<string, unknown>;
}

/**
 * Response from `POST .../share-link/reissue` (§4.6). Old emails go dead
 * once this returns; the new token is in `shareUrl` and is only useful
 * after a subsequent `/send` call (Reissue does NOT auto-send — that's an
 * explicit second step per §11 open question #2's resolution).
 */
export interface ReissueShareLinkResponse {
  shareUrl: string;
}

/**
 * Response from `POST .../share-link/extend` (§4.6). Bumps `expires_at`
 * to `now() + 1 year` on the existing active row — old emails keep
 * working. Returns the new expiry so callers can confirm the bump.
 */
export interface ExtendShareLinkResponse {
  expiresAt: string;
}

/**
 * Lean invoice row returned by the LIST endpoints (`/financial/invoices`,
 * `/financial/invoices/customer/{id}`, and the `?serviceLocationId=` variant).
 *
 * ⚠️ Lean by design — NO `lineItems`, NO `payments[]`. A view that needs those
 * must lazy-load the full {@link Invoice} via `getById` on expand/click. Carries
 * the denormalized `customerName` + an `overdue` flag so list rows render
 * without a customer join.
 */
export interface InvoiceListItemRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  customerId: string;
  customerName: string | null;
  serviceLocationId: string | null;
  workOrderId: string | null;
  // Agreement billing linkage (migration 032). Present on installment invoices
  // minted from an agreement's schedule; null on ad-hoc invoices. Join the
  // installment schedule to invoices on periodKey == billingPeriodKey.
  agreementId: string | null;
  billingPeriodKey: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  overdue: boolean;
  lastSentAt: string | null;
  // What the revenue report groups by, current values; null when there's no
  // work order or location, or none is set.
  workOrderNumber: string | null;
  divisionId: string | null;
  workOrderTypeId: string | null;
  regionId: string | null;
  /**
   * Read with `openAsOf` only: the balance at the end of that date, by the
   * receivables report's rule, so a bucket's rows add up to its amount.
   */
  balanceAsOf?: number | null;
  customerPoNumber?: string | null;
  /** The bill-to is a payer (a billing-only account). */
  billToIsPayer?: boolean;
  /** The bill-to's current terms: 0 = due on receipt. */
  paymentTermsDays?: number | null;
  serviceLocationName?: string | null;
  /** "12 Elm St, Tempe" (street and city). */
  serviceLocationAddress?: string | null;
  /** Billed from this quote (a reissue keeps it). */
  quoteId?: string | null;
  quoteNumber?: string | null;
  reissuedFromInvoiceId?: string | null;
  reissuedFromInvoiceNumber?: string | null;
  reissuedAsInvoiceId?: string | null;
  reissuedAsInvoiceNumber?: string | null;
  /** When the balance reached zero; cleared if a payment is voided and it reopens. */
  paidAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Custom PageResponse envelope for the invoice list endpoints — NOT Spring's
// raw Page shape (the current index is `page`, not `number`).
/** The financial lists' page envelope (invoices, payments, quotes). */
export interface FinancialPage<T> {
  content: T[];
  page: number; // 0-based current page index
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface InvoiceListPage {
  content: InvoiceListItemRow[];
  page: number; // 0-based current page index
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export type InvoiceSortField =
  | 'invoiceDate'
  | 'dueDate'
  | 'totalAmount'
  | 'status'
  | 'createdAt'
  | 'updatedAt';

/**
 * Filters for the paged invoice list — all AND-ed together. Quirks worth
 * knowing (backend-confirmed):
 *   - `status` is single-value only; an invalid value is a server ERROR
 *     (unknown enum) — drive it from the {@link InvoiceStatus} enum, never
 *     free text. There's no multi-status param ("Open" = two requests).
 *   - `sort` outside the whitelist is silently DROPPED (falls back to
 *     `invoiceDate,DESC`) — a typo just looks like sorting doesn't work.
 *   - `q` does NOT escape LIKE wildcards: `%` matches everything, `_` any
 *     single char (unlike work-order search). Known backend gap.
 *   - `overdue=true` means open (SENT/OVERDUE) + dueDate strictly before
 *     today — same rule as the row's `overdue` flag, so filter and badge
 *     always agree. Due-today is not overdue.
 */
export interface ListInvoicesParams {
  customerId?: string;
  serviceLocationId?: string;
  agreementId?: string; // installment invoices for one agreement (migration 032)
  /** One status, or several (`SENT,OVERDUE` is the Unpaid tab). */
  status?: InvoiceStatus | InvoiceStatus[];
  from?: string; // YYYY-MM-DD, invoiceDate >= from (inclusive)
  to?: string; // YYYY-MM-DD, invoiceDate <= to (inclusive — no +1-day trick)
  overdue?: boolean; // true = open + strictly past due
  agingBucket?: InvoiceAgingBucket; // open invoices by days past dueDate; pairs with customerId. Don't also send a conflicting status.
  // Receivables drill-down: open at the end of that tenant-local day (issued
  // by then, not voided or cancelled by then, a balance left after payments
  // dated by then). With it, `agingBucket` ages from that date. Rows'
  // amountPaid/balanceDue stay as of now.
  openAsOf?: string;
  q?: string; // case-insensitive substring on invoice #, customer name, customer PO #, work order # or the site's street/name
  regionIds?: string[]; // the invoice's service location's region; a user's own regions bound it either way
  // Revenue report drill-down. `billed` = issued (not DRAFT/VOID/CANCELLED),
  // the report's billed set. Division and type are the work order's current
  // ones; each `no…` flag is that grouping's unassigned group, OR-ed with its ids.
  billed?: boolean;
  divisionIds?: string[];
  noDivision?: boolean;
  workOrderTypeIds?: string[];
  noWorkOrderType?: boolean;
  noRegion?: boolean;
  page?: number; // 0-indexed
  size?: number; // server-clamped to 1..200
  sort?: `${InvoiceSortField},${'asc' | 'desc'}`;
}

export const invoicesApi = {
  // Paged AR invoice list (lean rows). All filters AND together; `q` matches
  // invoice number or customer name. Returns the page envelope so callers can
  // drive a pager off totalElements / totalPages.
  getAll: async (params?: ListInvoicesParams): Promise<InvoiceListPage> => {
    const { status, ...rest } = params ?? {};
    const response = await apiClient.get<InvoiceListPage>('/financial/invoices', {
      params: { ...rest, ...(status ? { status: Array.isArray(status) ? status.join(',') : status } : {}) },
    });
    return response.data;
  },

  /** Counts per list tab and the summary totals, over the same scope as the list (no status or q). */
  getViews: async (params: InvoiceViewsParams = {}): Promise<InvoiceViews> => {
    const response = await apiClient.get<InvoiceViews>('/financial/invoices/views', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Invoice> => {
    const response = await apiClient.get<Invoice>(`/financial/invoices/${id}`);
    return response.data;
  },

  // Per-customer invoice list (lean rows, paged). Sugar for `getAll({ customerId })`
  // with only page/size/sort — prefer `getAll` so all filters compose.
  getByCustomer: async (
    customerId: string,
    params?: Omit<ListInvoicesParams, 'customerId'>,
  ): Promise<InvoiceListPage> => {
    const response = await apiClient.get<InvoiceListPage>(
      `/financial/invoices/customer/${customerId}`,
      { params },
    );
    return response.data;
  },

  /**
   * WO-scoped invoice list (Phase 7 backend ask #2). Server-sorted
   * `invoiceDate DESC, createdAt DESC` — don't re-sort on the client. Returns
   * `[]` when the WO has no invoices, doesn't exist, or belongs to a different
   * tenant (RLS-indistinguishable, security default). Includes VOID and
   * CANCELLED rows — the tab is the audit surface, the summary endpoint is
   * what excludes them from totals.
   */
  getByWorkOrder: async (workOrderId: string): Promise<Invoice[]> => {
    const response = await apiClient.get<Invoice[]>(
      `/financial/work-orders/${workOrderId}/invoices`,
    );
    return response.data;
  },

  /**
   * Customer-level AR rollup (FIN-1). One call, fired in parallel on the
   * customer detail page load. See {@link CustomerArSummaryResponse}.
   */
  getCustomerArSummary: async (customerId: string): Promise<CustomerArSummaryResponse> => {
    const response = await apiClient.get<CustomerArSummaryResponse>(
      `/financial/customers/${customerId}/ar-summary`,
    );
    return response.data;
  },

  create: async (request: CreateInvoiceRequest): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>('/financial/invoices', request);
    return response.data;
  },

  /** 409 QUOTE_NOT_ACCEPTED, 409 OVER_INVOICED (past a line's remaining quantity). */
  createFromQuote: async (request: CreateInvoiceFromQuoteRequest): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>('/financial/invoices/from-quote', request);
    return response.data;
  },

  updateStatus: async (id: string, request: UpdateInvoiceStatusRequest): Promise<Invoice> => {
    const response = await apiClient.patch<Invoice>(`/financial/invoices/${id}/status`, request);
    return response.data;
  },

  updateHeader: async (id: string, request: UpdateInvoiceHeaderRequest): Promise<Invoice> => {
    const response = await apiClient.put<Invoice>(`/financial/invoices/${id}/header`, request);
    return response.data;
  },

  ...documentEditRoutes<Invoice>('/financial/invoices'),

  /**
   * Void a SENT/OVERDUE/PAID invoice and create its corrected DRAFT copy in
   * one transaction (an already-VOID one is just copied). Returns the copy.
   * Payments stay behind as reversed rows; apply them to the copy with
   * `paymentsApi.apply`. 409 INVOICE_NOT_REISSUABLE (DRAFT/CANCELLED),
   * 409 ALREADY_REISSUED.
   */
  reissue: async (id: string): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>(`/financial/invoices/${id}/reissue`);
    return response.data;
  },

  /**
   * Send (or resend) the invoice (§4.3). Backend issues / reuses a share-
   * link token, publishes a `NotificationRequestedEvent` with the rendered
   * `{{share_url}}`, and stamps `lastSentAt` / `lastSentToEmails` on the
   * row. DRAFT invoices auto-flip to SENT in the same transaction —
   * callers don't need a chained status update.
   *
   * Recipient resolution:
   *   - When `recipientEmails` is omitted (or empty), backend resolves via
   *     `RecipientResolverService` against the customer's notification
   *     preferences for the `invoice_sent` event. That's the default path
   *     and the one the row's plain `Send` action hits.
   *   - When `recipientEmails` is provided, backend skips the resolver and
   *     uses the array verbatim. That's the path the (forthcoming) "Send
   *     to other…" override dialog will use.
   *
   * IMPORTANT: never send `recipientEmails: []` — backend would interpret
   * an empty array as "explicit override with zero recipients" and 422.
   * The guard below collapses empty / undefined to "no body at all" so the
   * resolver runs. Backend also coerces empty → null defensively, but the
   * FE shouldn't rely on that.
   *
   * Error codes (uniform `{ code, message }` shape):
   *   - `NO_RECIPIENT` (422)         → resolver returned nothing / override list empty
   *   - `NOT_SENDABLE_STATUS` (400)  → terminal status (VOID / CANCELLED)
   *   - `TOO_MANY_RECIPIENTS` (400)  → > 10 in override list
   *   - `INVALID_REQUEST` (400)      → malformed email in override list
   *   - `RATE_LIMIT_EXCEEDED` (429)  → backoff hint in message
   */
  send: async (
    id: string,
    { dueDate, ...rest }: SendOptions & {
      /** Drafts only (409 DOCUMENT_NOT_EDITABLE once sent): overrides the due date from the terms. */
      dueDate?: string;
    } = {},
  ): Promise<SendResponse> => {
    const response = await apiClient.post<SendResponse>(`/financial/invoices/${id}/send`, sendBody(rest, dueDate ? { dueDate } : {}));
    return response.data;
  },

  /** The public page as the customer will see it; a draft's due date override (409 DOCUMENT_NOT_EDITABLE once sent) shows on it. */
  previewLink: async (id: string, dueDate?: string): Promise<PreviewLink> => {
    const response = await apiClient.post<PreviewLink>(`/financial/invoices/${id}/preview-link`, dueDate ? { dueDate } : undefined);
    return response.data;
  },

  /** What the send email would say: its type keys plus the data to render them with via `notificationTemplateApi.render`. */
  sendPreview: async (id: string, dueDate?: string): Promise<SendPreview> => {
    const response = await apiClient.get<SendPreview>(`/financial/invoices/${id}/send-preview`, { params: dueDate ? { dueDate } : {} });
    return response.data;
  },

  /**
   * Revoke the current active share-link token and create a new one (§4.6).
   * Old emails go dead. Explicit follow-up `send` required if the CSR wants
   * the new token delivered to the customer — Reissue and Send are kept as
   * two separate affordances (locked decision in §3, "Reissue vs. Extend").
   */
  reissueShareLink: async (id: string): Promise<ReissueShareLinkResponse> => {
    const response = await apiClient.post<ReissueShareLinkResponse>(
      `/financial/invoices/${id}/share-link/reissue`,
    );
    return response.data;
  },

  /**
   * Bump `expires_at` on the active share-link row by another year from
   * `now()` (not from current `expires_at`, so a 5-year-out token can't
   * be produced by stacking clicks). Old emails keep working.
   */
  extendShareLink: async (id: string): Promise<ExtendShareLinkResponse> => {
    const response = await apiClient.post<ExtendShareLinkResponse>(
      `/financial/invoices/${id}/share-link/extend`,
    );
    return response.data;
  },

  /**
   * Revoke the active share-link without issuing a replacement. The
   * customer's previously-issued link returns 410 SHARE_LINK_REVOKED on
   * next visit. Used by §6.4's void-and-revoke flow as a second
   * sequential call after the status PATCH.
   *
   * Idempotent by design (204 No Content whether or not there was an
   * active link). Safe to retry on transient network failure — that's
   * the documented recovery if the post-void revoke step fails.
   */
  revokeShareLink: async (id: string): Promise<void> => {
    await apiClient.post(`/financial/invoices/${id}/share-link/revoke`);
  },
};

// ========== QUOTES ==========

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;

export type QuoteLineItem = DocumentLineItem;

/** `quoteDate` / `expirationDate` are null until the quote is first sent; drafts show "Not sent". */
export interface Quote {
  id: string;
  /** Short description of the work. */
  title?: string | null;
  customerId: string;
  /** Null only until the customer syncs into financial's cache. */
  customerName?: string | null;
  /** Optional WO link (Phase 7b backend ask #7). Older quotes have null. */
  workOrderId?: string;
  /** Where the work is; defaults to the work order's location. */
  serviceLocationId?: string | null;
  customerPoNumber?: string | null;
  quoteNumber: string;
  status: QuoteStatus;
  /** Bumps when a SENT quote is edited (it goes back to DRAFT). */
  revision?: number;
  /** The revision that was approved. */
  acceptedRevision?: number | null;
  /** The office user who recorded a verbal yes; null for a customer approval. */
  acceptedByUserId?: string | null;
  /** The name the customer typed when approving on the share page; null for office acceptances. */
  approvedByName?: string | null;
  /** Send back on every edit; see the pricing block above. */
  version?: number;
  pricingModel?: PricingModel;
  quoteDate: string | null;
  expirationDate: string | null;
  /** Pre-tax, after adjustments: grossSubtotal − adjustmentTotal. */
  subtotal: number;
  /** List total before adjustments. */
  grossSubtotal?: number;
  adjustmentTotal?: number;
  adjustments?: DocumentAdjustment[];
  /** LEGACY documents only; ENGINE documents are taxed per line (see `tax`). */
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ratePlanId?: string | null;
  ratePlanName?: string | null;
  tax?: DocumentTax | null;
  warnings?: PricingWarning[];
  notes?: string;
  lineItems: QuoteLineItem[];
  /** See `Invoice.lastSentAt` — same semantics. */
  lastSentAt?: string | null;
  /** See `Invoice.lastSentToEmails` — same semantics. */
  lastSentToEmails?: string | null;
  lastSentToPhones?: string | null;
  /** First send; resends don't move it. Null until sent. */
  firstSentAt?: string | null;
  /** First open of the share link. */
  firstViewedAt?: string | null;
  /** Set on ACCEPTED/DECLINED, cleared on leaving them. */
  decidedAt?: string | null;
  /** Who first sent it; resends by others don't change it. Null when not recorded. */
  firstSentByUserId?: string | null;
  firstSentByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Filters for the paged quote list, all AND-ed. */
export interface ListQuotesParams {
  /** Tenant-local days, inclusive, on firstSentAt; never-sent quotes drop out when either is set. */
  firstSentFrom?: string;
  firstSentTo?: string;
  status?: QuoteStatus[];
  /** The user who first sent it (a sender group's drill-in). */
  sentByUserId?: string;
  /** Case-insensitive, anywhere in the quote number, title or customer name. */
  q?: string;
  /** Accepted quotes with a line not fully invoiced (the `invoiceable` rule). */
  readyToInvoice?: boolean;
  /** One job's quotes. */
  workOrderId?: string;
  /** The work order's location's region; quotes with no work order are company-wide only. */
  regionIds?: string[];
  page?: number;
  size?: number; // ≤ 200
  sort?: string; // quoteDate | firstSentAt | expirationDate | totalAmount | quoteNumber, e.g. 'quoteDate,desc'
}

/** Same shape as an invoice's inline freeform line. */
export type CreateQuoteLineItemRequest = CreateInvoiceLineItemRequest;

/** No tax rate — the server resolves tax from the location's jurisdiction. */
export interface CreateQuoteRequest {
  /** The bill-to (a payer goes here). */
  customerId: string;
  /** Short description of the work, up to 120 characters. */
  title?: string;
  /** Optional WO link (Phase 7b backend ask #7). */
  workOrderId?: string;
  /** Where the work is; defaults to the work order's location. Without one: tenant-default tax, no member benefits. */
  serviceLocationId?: string;
  customerPoNumber?: string;
  quoteDate?: string;
  expirationDate?: string;
  notes?: string;
  /** Defaults to none. */
  lineItems?: CreateQuoteLineItemRequest[];
}

/** The whole header, replaced: send every field; null clears an optional one. Editing a SENT quote returns it to DRAFT. */
export interface UpdateQuoteHeaderRequest {
  version: number;
  /** Replaced on every header edit: send the current title back, or it is cleared. */
  title: string | null;
  quoteDate: string | null;
  expirationDate: string | null;
  serviceLocationId: string | null;
  customerPoNumber: string | null;
  notes: string | null;
}

/** What is left to bill on an ACCEPTED quote, per line. Drafts count as invoiced; void/cancelled don't. */
export interface QuoteInvoiceableLine {
  quoteLineId: string;
  sortOrder: number;
  description: string;
  type: LineType | null;
  unit: string | null;
  unitPrice: number;
  quantity: number;
  invoicedQuantity: number;
  remainingQuantity: number;
}

export interface QuoteInvoiceable {
  quoteId: string;
  status: QuoteStatus;
  lines: QuoteInvoiceableLine[];
}

export interface UpdateQuoteStatusRequest {
  status: QuoteStatus;
}

export const quotesApi = {
  /** Light rows (no lines, adjustments or tax); open one with `getById`. */
  getAll: async (params: ListQuotesParams = {}): Promise<FinancialPage<QuoteListItem>> => {
    const { status, ...rest } = params;
    const response = await apiClient.get<FinancialPage<QuoteListItem>>('/financial/quotes', {
      params: { ...rest, ...(status?.length ? { status: status.join(',') } : {}) },
    });
    return response.data;
  },

  /** Counts per list tab and the summary totals, over the same scope as the list (no status, q or readyToInvoice). */
  getViews: async (params: QuoteViewsParams = {}): Promise<QuoteViews> => {
    const response = await apiClient.get<QuoteViews>('/financial/quotes/views', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Quote> => {
    const response = await apiClient.get<Quote>(`/financial/quotes/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>(`/financial/quotes/customer/${customerId}`);
    return response.data;
  },

  /**
   * WO-scoped quote list (Phase 7b backend ask #8). Server-sorted
   * `quoteDate DESC, createdAt DESC`. Returns `[]` when the WO has no
   * quotes, doesn't exist, or belongs to a different tenant (RLS-
   * indistinguishable, same security default as the invoices endpoint).
   * Includes DECLINED and EXPIRED rows for audit — mute on client.
   */
  getByWorkOrder: async (workOrderId: string): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>(
      `/financial/work-orders/${workOrderId}/quotes`,
    );
    return response.data;
  },

  create: async (request: CreateQuoteRequest): Promise<Quote> => {
    const response = await apiClient.post<Quote>('/financial/quotes', request);
    return response.data;
  },

  /** ACCEPTED from the office records a verbal yes (`acceptedByUserId`). */
  updateStatus: async (id: string, request: UpdateQuoteStatusRequest): Promise<Quote> => {
    const response = await apiClient.patch<Quote>(`/financial/quotes/${id}/status`, request);
    return response.data;
  },

  updateHeader: async (id: string, request: UpdateQuoteHeaderRequest): Promise<Quote> => {
    const response = await apiClient.put<Quote>(`/financial/quotes/${id}/header`, request);
    return response.data;
  },

  /** A new DRAFT copy — how a frozen (accepted/declined/expired) quote is changed. */
  duplicate: async (id: string): Promise<Quote> => {
    const response = await apiClient.post<Quote>(`/financial/quotes/${id}/duplicate`);
    return response.data;
  },

  getInvoiceable: async (id: string): Promise<QuoteInvoiceable> => {
    const response = await apiClient.get<QuoteInvoiceable>(`/financial/quotes/${id}/invoiceable`);
    return response.data;
  },

  ...documentEditRoutes<Quote>('/financial/quotes'),

  /** See `invoicesApi.send` — same contract, quote-scoped. */
  send: async (
    id: string,
    { expirationDate, ...rest }: SendOptions & {
      /** Drafts only (409 DOCUMENT_NOT_EDITABLE once sent): overrides the expiry from the quote validity setting. */
      expirationDate?: string;
    } = {},
  ): Promise<SendResponse> => {
    const response = await apiClient.post<SendResponse>(`/financial/quotes/${id}/send`, sendBody(rest, expirationDate ? { expirationDate } : {}));
    return response.data;
  },

  /** See `invoicesApi.previewLink`. */
  previewLink: async (id: string, expirationDate?: string): Promise<PreviewLink> => {
    const response = await apiClient.post<PreviewLink>(`/financial/quotes/${id}/preview-link`, expirationDate ? { expirationDate } : undefined);
    return response.data;
  },

  /** See `invoicesApi.sendPreview`. */
  sendPreview: async (id: string, expirationDate?: string): Promise<SendPreview> => {
    const response = await apiClient.get<SendPreview>(`/financial/quotes/${id}/send-preview`, { params: expirationDate ? { expirationDate } : {} });
    return response.data;
  },

  /** See `invoicesApi.reissueShareLink` — same contract, quote-scoped. */
  reissueShareLink: async (id: string): Promise<ReissueShareLinkResponse> => {
    const response = await apiClient.post<ReissueShareLinkResponse>(
      `/financial/quotes/${id}/share-link/reissue`,
    );
    return response.data;
  },

  /** See `invoicesApi.extendShareLink` — same contract, quote-scoped. */
  extendShareLink: async (id: string): Promise<ExtendShareLinkResponse> => {
    const response = await apiClient.post<ExtendShareLinkResponse>(
      `/financial/quotes/${id}/share-link/extend`,
    );
    return response.data;
  },

  /** See `invoicesApi.revokeShareLink` — same contract, quote-scoped. */
  revokeShareLink: async (id: string): Promise<void> => {
    await apiClient.post(`/financial/quotes/${id}/share-link/revoke`);
  },
};

// ========== PAYMENTS ==========

export type PaymentMethod = 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'ACH' | 'WIRE_TRANSFER' | 'OTHER';

export const PaymentMethod = {
  CASH: 'CASH',
  CHECK: 'CHECK',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  ACH: 'ACH',
  WIRE_TRANSFER: 'WIRE_TRANSFER',
  OTHER: 'OTHER',
} as const;

export interface PaymentApplication {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amountApplied: number;
}

export interface Payment {
  id: string;
  /** The payer: the customer billed. */
  customerId: string;
  payerName: string;
  paymentNumber: string;
  status: PaymentStatus;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  applications: PaymentApplication[];
  /** 0 when VOID. */
  unappliedAmount: number;
  voidedAt: string | null;
  /** Under a region scope, the part applied to in-scope invoices; null when not region-scoped. */
  amountInScope: number | null;
  /** Who recorded it; null for older payments with no record, or the System user. */
  receivedByUserId?: string | null;
  receivedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceViewsParams {
  customerId?: string;
  serviceLocationId?: string;
  from?: string;
  to?: string;
  regionIds?: string[];
}

/** Each count equals `totalElements` of its tab's list call. */
export interface InvoiceViews {
  counts: { unpaid: number; overdue: number; draft: number; paid: number; all: number; void: number };
  /** Balance due on unpaid invoices. */
  outstanding: number;
  overdueAmount: number;
}

/** A quote as the list shows it. */
export interface QuoteListItem {
  id: string;
  quoteNumber: string;
  title?: string | null;
  status: QuoteStatus;
  customerId: string;
  customerName?: string | null;
  billToIsPayer?: boolean;
  workOrderId?: string | null;
  workOrderNumber?: string | null;
  serviceLocationId?: string | null;
  serviceLocationName?: string | null;
  serviceLocationAddress?: string | null;
  customerPoNumber?: string | null;
  quoteDate: string | null;
  expirationDate: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lineCount?: number;
  revision?: number;
  /** Who wrote it (the Advisor column); null for older quotes with no record, so fall back to the sender. */
  createdByUserId?: string | null;
  createdByName?: string | null;
  lastSentAt?: string | null;
  firstSentAt?: string | null;
  firstSentByUserId?: string | null;
  firstSentByName?: string | null;
  firstViewedAt?: string | null;
  decidedAt?: string | null;
  /** Accepted quotes only: rounded down, so 100 means nothing is left. */
  invoicedPercent?: number | null;
  /** Accepted quotes only: what's left to bill, after discounts, before tax. */
  remainingToInvoice?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteViewsParams {
  firstSentFrom?: string;
  firstSentTo?: string;
  sentByUserId?: string;
  regionIds?: string[];
}

export interface QuoteViews {
  counts: { open: number; readyToInvoice: number; accepted: number; closed: number; all: number };
  /** Total of SENT quotes, with tax. */
  awaitingCustomer: number;
  /** DRAFT or SENT quotes expiring today through the next 6 days. */
  expiringThisWeek: number;
  /** Sum of remainingToInvoice, before tax. */
  readyToInvoiceAmount: number;
}

/** Filters for the paged payment list, all AND-ed. */
export interface ListPaymentsParams {
  from?: string; // paymentDate, inclusive
  to?: string;
  method?: PaymentMethod[];
  customerId?: string;
  status?: PaymentStatus[];
  /** A payment is in a region when it paid an invoice there; unapplied ones are company-wide only. */
  regionIds?: string[];
  /** Case-insensitive, anywhere in the payment number, reference (check) number or payer name. */
  q?: string;
  page?: number;
  size?: number; // ≤ 200
  sort?: string; // paymentDate | amount | paymentNumber, e.g. 'paymentDate,desc'
}

/**
 * One application of a Payment to a single Invoice. Carries the slice that
 * lands on that invoice — same semantic as the nested `payments[].amount`
 * returned on the invoice list (ask #2). Supports split payments (one
 * check across N invoices) without a separate API call shape.
 *
 * For v1 the dialog only constructs single-element arrays — `amountApplied`
 * equals the dialog's Amount field, applied to one chosen invoice. Split-
 * payment UI is out of scope until a real CSR workflow earns it.
 */
export interface CreatePaymentApplication {
  invoiceId: string;
  amountApplied: number;
}

export interface CreatePaymentRequest {
  /**
   * Bill-to customer for this payment. For a payment against a single
   * invoice, source from `invoice.customerId` (which may differ from the
   * WO's primary customer per the third-party billing model — warranty
   * cos, insurance, etc.). When a future split-across-customers UI lands,
   * this stays per-payment (one payment, one paying party).
   */
  customerId: string;
  /** Total payment amount (gross). For single-invoice cases equals the sole `applications[0].amountApplied`. */
  amount: number;
  /** Calendar date (LocalDate "YYYY-MM-DD"), not Instant — different from invoice/dueDate. */
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  /** Required. Each entry applies a slice of the payment to one invoice. */
  applications: CreatePaymentApplication[];
}

export const paymentsApi = {
  getAll: async (params: ListPaymentsParams = {}): Promise<FinancialPage<Payment>> => {
    const { method, status, ...rest } = params;
    const response = await apiClient.get<FinancialPage<Payment>>('/financial/payments', {
      params: {
        ...rest,
        ...(method?.length ? { method: method.join(',') } : {}),
        ...(status?.length ? { status: status.join(',') } : {}),
      },
    });
    return response.data;
  },

  getById: async (id: string): Promise<Payment> => {
    const response = await apiClient.get<Payment>(`/financial/payments/${id}`);
    return response.data;
  },

  getByInvoice: async (invoiceId: string): Promise<Payment[]> => {
    const response = await apiClient.get<Payment[]>(`/financial/payments/invoice/${invoiceId}`);
    return response.data;
  },

  create: async (request: CreatePaymentRequest): Promise<Payment> => {
    const response = await apiClient.post<Payment>('/financial/payments', request);
    return response.data;
  },

  /**
   * Apply a payment's unapplied balance (e.g. credit a void returned) to
   * invoices. 409 PAYMENT_NOT_APPLICABLE on a void payment; 400 when the
   * total exceeds the unapplied balance.
   */
  apply: async (paymentId: string, applications: CreatePaymentApplication[]): Promise<Payment> => {
    const response = await apiClient.post<Payment>(`/financial/payments/${paymentId}/applications`, { applications });
    return response.data;
  },

  /**
   * Void a payment (Phase 7 backend ask #4).
   *
   *   200 + updated Payment  → success
   *   200 + Payment          → idempotent re-void (already-VOID)
   *   204 No Content         → cross-tenant or not-found
   *                             (RLS-indistinguishable, security default —
   *                             do NOT treat as error; just no-op refresh)
   *
   * Cascade: backend reverts each touched invoice's `amountPaid` /
   * `balanceDue` and demotes PAID → SENT where applicable. A single void
   * may affect multiple invoices if the payment was split across them.
   * Callers should invalidate both the invoice list and the financial
   * summary for the work order.
   */
  void: async (id: string): Promise<Payment | null> => {
    const response = await apiClient.post<Payment | ''>(
      `/financial/payments/${id}/void`,
    );
    if (response.status === 204) return null;
    return response.data as Payment;
  },
};

// ========== WORK-ORDER FINANCIAL SUMMARY ==========

/**
 * Rollup of invoiced / paid / balance for a single WO. Computed live on
 * financial-service (no caching, no denormalization onto work_orders). The
 * three amounts are BigDecimal serialized as strings to preserve precision —
 * keep them as strings for any arithmetic; only `parseFloat` for display.
 *
 * The endpoint returns 200 with all-zero totals when:
 *   - the WO exists but has no invoices
 *   - the WO id doesn't exist anywhere
 *   - the WO id belongs to a different tenant (RLS isolation)
 * These three are intentionally indistinguishable (security default).
 */
/**
 * A work order's money, from its documents. `invoiced`, `paid` and `balance`
 * count billed invoices only (not DRAFT, VOID or CANCELLED). All zero when
 * the work order is outside the caller's regions. Decimals may arrive as
 * strings.
 */
export interface WorkOrderFinancialSummary {
  invoiced: string;
  /** Total of DRAFT invoices: not billed yet. */
  inDraft: string;
  /** Total of ACCEPTED quotes. */
  quotedAccepted: string;
  /** Total of SENT quotes, waiting on the customer. */
  quotedAwaiting: string;
  /** @deprecated Every quote not declined or expired, drafts included. Read `quotedAccepted` / `quotedAwaiting`. */
  quoted?: string;
  paid: string;
  balance: string;
  currency: string;
}

export const financialSummaryApi = {
  getByWorkOrder: async (workOrderId: string): Promise<WorkOrderFinancialSummary> => {
    const response = await apiClient.get<WorkOrderFinancialSummary>(
      `/financial/work-orders/${workOrderId}/summary`,
    );
    return response.data;
  },
};

// ========== TAX ==========

/** Where tax comes from. `rate` is a fraction (8.25% is 0.0825); null means not set yet, so nothing is taxed. */
export interface TaxJurisdiction {
  id: string;
  name: string;
  rate: number | null;
  taxesLabor: boolean;
  taxesMaterials: boolean;
  taxesEquipment: boolean;
  taxesFees: boolean;
  isDefault: boolean;
  active: boolean;
  /**
   * Locations explicitly assigned to it; the default's count leaves out the
   * locations that fall back to it. Null on a location's `effective` one.
   */
  locationCount?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The whole jurisdiction, replaced on update. Never deleted: deactivate with `active: false`. */
export interface TaxJurisdictionRequest {
  name: string;
  rate: number | null;
  taxesLabor: boolean;
  taxesMaterials: boolean;
  taxesEquipment: boolean;
  taxesFees: boolean;
  /** Making one the default takes it from the previous default. */
  isDefault: boolean;
  active: boolean;
}

/** A location's tax: what was assigned to it (null = none) and what applies, the assignment or else the default. */
export interface LocationTaxJurisdiction {
  serviceLocationId: string;
  assignedJurisdictionId: string | null;
  effective: TaxJurisdiction | null;
}

export interface PricingSettings {
  /** The tax class agreement installment invoices are issued under. */
  agreementFeeTaxClass: TaxClass;
  /** Days a quote stays open after it's sent (1–365, default 30). */
  quoteValidityDays?: number;
  updatedAt: string | null;
}

/**
 * Tax jurisdictions and pricing settings. Reading needs no capability;
 * writing needs MANAGE_PRICING, except a location's assignment, which
 * EDIT_QUOTES or EDIT_INVOICES can also set. 409 codes: NAME_TAKEN,
 * DEFAULT_REQUIRED, DEFAULT_MUST_BE_ACTIVE, JURISDICTION_IN_USE.
 */
export const taxApi = {
  /** Active and inactive, by name. */
  getJurisdictions: async (): Promise<TaxJurisdiction[]> => {
    const response = await apiClient.get<TaxJurisdiction[]>('/financial/tax-jurisdictions');
    return response.data;
  },

  createJurisdiction: async (request: TaxJurisdictionRequest): Promise<TaxJurisdiction> => {
    const response = await apiClient.post<TaxJurisdiction>('/financial/tax-jurisdictions', request);
    return response.data;
  },

  updateJurisdiction: async (id: string, request: TaxJurisdictionRequest): Promise<TaxJurisdiction> => {
    const response = await apiClient.put<TaxJurisdiction>(`/financial/tax-jurisdictions/${id}`, request);
    return response.data;
  },

  getLocationJurisdiction: async (serviceLocationId: string): Promise<LocationTaxJurisdiction> => {
    const response = await apiClient.get<LocationTaxJurisdiction>(
      `/financial/service-locations/${serviceLocationId}/tax-jurisdiction`,
    );
    return response.data;
  },

  /** Null clears the assignment, so the default applies. */
  setLocationJurisdiction: async (
    serviceLocationId: string,
    taxJurisdictionId: string | null,
  ): Promise<LocationTaxJurisdiction> => {
    const response = await apiClient.put<LocationTaxJurisdiction>(
      `/financial/service-locations/${serviceLocationId}/tax-jurisdiction`,
      { taxJurisdictionId },
    );
    return response.data;
  },

  getPricingSettings: async (): Promise<PricingSettings> => {
    const response = await apiClient.get<PricingSettings>('/financial/pricing-settings');
    return response.data;
  },

  /** `quoteValidityDays` (1–365) left out keeps the current value. */
  updatePricingSettings: async (agreementFeeTaxClass: TaxClass, quoteValidityDays?: number): Promise<PricingSettings> => {
    const response = await apiClient.put<PricingSettings>('/financial/pricing-settings', {
      agreementFeeTaxClass,
      ...(quoteValidityDays != null ? { quoteValidityDays } : {}),
    });
    return response.data;
  },
};

export type LaborRateRole = 'REGULAR' | 'OVERTIME' | 'AFTER_HOURS' | 'HOLIDAY';

/**
 * A kind of labor hour and what it bills at. The four seeded types carry a
 * `role` that can't change; types the tenant adds have none.
 */
export interface LaborRateType {
  id: string;
  name: string;
  role: LaborRateRole | null;
  /** What an hour bills at; null leaves it unpriced (labor can't be added at it unless the plan or the user prices it). */
  billRate: number | null;
  /** Loaded cost of an hour. Internal only. */
  costRate: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The whole rate type, replaced on update. Never deleted: deactivate with `active: false`. */
export interface LaborRateTypeRequest {
  name: string;
  billRate: number | null;
  costRate: number | null;
  sortOrder: number;
  active: boolean;
}

/**
 * Labor rate types. Reading needs no capability; writing needs
 * MANAGE_PRICING. Changing Regular's bill rate reprices every computed
 * pricebook item. PUT replaces `sortOrder` too, so send the current one back.
 * 409 codes: NAME_TAKEN, REGULAR_REQUIRED.
 */
export const laborRatesApi = {
  /** Active and inactive, in the tenant's order. */
  getAll: async (): Promise<LaborRateType[]> => {
    const response = await apiClient.get<LaborRateType[]>('/financial/labor-rates');
    return response.data;
  },

  create: async (request: LaborRateTypeRequest): Promise<LaborRateType> => {
    const response = await apiClient.post<LaborRateType>('/financial/labor-rates', request);
    return response.data;
  },

  update: async (id: string, request: LaborRateTypeRequest): Promise<LaborRateType> => {
    const response = await apiClient.put<LaborRateType>(`/financial/labor-rates/${id}`, request);
    return response.data;
  },

  /**
   * Sets the whole order in one transaction. Lists every rate type exactly
   * once, inactive ones included; 400 INVALID_REQUEST when the list is out
   * of date. Returns the list in its new order.
   */
  reorder: async (orderedIds: string[]): Promise<LaborRateType[]> => {
    const response = await apiClient.post<LaborRateType[]>('/financial/labor-rates/reorder', { orderedIds });
    return response.data;
  },
};

export type PricebookItemType = 'SERVICE' | 'MATERIAL' | 'EQUIPMENT' | 'FEE';

/**
 * How an item's price is made. FIXED: as entered. MARKUP: unitCost × (1 +
 * markupPct). COMPUTED (services only): laborHours × the Regular rate, plus
 * materialsCost marked up; the server calculates it.
 */
export type PricingMode = 'FIXED' | 'MARKUP' | 'COMPUTED';

/** A pricebook category; build the tree from `parentId`. */
export interface PricebookCategory {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  active: boolean;
  /** Active items in it and all its subcategories (the same scope as the `categoryId` filter). */
  activeItemCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PricebookCategoryRequest {
  name: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
}

export interface PricebookItem {
  id: string;
  itemType: PricebookItemType;
  feeRole: FeeRole | null;
  name: string;
  sku: string | null;
  categoryId: string | null;
  unit: string;
  taxClass: TaxClass;
  pricingMode: PricingMode;
  /** Null only for a COMPUTED item while the Regular rate isn't set; it can't be billed yet. */
  unitPrice: number | null;
  /** Internal only, as are the computed inputs below. */
  unitCost: number | null;
  /** A fraction: 0.35 is 35%. */
  markupPct: number | null;
  laborHours: number | null;
  materialsCost: number | null;
  active: boolean;
  /**
   * Only when asked with `billToCustomerId`: what a line added from it gets
   * under that account's rate plan (equal to `unitPrice` when no rule
   * applies; null when the item has no price at all).
   */
  planUnitPrice?: number | null;
  /** The plan rule that set `planUnitPrice`; null when the list price stands. */
  pricingRule?: PricingRule | null;
  pricingRuleValue?: number | null;
  /** Send back on an edit; a mismatch is 409 STALE_VERSION. */
  version: number;
  /** How it's shown to customers on public quotes; null when it has none. */
  presentation?: ItemPresentation | null;
  hasPresentation?: boolean;
  /** The main photo's thumbnail, for the list. */
  thumbnailUrl?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PresentationPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
}

export interface ItemPresentation {
  /** Null or blank: the item name. */
  customerName?: string | null;
  description?: string | null;
  highlights: string[];
  /** In order; the first is the main photo. */
  photos: PresentationPhoto[];
}

/** Sent to set an item's presentation; replaces it whole. */
export interface ItemPresentationRequest {
  customerName?: string | null;
  description?: string | null;
  /** 0–5, each ≤ 120; blank entries are dropped. */
  highlights: string[];
  /** 0–4 READY media ids, in order. */
  photoIds: string[];
}

/** The whole item, replaced on update. Never deleted: deactivate with `active: false`. */
export interface PricebookItemRequest {
  /** Required on update. */
  version?: number;
  itemType: PricebookItemType;
  /** Required on FEE items, refused on others. */
  feeRole: FeeRole | null;
  name: string;
  sku: string | null;
  categoryId: string | null;
  unit: string | null;
  /** Null takes the type's default. */
  taxClass: TaxClass | null;
  pricingMode: PricingMode;
  unitPrice: number | null;
  unitCost: number | null;
  markupPct: number | null;
  laborHours: number | null;
  materialsCost: number | null;
  active: boolean;
  /** Left out: unchanged. null: removed. An object: replaces it. */
  presentation?: ItemPresentationRequest | null;
}

export interface PricebookItemQuery {
  /** Name or SKU. */
  q?: string;
  type?: PricebookItemType;
  /** Includes subcategories. */
  categoryId?: string;
  /** Omit for both. */
  active?: boolean;
  pricingMode?: PricingMode;
  /** Price each result for this account's rate plan (the document's customer). */
  billToCustomerId?: string;
  page?: number;
  /** At most 200. */
  size?: number;
  /** `name,asc` etc. over name, sku, itemType, unitPrice, updatedAt. */
  sort?: string;
}

/**
 * The pricebook. Reading needs no capability; writing needs MANAGE_PRICING.
 * 409 codes: STALE_VERSION, SKU_TAKEN, NAME_TAKEN, CATEGORY_IN_USE.
 */
export const pricebookApi = {
  /** Every category, flat. */
  getCategories: async (): Promise<PricebookCategory[]> => {
    const response = await apiClient.get<PricebookCategory[]>('/financial/pricebook/categories');
    return response.data;
  },

  createCategory: async (request: PricebookCategoryRequest): Promise<PricebookCategory> => {
    const response = await apiClient.post<PricebookCategory>('/financial/pricebook/categories', request);
    return response.data;
  },

  updateCategory: async (id: string, request: PricebookCategoryRequest): Promise<PricebookCategory> => {
    const response = await apiClient.put<PricebookCategory>(`/financial/pricebook/categories/${id}`, request);
    return response.data;
  },

  getItems: async (params: PricebookItemQuery = {}): Promise<FinancialPage<PricebookItem>> => {
    const response = await apiClient.get<FinancialPage<PricebookItem>>('/financial/pricebook/items', { params });
    return response.data;
  },

  /**
   * Active items ranked by how often they were added to quotes and invoices
   * in the last 90 days. `size` at most 20.
   */
  getFrequent: async (params: { size?: number; billToCustomerId?: string } = {}): Promise<PricebookItem[]> => {
    const response = await apiClient.get<PricebookItem[]>('/financial/pricebook/items/frequent', { params });
    return response.data;
  },

  getItem: async (id: string): Promise<PricebookItem> => {
    const response = await apiClient.get<PricebookItem>(`/financial/pricebook/items/${id}`);
    return response.data;
  },

  createItem: async (request: PricebookItemRequest): Promise<PricebookItem> => {
    const response = await apiClient.post<PricebookItem>('/financial/pricebook/items', request);
    return response.data;
  },

  updateItem: async (id: string, request: PricebookItemRequest): Promise<PricebookItem> => {
    const response = await apiClient.put<PricebookItem>(`/financial/pricebook/items/${id}`, request);
    return response.data;
  },
};

export type MediaStatus = 'PENDING' | 'READY';

/** An image in the tenant's media library. `url` (≤1600px) and `thumbnailUrl` (400px) are permanent CDN links, null until READY. */
export interface Media {
  id: string;
  status: MediaStatus;
  url?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Image types the library takes (HEIC is refused), up to 20 MB. */
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;

/**
 * The tenant media library (images). Upload is presigned and two-step:
 * `upload-url` → PUT to S3 → `confirm`. Writes need MANAGE_PRICING.
 * Errors: 400 INVALID_REQUEST (type, size, name), 409 UPLOAD_MISSING,
 * 400 UNREADABLE_IMAGE, 404 MEDIA_NOT_FOUND.
 */
export const mediaApi = {
  get: async (id: string): Promise<Media> => {
    const response = await apiClient.get<Media>(`/financial/media/${id}`);
    return response.data;
  },

  /** Upload one image and wait for its renditions; resolves READY media. */
  upload: async (file: File): Promise<Media> => {
    const { data: target } = await apiClient.post<{ mediaId: string; uploadUrl: string; contentType: string }>(
      '/financial/media/upload-url',
      { fileName: file.name, contentType: file.type, sizeBytes: file.size },
    );
    // Straight to S3, without our auth header; the content type must match exactly.
    const res = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': target.contentType }, body: file });
    if (!res.ok) throw new Error(`Upload failed with ${res.status}`);
    const { data } = await apiClient.post<Media>(`/financial/media/${target.mediaId}/confirm`);
    return data;
  },
};

/** A plan's bill rate for one labor rate type, replacing the tenant's rate for its accounts. */
export interface PlanLaborRate {
  laborRateTypeId: string;
  billRate: number;
}

/** Materials costing `minCost` or more (to the next tier) are priced at cost × (1 + markupPct). */
export interface PlanMarkupTier {
  minCost: number;
  markupPct: number;
}

/** Pricebook items in the category and its subcategories are priced × priceMultiplier. */
export interface PlanCategoryMultiplier {
  categoryId: string;
  priceMultiplier: number;
}

/** How an account is priced. Every tenant has a default plan ("Standard"). */
export interface RatePlan {
  id: string;
  name: string;
  /** Internal only: why the plan exists. */
  description?: string | null;
  isDefault: boolean;
  /** 0.90 = 10% off everything a more specific rule doesn't price. */
  priceMultiplier: number | null;
  /** False: agreement member benefits don't apply on this plan. */
  memberBenefitsStack: boolean;
  active: boolean;
  laborRates: PlanLaborRate[];
  /** Lowest first. */
  markupTiers: PlanMarkupTier[];
  categoryMultipliers: PlanCategoryMultiplier[];
  createdAt: string | null;
  updatedAt: string | null;
  /** Accounts explicitly assigned; the default's count leaves out the accounts that fall back to it. */
  accountCount?: number;
}

/** An account on a plan. `customerName` is null only when financial-service hasn't received the customer yet. */
export interface RatePlanAccount {
  customerId: string;
  customerName: string | null;
  assignedAt: string | null;
}

/** The whole plan; the rule lists replace the plan's existing rules. Never deleted: deactivate with `active: false`. */
export interface RatePlanRequest {
  name: string;
  /** Up to 500; blank clears it. */
  description: string | null;
  /** Making one the default takes it from the previous default. */
  isDefault: boolean;
  priceMultiplier: number | null;
  memberBenefitsStack: boolean;
  active: boolean;
  laborRates: PlanLaborRate[];
  markupTiers: PlanMarkupTier[];
  categoryMultipliers: PlanCategoryMultiplier[];
}

/** An account's plan: what was assigned to it (null = none) and what applies, the assignment or else the default. */
export interface CustomerRatePlan {
  customerId: string;
  assignedRatePlanId: string | null;
  effective: { id: string; name: string } | null;
}

/**
 * Rate plans. Reading needs no capability; writing needs MANAGE_PRICING.
 * 409 codes: NAME_TAKEN, DEFAULT_REQUIRED, DEFAULT_MUST_BE_ACTIVE,
 * RATE_PLAN_IN_USE.
 */
export const ratePlansApi = {
  /** Active and inactive, by name, with their rules. */
  getAll: async (): Promise<RatePlan[]> => {
    const response = await apiClient.get<RatePlan[]>('/financial/rate-plans');
    return response.data;
  },

  get: async (id: string): Promise<RatePlan> => {
    const response = await apiClient.get<RatePlan>(`/financial/rate-plans/${id}`);
    return response.data;
  },

  create: async (request: RatePlanRequest): Promise<RatePlan> => {
    const response = await apiClient.post<RatePlan>('/financial/rate-plans', request);
    return response.data;
  },

  update: async (id: string, request: RatePlanRequest): Promise<RatePlan> => {
    const response = await apiClient.put<RatePlan>(`/financial/rate-plans/${id}`, request);
    return response.data;
  },

  /** The accounts on a plan, by name. Assign and unassign with `setCustomerPlan`. `size` at most 200. */
  getAccounts: async (id: string, params: { page?: number; size?: number } = {}): Promise<FinancialPage<RatePlanAccount>> => {
    const response = await apiClient.get<FinancialPage<RatePlanAccount>>(`/financial/rate-plans/${id}/accounts`, { params });
    return response.data;
  },

  getCustomerPlan: async (customerId: string): Promise<CustomerRatePlan> => {
    const response = await apiClient.get<CustomerRatePlan>(`/financial/customers/${customerId}/rate-plan`);
    return response.data;
  },

  /** Null clears the assignment, so the default plan applies. */
  setCustomerPlan: async (customerId: string, ratePlanId: string | null): Promise<CustomerRatePlan> => {
    const response = await apiClient.put<CustomerRatePlan>(`/financial/customers/${customerId}/rate-plan`, { ratePlanId });
    return response.data;
  },
};

/** A part bought on a purchase order for a job and not yet on an invoice that counts (not void or cancelled; drafts count). */
export interface UnbilledPurchase {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  purchaseOrderType: 'ORDER' | 'FIELD' | 'STOCK';
  poLineId: string;
  description: string;
  sku?: string | null;
  /** Ordered. */
  quantity: number;
  billedQuantity: number;
  /** Always above 0 on the list. */
  unbilledQuantity: number;
  /** Internal only. */
  unitCost: number;
  unbilledCost: number;
  /** The PO line's bill price, when it has one. */
  suggestedUnitPrice?: number | null;
  /** Only with `includeNotBillable`, on parts marked not billable. */
  notBillable?: PurchaseLineBilling | null;
}

/** Whether a PO line is marked as never billed to the customer, and who said so. */
export interface PurchaseLineBilling {
  poLineId: string;
  notBillable: boolean;
  reason?: string | null;
  markedByUserId?: string | null;
  markedByName?: string | null;
  markedAt?: string | null;
}

/**
 * Parts bought for a job that aren't billed yet, and dismissing ones that
 * never will be. No capability beyond tenant membership.
 */
export const purchaseBillingApi = {
  /** By PO number, then line order. `includeNotBillable` brings back dismissed parts with their decision. */
  getUnbilled: async (workOrderId: string, includeNotBillable = false): Promise<UnbilledPurchase[]> => {
    const response = await apiClient.get<UnbilledPurchase[]>(`/financial/work-orders/${workOrderId}/unbilled-purchases`, {
      params: includeNotBillable ? { includeNotBillable: true } : undefined,
    });
    return response.data;
  },

  /** Mark not billable with a reason (required, ≤ 500), or undo. 400 INVALID_REQUEST for an unknown line or bad reason. */
  setBilling: async (
    poLineId: string,
    body: { notBillable: true; reason: string } | { notBillable: false },
  ): Promise<PurchaseLineBilling> => {
    const response = await apiClient.put<PurchaseLineBilling>(`/financial/purchase-order-lines/${poLineId}/billing`, body);
    return response.data;
  },
};

// ========== LOCATION FINANCIAL ACTIVITY ==========

/** The quote, invoice and payment steps the financial feeds carry. */
export type FinancialActivityKind =
  | 'QUOTE_SENT'
  | 'QUOTE_VIEWED'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_DECLINED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID'
  | 'INVOICE_VOIDED'
  | 'PAYMENT_RECEIVED';

/**
 * A quote or invoice step at a location, for a customer, or tenant-wide: the
 * work order tab's row (`subject` is the document, `data.totalAmount` or a
 * payment's `data.amount`) plus where it happened. `serviceLocationId` may be
 * null on the customer feed for a document with no site.
 */
export type FinancialActivityEvent = ActivityEvent & {
  workOrderId: string | null;
  serviceLocationId: string | null;
};

/** Cursor-paginated, same envelope as the work order streams so they co-paginate. */
export interface FinancialActivityPage {
  content: FinancialActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** `kinds` filters on the server, which keeps paging correct. */
export interface FinancialActivityParams {
  cursor?: string;
  limit?: number;
  kinds?: FinancialActivityKind[];
}

const financialActivityQuery = ({ kinds, ...rest }: FinancialActivityParams = {}) => ({
  ...rest,
  ...(kinds?.length ? { kinds: kinds.join(',') } : {}),
});

export const financialActivityApi = {
  /** A location's quote and invoice steps (the document's site), newest first. */
  getForLocation: async (serviceLocationId: string, params?: FinancialActivityParams): Promise<FinancialActivityPage> => {
    const response = await apiClient.get<FinancialActivityPage>(`/financial/locations/${serviceLocationId}/activity`, {
      params: financialActivityQuery(params),
    });
    return response.data;
  },

  /** A customer's quote and invoice steps (documents billed to them), newest first. */
  getForCustomer: async (customerId: string, params?: FinancialActivityParams): Promise<FinancialActivityPage> => {
    const response = await apiClient.get<FinancialActivityPage>(`/financial/customers/${customerId}/activity`, {
      params: financialActivityQuery(params),
    });
    return response.data;
  },

  /** Tenant-wide steps (home dashboard); `regionIds` narrows to documents in those regions. */
  getForTenant: async (params?: FinancialActivityParams & { regionIds?: string[] }): Promise<FinancialActivityPage> => {
    const { regionIds, ...rest } = params ?? {};
    const response = await apiClient.get<FinancialActivityPage>('/financial/activity', {
      params: { ...financialActivityQuery(rest), ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },
};

// ========== REPORTS ==========
// The Revenue report. Same billed/collected definitions as the dashboard
// revenue read (a whole calendar month or quarter matches it to the cent).

export type RevenueReportCompare = 'sameDatesLastYear' | 'previousPeriod' | 'none';
export type RevenueReportGroupBy = 'division' | 'workOrderType' | 'region' | 'none';

export interface RevenueReportParams {
  /** Tenant-local YYYY-MM-DD; at most 3 years apart. */
  from: string;
  /** Cut off at today by the server; read the response's `to`. */
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: RevenueReportGroupBy;
  regionIds?: string[];
}

export interface RevenueReportComparison {
  basis: Exclude<RevenueReportCompare, 'none'>;
  from: string;
  to: string;
  billed: number;
  invoiceCount: number;
  collected: number;
}

/** One group's share. `id` null = unassigned (no work order or location, or none set). */
export interface RevenueReportGroup {
  id: string | null;
  billed: number;
  invoiceCount: number;
  /** Null when the report has no comparison. */
  comparisonBilled: number | null;
  comparisonInvoiceCount: number | null;
}

export interface RevenueReport {
  from: string;
  /** The day the figures actually end on. */
  to: string;
  billed: number;
  invoiceCount: number;
  collected: number;
  /** Every day from `from` to `to`, zero-filled. */
  billedByDay: DailyAmount[];
  /** Null with `compare=none`, or when billing in scope began after the comparison window's start. */
  comparison: RevenueReportComparison | null;
  groupBy: RevenueReportGroupBy;
  /** Add up to `billed` and `invoiceCount` exactly; the null group is last, the rest by billed. */
  groups: RevenueReportGroup[];
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

/**
 * GET /financial/reports/receivables: what was open at the end of `asOf`
 * (tenant-local, default today), aged from that date. Same buckets as the
 * dashboard's receivables; `overdue` is the four past-due ones. Each bucket's
 * count is the invoice list's `totalElements` with `openAsOf` and that bucket.
 */
export interface ReceivablesReport {
  asOf: string;
  outstanding: number;
  overdue: ArAgingBucket;
  current: ArAgingBucket;
  days1To30: ArAgingBucket;
  days31To60: ArAgingBucket;
  days61To90: ArAgingBucket;
  days91Plus: ArAgingBucket;
  currency: string;
  regionIds: string[] | null;
}

export const receivablesReportApi = {
  get: async ({ asOf, regionIds }: { asOf?: string; regionIds?: string[] } = {}): Promise<ReceivablesReport> => {
    const response = await apiClient.get<ReceivablesReport>('/financial/reports/receivables', {
      params: { ...(asOf ? { asOf } : {}), ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },
};

export type PaymentReportGroupBy = 'method' | 'payer' | 'day' | 'none';

export interface PaymentReportParams {
  /** By paymentDate, tenant-local, inclusive. */
  from: string;
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: PaymentReportGroupBy;
  regionIds?: string[];
}

export interface PaymentDay {
  date: string;
  amount: number;
  count: number;
}

export interface PaymentMethodAmount {
  method: PaymentMethod;
  amount: number;
  count: number;
}

/**
 * A method (`id` the method), a payer (`id` the customer, with its `name`) or a
 * day (`id` the date, with `byMethod`, the deposit view). Comparison fields are
 * null without a comparison and always null on days.
 */
export interface PaymentReportGroup {
  id: string;
  name: string | null;
  amount: number;
  count: number;
  comparisonAmount: number | null;
  comparisonCount: number | null;
  byMethod?: PaymentMethodAmount[];
}

export interface PaymentReport {
  from: string;
  /** Cut off at today. */
  to: string;
  /** Revenue's `collected` for the same range and scope. Scoped, the part applied in scope. */
  received: ArAgingBucket;
  /** Payments dated in the range since voided, by the same rule. */
  voided: ArAgingBucket;
  /** Every day in the range, zero-filled. */
  receivedByDay: PaymentDay[];
  /** Exactly when Revenue's is: null when not asked for, or billing in scope began after its start. */
  comparison: {
    basis: Exclude<RevenueReportCompare, 'none'>;
    from: string;
    to: string;
    received: ArAgingBucket;
    voided: ArAgingBucket;
  } | null;
  groupBy: PaymentReportGroupBy;
  groups: PaymentReportGroup[];
  currency: string;
  regionIds: string[] | null;
}

export const paymentReportApi = {
  get: async ({ regionIds, ...params }: PaymentReportParams): Promise<PaymentReport> => {
    const response = await apiClient.get<PaymentReport>('/financial/reports/payments', {
      params: { ...params, ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },
};

export type QuoteReportGroupBy = 'sender' | 'none';

export interface QuoteReportParams {
  from: string;
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: QuoteReportGroupBy;
  regionIds?: string[];
}

/** The funnel: quotes first sent in the range, split by current status. */
export interface QuoteFunnelFigures {
  /** The whole cohort. */
  sent: ArAgingBucket;
  /** Opened by the customer through a share link. */
  viewed: ArAgingBucket;
  accepted: ArAgingBucket;
  declined: ArAgingBucket;
  expired: ArAgingBucket;
  /** Still SENT. A cohort quote moved back to DRAFT is in `sent` only. */
  open: ArAgingBucket;
  /** accepted ÷ (accepted + declined) by count, 0–1; null when none decided. */
  winRate: number | null;
  /** First send → decision, over decisions with a recorded time; null when none. */
  averageDaysToDecision: number | null;
}

export interface QuoteReportComparison extends QuoteFunnelFigures {
  basis: Exclude<RevenueReportCompare, 'none'>;
  from: string;
  to: string;
}

/** One first sender's share; `id` null is quotes with no recorded sender (sorted last). */
export interface QuoteReportGroup extends QuoteFunnelFigures {
  id: string | null;
  /** Null without a comparison; zero (rate null) for a sender with none then. */
  comparisonSent: ArAgingBucket | null;
  comparisonAccepted: ArAgingBucket | null;
  comparisonWinRate: number | null;
}

export interface QuoteReport extends QuoteFunnelFigures {
  from: string;
  /** Cut off at today. */
  to: string;
  /** Null when not asked for, or when the first quote in scope went out after the comparison's start. */
  comparison: QuoteReportComparison | null;
  groupBy: QuoteReportGroupBy;
  /** Empty with groupBy none. */
  groups: QuoteReportGroup[];
  currency: string;
  regionIds: string[] | null;
}

export const quoteReportApi = {
  get: async ({ regionIds, ...params }: QuoteReportParams): Promise<QuoteReport> => {
    const response = await apiClient.get<QuoteReport>('/financial/reports/quotes', {
      params: { ...params, ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },
};

export const revenueReportApi = {
  get: async ({ regionIds, ...params }: RevenueReportParams): Promise<RevenueReport> => {
    const response = await apiClient.get<RevenueReport>('/financial/reports/revenue', {
      params: { ...params, ...(regionIds?.length ? { regionIds } : {}) },
    });
    return response.data;
  },
};

// ========== HOME DASHBOARD ==========
// Tenant-wide aggregates, one endpoint per card so each card loads on its own.
// Each takes optional `regionIds`: an invoice is in its service location's
// region, a quote in its work order's location's. Invoices and quotes with no
// location count only in whole-company figures. A user with assigned regions
// sees only theirs either way; the response's `regionIds` is what the figures
// cover (null = whole company). Dates are the tenant's zone; money is decimal
// dollars.

/** Optional dashboard scope; omit (or empty) for the whole company. */
export interface DashboardScopeParams {
  regionIds?: string[];
}

/** A dashboard read. No params at all for the default, so an unscoped
 * current-month request is unchanged. */
async function dashboardGet<T>(path: string, params: { period?: string; regionIds?: string[] }): Promise<T> {
  const query = {
    ...(params.period ? { period: params.period } : {}),
    ...(params.regionIds?.length ? { regionIds: params.regionIds } : {}),
  };
  const response = Object.keys(query).length
    ? await apiClient.get<T>(path, { params: query })
    : await apiClient.get<T>(path);
  return response.data;
}

/** "Needs attention" rows owned by financial-service. `overdue` is open invoices
 * past due, net of payments. `unbilledWorkOrderCount` is completed hand-entered
 * work orders with no non-void invoice (a draft counts as invoiced; agreement-
 * generated orders never count). */
export interface FinancialDashboardAttention {
  overdue: ArAgingBucket;
  /** @deprecated Use `workOrderApi.getAll({ unbilled: true, size: 1 })` →
   *  `totalElements`, which matches the list it opens and drops deleted work
   *  orders. Will be removed by the backend. */
  unbilledWorkOrderCount: number;
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

export interface DailyAmount {
  date: string; // ISO date yyyy-MM-dd
  amount: number;
}

/** Month to date. `billed` = issued invoices (not DRAFT/VOID/CANCELLED) by
 * invoice date; `collected` = received payments by payment date. `*PreviousPeriod`
 * covers the same days of last month. `billedByDay` runs `periodStart`..`asOf`,
 * zero-filled — group it into weeks client-side. */
/**
 * A Revenue-tab reporting period: `YYYY-MM` (month), `YYYY-Qn` (quarter),
 * `YYYY-YTD` (year to date; a past year's is the whole year) or `YYYY` (full
 * year). Omit for the current month to date. Tenant-local; a period that
 * contains today stops at today; a future one or a bad format is a 400.
 */
export type ReportingPeriodParam = string;

/** What the billed delta is measured against; `basis` null (and `billed` null) when nothing is. */
export type RevenueComparisonBasis = 'sameDaysLastYear' | 'samePeriodLastYear' | 'previousMonth';

export interface FinancialDashboardRevenue {
  periodStart: string;
  /** Last day counted: today for a current period, else the period's last day. */
  asOf: string;
  /** Where the period ends if it runs its course; equals `asOf` for a past period. */
  periodEnd: string;
  /** The period contains today. */
  isCurrent: boolean;
  /** Issued invoices by invoice date, total including tax. */
  billed: number;
  /** The previous period of the same kind, like for like. */
  billedPreviousPeriod: number;
  collected: number;
  collectedPreviousPeriod: number;
  /** One per day from `periodStart` to `asOf`, zero-filled. */
  billedByDay: DailyAmount[];
  comparison: { basis: RevenueComparisonBasis | null; billed: number | null };
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

/** Open AR, **net of payments applied** (the customer ar-summary is face value,
 * so the two can differ). Bucket counts match the invoice list's `agingBucket`
 * filter; `overdue` is the four past-due buckets. `averageDaysToPay` is invoice
 * date → payment over the last 30 days, null when nothing was paid. */
export interface FinancialDashboardReceivables {
  asOf: string;
  outstanding: number;
  overdue: ArAgingBucket;
  current: ArAgingBucket;
  days1To30: ArAgingBucket;
  days31To60: ArAgingBucket;
  days61To90: ArAgingBucket;
  days91Plus: ArAgingBucket;
  averageDaysToPay: number | null;
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

/** `open*` = sent and not yet expired. The funnel is quotes FIRST SENT in the
 * last 30 days, by current status. `winRate` is 0–1 (accepted ÷ decided), null
 * when none decided. `viewed` and `averageDaysToDecision` only count from the
 * backend deploy onward, so they under-count for the first 30 days. */
export interface FinancialDashboardQuotes {
  openCount: number;
  openAmount: number;
  sent: ArAgingBucket;
  viewed: ArAgingBucket;
  accepted: ArAgingBucket;
  declined: ArAgingBucket;
  winRate: number | null;
  averageDaysToDecision: number | null;
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

export const financialDashboardApi = {
  getAttention: (params: DashboardScopeParams = {}) =>
    dashboardGet<FinancialDashboardAttention>('/financial/dashboard/attention', params),

  getRevenue: (params: { period?: ReportingPeriodParam } & DashboardScopeParams = {}) =>
    dashboardGet<FinancialDashboardRevenue>('/financial/dashboard/revenue', params),

  getReceivables: (params: DashboardScopeParams = {}) =>
    dashboardGet<FinancialDashboardReceivables>('/financial/dashboard/receivables', params),

  getQuotes: (params: DashboardScopeParams = {}) =>
    dashboardGet<FinancialDashboardQuotes>('/financial/dashboard/quotes', params),
};

/** One calendar month's target. `amount` null = no target (never 0). */
export interface MonthlyRevenueTarget {
  /** 1–12. */
  month: number;
  amount: number | null;
}

/**
 * A year of company-wide revenue targets: always 12 months, January first.
 * Reading needs `VIEW_ALL_INVOICES` or `MANAGE_REVENUE_TARGETS`; a year never
 * set comes back as 12 nulls, not a 404.
 */
export interface RevenueTargets {
  year: number;
  months: MonthlyRevenueTarget[];
  /** Who last saved the year; null if never saved. */
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  /** Year of the first billed invoice; null with none yet. Targets can be set
   *  from it (this year when null) through next year. */
  firstInvoiceYear: number | null;
}

/** A PUT's 400: `field` is `months.<1-12>.amount`, `months` or `year`. */
export type RevenueTargetErrorCode =
  | 'TARGET_ZERO'
  | 'TARGET_NOT_POSITIVE'
  | 'TARGET_TOO_LARGE'
  | 'TARGET_TOO_PRECISE'
  | 'INVALID_MONTHS'
  | 'YEAR_OUT_OF_RANGE';

export const revenueTargetsApi = {
  get: async (year: number): Promise<RevenueTargets> => {
    const response = await apiClient.get<RevenueTargets>('/financial/revenue-targets', { params: { year } });
    return response.data;
  },

  /** Replaces the whole year (all 12 months; null clears one, all null clears
   *  the year). Needs `MANAGE_REVENUE_TARGETS`. Returns the year as saved. */
  replace: async (year: number, months: MonthlyRevenueTarget[]): Promise<RevenueTargets> => {
    const response = await apiClient.put<RevenueTargets>(`/financial/revenue-targets/${year}`, { months });
    return response.data;
  },
};

// Export combined API
export const financialApi = {
  invoices: invoicesApi,
  quotes: quotesApi,
  payments: paymentsApi,
  summary: financialSummaryApi,
  activity: financialActivityApi,
  dashboard: financialDashboardApi,
  revenueTargets: revenueTargetsApi,
};

export default financialApi;

/** A location's or customer's quotes and invoices, together. One of the two scopes is required; both means that customer at that site. */
export interface DocumentScope {
  serviceLocationId?: string;
  customerId?: string;
}

/**
 * `open`: draft and sent quotes, accepted ones with something left to invoice, and draft, sent and
 * overdue invoices. `all` and `invoice` leave out void and cancelled invoices.
 */
export type DocumentView = 'open' | 'all' | 'quote' | 'invoice';

export interface ListDocumentsParams extends DocumentScope {
  view?: DocumentView;
  /** Document number, a quote's title, or the work order number. */
  q?: string;
  /**
   * Open invoices (SENT, OVERDUE) by days past due, on top of `view` (send `view=invoice`). With
   * `customerId`, only invoices billed to that customer, so the total matches its AR-summary bucket.
   */
  agingBucket?: InvoiceAgingBucket;
  page?: number;
  size?: number; // ≤ 200
}

/** Each row embeds the same row the quotes or invoices list returns. Order is fixed: drafts first, then by document date, newest first. */
export type DocumentRow =
  | { kind: 'QUOTE'; id: string; quote: QuoteListItem }
  | { kind: 'INVOICE'; id: string; invoice: InvoiceListItemRow };

/**
 * Counts per view (each equals that view's `totalElements`) and the header figures, over the scope
 * alone. `openQuotes` is DRAFT and SENT; `due` is what SENT and OVERDUE invoices still owe, and
 * `overdue` the part of it past due.
 */
export interface DocumentViews {
  counts: Record<DocumentView, number>;
  openQuotes: { count: number; amount: number };
  due: number;
  overdue: number;
}

export const documentsApi = {
  list: async (params: ListDocumentsParams): Promise<FinancialPage<DocumentRow>> => {
    const response = await apiClient.get<FinancialPage<DocumentRow>>('/financial/documents', { params });
    return response.data;
  },

  getViews: async (scope: DocumentScope): Promise<DocumentViews> => {
    const response = await apiClient.get<DocumentViews>('/financial/documents/views', { params: scope });
    return response.data;
  },
};
