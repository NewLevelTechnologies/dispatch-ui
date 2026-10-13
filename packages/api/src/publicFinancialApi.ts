// Public Financial API — share-link-authed endpoints
//
// Customer-facing read-only access to a single invoice or quote via an
// opaque share token. The token is the auth; no JWT, no tenant header.
// See `docs/PHASE_7_INVOICE_SEND.md` §4.4 for the contract.
//
// On the wire, the token rides in the `X-Share-Token` request header
// rather than the URL path so it doesn't land in ALB / CloudFront /
// financial-service access logs (§4.4 rationale + §8 security checklist).
// The URL path that the customer actually clicks (`/p/invoice/:token`)
// is an SPA route — the token is read from `useParams()` and forwarded
// to this API call as a header.
//
// Public types are intentionally narrower than the internal `Invoice` /
// `Quote` shapes. The wire response carries only the fields a customer
// is allowed to see: no internal ids on line items, no payment numbers
// or audit timestamps, no `customerId` / `workOrderId` foreign keys,
// no `lastSentAt` / `lastSentToEmails` mail-routing metadata. Defining
// these locally means any future leakage requires a deliberate type
// change here, not an accidental inclusion of an internal field.
//
// BigDecimal money fields are serialized as strings to preserve
// precision across the wire. The display layer calls `Number(...)` /
// `formatMoney(...)` at render time; never sum these as strings.

import publicApiClient from './publicClient';

export type PublicInvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID'
  | 'CANCELLED';

export type PublicQuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  // Older values; the server no longer sends them.
  | 'REJECTED'
  | 'CANCELLED';

export type PublicPaymentMethod =
  | 'CASH'
  | 'CHECK'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'ACH'
  | 'WIRE_TRANSFER'
  | 'OTHER';

/**
 * `RECEIVED` rows count toward `amountPaid`; `VOID` rows do not, but are
 * still included in the array for audit transparency. Render voided rows
 * muted so the customer sees the history without confusion about totals.
 */
export type PublicPaymentStatus = 'RECEIVED' | 'VOID';

export type PublicAdjustmentKind = 'PERCENT' | 'AMOUNT' | 'WAIVE';

export type PublicAdjustmentReason =
  | 'MEMBER'
  | 'REPAIR_APPROVED'
  | 'GOODWILL'
  | 'PROMOTION'
  | 'INCENTIVE'
  | 'DISCRETIONARY'
  | 'OTHER';

/** A discount or waive as the customer sees it; the page words it from `reasonCode`. */
export interface PublicAdjustment {
  kind: PublicAdjustmentKind;
  reasonCode: PublicAdjustmentReason;
  /** PERCENT: a fraction. AMOUNT: dollars. WAIVE: null. */
  value: string | null;
  /** What it saved. */
  amount: string;
}

export interface PublicLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  /** The list amount; struck through when `adjustmentAmount` is above zero. */
  lineTotal: string;
  /** The saving on the line, its share of document discounts included. Absent on older documents. */
  adjustmentAmount?: string | null;
  /** What the line comes to after the saving. */
  netAmount?: string | null;
  /** The line's own discounts and waives. */
  adjustments?: PublicAdjustment[];
}

/** Savings and tax context both public documents carry. Absent on older documents. */
export interface PublicPricing {
  /** List total before savings. */
  grossSubtotal?: string | null;
  /** Everything saved ("You save $X"). */
  adjustmentTotal?: string | null;
  /** Discounts on the whole document. */
  documentAdjustments?: PublicAdjustment[];
  taxJurisdictionName?: string | null;
  taxExempt?: boolean;
}

export interface PublicPayment {
  paymentDate: string;
  amount: string;
  method: PublicPaymentMethod;
  status: PublicPaymentStatus;
}

export interface PublicInvoiceData extends PublicPricing {
  invoiceNumber: string;
  status: PublicInvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  lineItems: PublicLineItem[];
  /** Server-sorted newest-first by paymentDate; may be empty. */
  payments: PublicPayment[];
}

export interface PublicQuoteData extends PublicPricing {
  quoteNumber: string;
  status: PublicQuoteStatus;
  quoteDate: string;
  expirationDate: string;
  /** Echo back on approve; a newer revision returns 409 QUOTE_REVISION_STALE. */
  revision?: number;
  /**
   * True while the office revises a sent quote: the money fields are null and
   * `lineItems` is empty until it's re-sent. Show "being updated", no approve.
   */
  beingUpdated?: boolean;
  /** Null while `beingUpdated`. */
  subtotal: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  notes: string | null;
  lineItems: PublicLineItem[];
}

/**
 * Tenant branding fields the public page needs to render a sender block.
 * Every field is nullable: tenants that haven't configured branding still
 * get a working public page — the header collapses to just the document
 * body when nothing is set.
 */
export interface PublicTenantBranding {
  displayName: string | null;
  companySlogan: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  logoUrl: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/**
 * Bill-to / quote-recipient customer fields exposed publicly. Intentionally
 * narrow — the public page shows "Billed to: {name}" and nothing else
 * about the customer record. No email / phone / address leakage. `id` is
 * present on the wire but must NOT be rendered to the page.
 */
export interface PublicCustomerSummary {
  id: string;
  name: string;
}

export interface PublicInvoiceResponse {
  invoice: PublicInvoiceData;
  tenant: PublicTenantBranding;
  customer: PublicCustomerSummary;
}

export interface PublicQuoteResponse {
  quote: PublicQuoteData;
  tenant: PublicTenantBranding;
  customer: PublicCustomerSummary;
}

const tokenHeaders = (token: string, signal?: AbortSignal) => ({
  headers: { 'X-Share-Token': token },
  signal,
});

export const publicFinancialApi = {
  getInvoiceByToken: async (
    token: string,
    signal?: AbortSignal,
  ): Promise<PublicInvoiceResponse> => {
    // Dev-only mocks removed from shared package
    // If needed, implement platform-specific mock logic in the app
    const response = await publicApiClient.get<PublicInvoiceResponse>(
      '/public/invoices',
      tokenHeaders(token, signal),
    );
    return response.data;
  },

  getQuoteByToken: async (
    token: string,
    signal?: AbortSignal,
  ): Promise<PublicQuoteResponse> => {
    // Dev-only mocks removed from shared package
    const response = await publicApiClient.get<PublicQuoteResponse>(
      '/public/quotes',
      tokenHeaders(token, signal),
    );
    return response.data;
  },

  /**
   * The customer approves the revision they're looking at. Returns the
   * quote, now ACCEPTED. 409 `QUOTE_REVISION_STALE`: it was revised since
   * the page loaded, reload it. 409 `QUOTE_NOT_APPROVABLE`: it's no longer
   * waiting on the customer.
   */
  approveQuote: async (token: string, revision: number | undefined): Promise<PublicQuoteResponse> => {
    const response = await publicApiClient.post<PublicQuoteResponse>(
      '/public/quotes/approve',
      { revision },
      tokenHeaders(token),
    );
    return response.data;
  },
};

export default publicFinancialApi;
