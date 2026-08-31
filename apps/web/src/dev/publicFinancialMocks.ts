// Local dev-only fixtures for the customer-facing public invoice / quote
// pages. The public `/p/*` routes short-circuit to these fixtures when
// the share token starts with `preview-`, letting us preview every
// status / branding variant in the browser without a backend round-trip.
//
// `publicFinancialApi` only consults this module when
// `import.meta.env.DEV` is true; the entire module gets dead-code-
// eliminated in production builds (Vite resolves `import.meta.env.DEV`
// to a literal `false`), so it's safe to keep in `main`.

import type {
  PublicInvoiceResponse,
  PublicQuoteResponse,
  PublicTenantBranding,
  PublicCustomerSummary,
  PublicLineItem,
  PublicPayment,
  PublicInvoiceData,
  PublicQuoteData,
} from '../api/setup';

const TENANT: PublicTenantBranding = {
  displayName: 'Acme HVAC',
  companySlogan: 'Heating & cooling since 1987',
  logoUrl: null,
  streetAddress: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  supportEmail: 'support@acmehvac.example',
  supportPhone: '(555) 123-4567',
};

const TENANT_NO_BRANDING: PublicTenantBranding = {
  displayName: null,
  companySlogan: null,
  logoUrl: null,
  streetAddress: null,
  city: null,
  state: null,
  zipCode: null,
  supportEmail: null,
  supportPhone: null,
};

const CUSTOMER: PublicCustomerSummary = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Jane Smith',
};

const BASE_INVOICE_LINE_ITEMS: PublicLineItem[] = [
  {
    description: 'Semi-annual HVAC system tune-up',
    quantity: '1.00',
    unitPrice: '189.00',
    lineTotal: '189.00',
  },
  {
    description: 'Air filter replacement (16x25x1)',
    quantity: '2.00',
    unitPrice: '24.50',
    lineTotal: '49.00',
  },
  {
    description: 'Condenser coil cleaning',
    quantity: '1.00',
    unitPrice: '85.00',
    lineTotal: '85.00',
  },
];

const BASE_INVOICE: PublicInvoiceData = {
  invoiceNumber: 'INV-2026-0042',
  status: 'SENT',
  invoiceDate: '2026-05-01',
  dueDate: '2026-05-31',
  subtotal: '323.00',
  taxRate: '8.00',
  taxAmount: '25.84',
  totalAmount: '348.84',
  amountPaid: '0.00',
  balanceDue: '348.84',
  notes:
    'Thanks for choosing Acme HVAC. Please reach out with any questions before paying.',
  lineItems: BASE_INVOICE_LINE_ITEMS,
  payments: [],
};

const PAID_PAYMENT: PublicPayment = {
  paymentDate: '2026-05-08',
  amount: '348.84',
  method: 'CHECK',
  status: 'RECEIVED',
};

const PARTIAL_PAYMENT: PublicPayment = {
  paymentDate: '2026-05-08',
  amount: '150.00',
  method: 'CREDIT_CARD',
  status: 'RECEIVED',
};

const VOIDED_PAYMENT: PublicPayment = {
  paymentDate: '2026-05-05',
  amount: '50.00',
  method: 'CASH',
  status: 'VOID',
};

const invoiceVariants: Record<string, PublicInvoiceResponse> = {
  outstanding: { invoice: BASE_INVOICE, tenant: TENANT, customer: CUSTOMER },
  overdue: {
    invoice: {
      ...BASE_INVOICE,
      status: 'OVERDUE',
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
    },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  'partially-paid': {
    invoice: {
      ...BASE_INVOICE,
      status: 'PARTIALLY_PAID',
      amountPaid: '150.00',
      balanceDue: '198.84',
      payments: [PARTIAL_PAYMENT, VOIDED_PAYMENT],
    },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  paid: {
    invoice: {
      ...BASE_INVOICE,
      status: 'PAID',
      amountPaid: '348.84',
      balanceDue: '0.00',
      payments: [PAID_PAYMENT],
    },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  void: {
    invoice: { ...BASE_INVOICE, status: 'VOID' },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  // Tenant address present but other branding fields missing.
  'no-address': {
    invoice: BASE_INVOICE,
    tenant: {
      ...TENANT,
      streetAddress: null,
      city: null,
      state: null,
      zipCode: null,
    },
    customer: CUSTOMER,
  },
  // Tenant has configured nothing — every branding field null. Document
  // body still renders; sender header collapses entirely.
  'no-branding': {
    invoice: BASE_INVOICE,
    tenant: TENANT_NO_BRANDING,
    customer: CUSTOMER,
  },
};

const BASE_QUOTE_LINE_ITEMS: PublicLineItem[] = [
  {
    description: 'Replace 3-ton outdoor condenser unit',
    quantity: '1.00',
    unitPrice: '4250.00',
    lineTotal: '4250.00',
  },
  {
    description: 'Refrigerant line set + insulation',
    quantity: '1.00',
    unitPrice: '380.00',
    lineTotal: '380.00',
  },
  {
    description: 'Disposal of old unit',
    quantity: '1.00',
    unitPrice: '75.00',
    lineTotal: '75.00',
  },
];

const BASE_QUOTE: PublicQuoteData = {
  quoteNumber: 'QTE-2026-0017',
  status: 'SENT',
  quoteDate: '2026-05-01',
  expirationDate: '2026-06-01',
  subtotal: '4705.00',
  taxRate: '8.00',
  taxAmount: '376.40',
  totalAmount: '5081.40',
  notes:
    'Estimate valid for 30 days. Includes parts, labor, and disposal. Call us if you have any questions.',
  lineItems: BASE_QUOTE_LINE_ITEMS,
};

const quoteVariants: Record<string, PublicQuoteResponse> = {
  pending: { quote: BASE_QUOTE, tenant: TENANT, customer: CUSTOMER },
  accepted: {
    quote: { ...BASE_QUOTE, status: 'ACCEPTED' },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  rejected: {
    quote: { ...BASE_QUOTE, status: 'REJECTED' },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  cancelled: {
    quote: { ...BASE_QUOTE, status: 'CANCELLED' },
    tenant: TENANT,
    customer: CUSTOMER,
  },
  expired: {
    quote: {
      ...BASE_QUOTE,
      status: 'EXPIRED',
      quoteDate: '2026-02-15',
      expirationDate: '2026-03-15',
    },
    tenant: TENANT,
    customer: CUSTOMER,
  },
};

/**
 * Token format: `preview-<variant>`. Examples:
 *   /p/invoice/preview-outstanding
 *   /p/invoice/preview-overdue
 *   /p/invoice/preview-partially-paid
 *   /p/invoice/preview-paid
 *   /p/invoice/preview-void
 *   /p/invoice/preview-no-address
 *   /p/invoice/preview-no-branding
 *
 *   /p/quote/preview-pending
 *   /p/quote/preview-accepted
 *   /p/quote/preview-rejected
 *   /p/quote/preview-cancelled
 *   /p/quote/preview-expired
 *
 * Returns `null` (not a 404 throw) when the variant is unknown — caller
 * falls through to the real API path, which 404s on a bogus token and
 * the cliff page renders. Useful for testing the cliff path too.
 */
export const previewInvoice = (token: string): PublicInvoiceResponse | null => {
  const variant = token.slice('preview-'.length);
  return invoiceVariants[variant] ?? null;
};

export const previewQuote = (token: string): PublicQuoteResponse | null => {
  const variant = token.slice('preview-'.length);
  return quoteVariants[variant] ?? null;
};
