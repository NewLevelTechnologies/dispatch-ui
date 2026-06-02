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
  | 'REJECTED'
  | 'EXPIRED'
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

export interface PublicLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PublicPayment {
  paymentDate: string;
  amount: string;
  method: PublicPaymentMethod;
  status: PublicPaymentStatus;
}

export interface PublicInvoiceData {
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

export interface PublicQuoteData {
  quoteNumber: string;
  status: PublicQuoteStatus;
  quoteDate: string;
  expirationDate: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
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

const PREVIEW_TOKEN_PREFIX = 'preview-';

export const publicFinancialApi = {
  getInvoiceByToken: async (
    token: string,
    signal?: AbortSignal,
  ): Promise<PublicInvoiceResponse> => {
    // Dev-only short-circuit so the page can be previewed in the browser
    // without a real backend token. `import.meta.env.DEV` is replaced with
    // a literal `false` at production build time, so this branch and the
    // entire dev mocks module get dead-code-eliminated.
    if (import.meta.env.DEV && token.startsWith(PREVIEW_TOKEN_PREFIX)) {
      const { previewInvoice } = await import('../dev/publicFinancialMocks');
      const mock = previewInvoice(token);
      if (mock) return mock;
      // Unknown preview variant → fall through to the real API call, which
      // 404s and surfaces the cliff page. Lets us preview the cliff too.
    }
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
    if (import.meta.env.DEV && token.startsWith(PREVIEW_TOKEN_PREFIX)) {
      const { previewQuote } = await import('../dev/publicFinancialMocks');
      const mock = previewQuote(token);
      if (mock) return mock;
    }
    const response = await publicApiClient.get<PublicQuoteResponse>(
      '/public/quotes',
      tokenHeaders(token, signal),
    );
    return response.data;
  },
};

export default publicFinancialApi;
