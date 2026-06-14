// Financial API Client
import apiClient from './client';

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

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
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
}

export interface Invoice {
  id: string;
  customerId: string;
  workOrderId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceLineItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceRequest {
  customerId: string;
  workOrderId?: string;
  invoiceDate: string;
  dueDate: string;
  taxRate: number;
  notes?: string;
  lineItems: CreateInvoiceLineItemRequest[];
}

export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
}

/**
 * Per-location billing rollup for the Location detail → Invoices tab header
 * strip (FIN-1). All money fields are decimals serialized as JSON numbers;
 * format client-side and key currency off the field rather than hardcoding.
 *
 *  - `billedYtd`  sum of totalAmount, calendar-year-to-date (resets Jan 1),
 *                 excluding DRAFT / VOID / CANCELLED. Server-computed — do NOT
 *                 re-derive from the list.
 *  - `openCount`  count of open invoices (status SENT or OVERDUE).
 *  - `openAmount` sum of totalAmount for those open invoices.
 *  - `aged91`     open amount past due > 90 days (dueDate < today − 90).
 *
 * serviceLocationId is derived server-side from each invoice's work order, so
 * an invoice with no work order (or whose WO has no service location) is absent
 * from both this summary and the location list — it shows only on customer-level
 * views.
 */
export interface LocationInvoiceSummaryResponse {
  billedYtd: number;
  openCount: number;
  openAmount: number;
  aged91: number;
  currency: string;
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
  lastSentToEmails: string;
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
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  overdue: boolean;
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Custom PageResponse envelope for the invoice list endpoints — NOT Spring's
// raw Page shape (the current index is `page`, not `number`).
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
  status?: InvoiceStatus;
  from?: string; // YYYY-MM-DD, invoiceDate >= from (inclusive)
  to?: string; // YYYY-MM-DD, invoiceDate <= to (inclusive — no +1-day trick)
  overdue?: boolean; // true = open + strictly past due
  q?: string; // case-insensitive substring on invoiceNumber OR customerName
  page?: number; // 0-indexed
  size?: number; // server-clamped to 1..200
  sort?: `${InvoiceSortField},${'asc' | 'desc'}`;
}

export const invoicesApi = {
  // Paged AR invoice list (lean rows). All filters AND together; `q` matches
  // invoice number or customer name. Returns the page envelope so callers can
  // drive a pager off totalElements / totalPages.
  getAll: async (params?: ListInvoicesParams): Promise<InvoiceListPage> => {
    const response = await apiClient.get<InvoiceListPage>('/financial/invoices', { params });
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
   * Per-location billing rollup (FIN-1) for the Invoices tab header strip. One
   * cheap call; independent of the list. See {@link LocationInvoiceSummaryResponse}.
   */
  getLocationSummary: async (
    serviceLocationId: string,
  ): Promise<LocationInvoiceSummaryResponse> => {
    const response = await apiClient.get<LocationInvoiceSummaryResponse>(
      '/financial/invoices/summary',
      { params: { serviceLocationId } },
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

  updateStatus: async (id: string, request: UpdateInvoiceStatusRequest): Promise<Invoice> => {
    const response = await apiClient.patch<Invoice>(`/financial/invoices/${id}/status`, request);
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
    recipientEmails?: string[],
  ): Promise<SendResponse> => {
    const body =
      recipientEmails && recipientEmails.length > 0
        ? { recipientEmails }
        : undefined;
    const response = await apiClient.post<SendResponse>(
      `/financial/invoices/${id}/send`,
      body,
    );
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

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  id: string;
  customerId: string;
  /** Optional WO link (Phase 7b backend ask #7). Older quotes have null. */
  workOrderId?: string;
  quoteNumber: string;
  status: QuoteStatus;
  quoteDate: string;
  expirationDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  lineItems: QuoteLineItem[];
  /** See `Invoice.lastSentAt` — same semantics. */
  lastSentAt?: string | null;
  /** See `Invoice.lastSentToEmails` — same semantics. */
  lastSentToEmails?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteLineItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateQuoteRequest {
  customerId: string;
  /** Optional WO link (Phase 7b backend ask #7). */
  workOrderId?: string;
  quoteDate: string;
  expirationDate: string;
  taxRate: number;
  notes?: string;
  lineItems: CreateQuoteLineItemRequest[];
}

export interface UpdateQuoteStatusRequest {
  status: QuoteStatus;
}

export const quotesApi = {
  getAll: async (): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>('/financial/quotes');
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

  updateStatus: async (id: string, request: UpdateQuoteStatusRequest): Promise<Quote> => {
    const response = await apiClient.patch<Quote>(`/financial/quotes/${id}/status`, request);
    return response.data;
  },

  /** See `invoicesApi.send` — same contract, quote-scoped. */
  send: async (
    id: string,
    recipientEmails?: string[],
  ): Promise<SendResponse> => {
    const body =
      recipientEmails && recipientEmails.length > 0
        ? { recipientEmails }
        : undefined;
    const response = await apiClient.post<SendResponse>(
      `/financial/quotes/${id}/send`,
      body,
    );
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

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  getAll: async (): Promise<Payment[]> => {
    const response = await apiClient.get<Payment[]>('/financial/payments');
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
export interface WorkOrderFinancialSummary {
  invoiced: string;
  /**
   * Optional. Sum of non-DECLINED, non-EXPIRED quote totals for the WO
   * (Phase 7b backend ask #9). Always returned on tenants where 7b has
   * shipped; typed optional so the field can roll out additively
   * without breaking the chip-row code path during transition.
   */
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

// ========== LOCATION FINANCIAL ACTIVITY ==========

export type FinancialActivityKind = 'INVOICE_SENT' | 'INVOICE_PAID';

/**
 * A money milestone at a service location (invoice sent / paid). Standalone
 * customer payments aren't here by design — INVOICE_PAID carries the location
 * side. `workOrderId` (when present) groups the row under its work order; a
 * null actor (or null userName) means a historical/system row → gear glyph.
 * `amount` is a decimal string from the backend.
 */
export interface FinancialActivityEvent {
  id: string;
  kind: FinancialActivityKind;
  invoiceId: string;
  invoiceNumber: string;
  workOrderId: string | null;
  // Non-null on the location feed; the customer feed (getForCustomer) may return
  // null for a customer-level invoice with no site. Row rendering keys off
  // workOrderId, not this, so null is safe.
  serviceLocationId: string | null;
  amount: string;
  actor: { userId: string; userName: string | null } | null;
  timestamp: string;
}

export const financialActivityApi = {
  /** Location-scoped financial milestones, newest-first. Fetched whole (no
   * cursor); `limit` defaults to 100 server-side, max 500. */
  getForLocation: async (
    serviceLocationId: string,
    limit?: number,
  ): Promise<FinancialActivityEvent[]> => {
    const response = await apiClient.get<FinancialActivityEvent[]>(
      `/financial/locations/${serviceLocationId}/activity`,
      { params: { limit } },
    );
    return response.data;
  },

  /** Customer-scoped financial milestones (ACT-1), newest-first. Same row shape
   * as {@link getForLocation} (interleaved with the WO activity stream), except
   * `serviceLocationId` may be null for customer-level invoices with no site.
   * Fetched whole; `limit` defaults to 100 server-side, max 500. */
  getForCustomer: async (
    customerId: string,
    limit?: number,
  ): Promise<FinancialActivityEvent[]> => {
    const response = await apiClient.get<FinancialActivityEvent[]>(
      `/financial/customers/${customerId}/activity`,
      { params: { limit } },
    );
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
};

export default financialApi;
