import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoicesApi, quotesApi, financialActivityApi, financialDashboardApi, revenueTargetsApi,
  revenueReportApi, receivablesReportApi, quoteReportApi, paymentReportApi, paymentsApi, taxApi, laborRatesApi } from './financialApi';
import apiClient from './client';

vi.mock('./client');

const okSendResponse = {
  data: {
    notificationId: 'n-1',
    queuedAt: '2026-05-16T10:00:00Z',
    shareUrl: 'https://app.example/p/invoice/abc',
    lastSentToEmails: 'alice@example.com',
  },
};

describe('invoicesApi.send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue(okSendResponse);
  });

  it('POSTs with no body when called without recipientEmails (default-resolver path)', async () => {
    await invoicesApi.send('inv-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/inv-1/send',
      undefined,
    );
  });

  it('POSTs the recipientEmails array as body when an override list is provided', async () => {
    await invoicesApi.send('inv-1', ['alice@example.com', 'bob@example.com']);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/inv-1/send',
      { recipientEmails: ['alice@example.com', 'bob@example.com'] },
    );
  });

  it('omits the body when given an empty array (does NOT send recipientEmails: [])', async () => {
    // Empty array must collapse to "no body" so the backend resolver runs.
    // Sending { recipientEmails: [] } would be interpreted as an explicit
    // zero-recipient override and 422 NO_RECIPIENT.
    await invoicesApi.send('inv-1', []);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/inv-1/send',
      undefined,
    );
  });
});

describe('quotesApi.send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue(okSendResponse);
  });

  it('POSTs with no body when called without recipientEmails', async () => {
    await quotesApi.send('q-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/quotes/q-1/send',
      undefined,
    );
  });

  it('POSTs the recipientEmails array as body when an override list is provided', async () => {
    await quotesApi.send('q-1', ['alice@example.com']);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/quotes/q-1/send',
      { recipientEmails: ['alice@example.com'] },
    );
  });

  it('omits the body when given an empty array', async () => {
    await quotesApi.send('q-1', []);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/quotes/q-1/send',
      undefined,
    );
  });
});

describe('invoicesApi.getCustomerArSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the customer AR summary (FIN-1) and returns it', async () => {
    const summary = {
      outstandingBalance: 385,
      current: { amount: 100, count: 1 },
      days1To30: { amount: 50, count: 1 },
      days31To60: { amount: 25, count: 1 },
      days61To90: { amount: 0, count: 0 },
      days91Plus: { amount: 210, count: 2 },
      oldestPastDueInvoiceId: 'inv-9',
      oldestPastDueInvoiceDate: '2026-02-01',
      lifetimeValue: 12500,
      mostUsedPaymentMethod: 'CHECK',
      currency: 'USD',
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: summary });
    const out = await invoicesApi.getCustomerArSummary('cust-1');
    expect(apiClient.get).toHaveBeenCalledWith('/financial/customers/cust-1/ar-summary');
    expect(out).toEqual(summary);
  });
});

describe('financialActivityApi.getForCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const row = { id: 'f1', kind: 'INVOICE_PAID', invoiceId: 'i1', invoiceNumber: 'INV-1', workOrderId: null, serviceLocationId: null, amount: 250.0, actor: null, timestamp: '2026-06-14T15:00:00Z' };

  it('GETs the cursor-paginated customer financial stream (ACT-1) and passes the envelope through', async () => {
    const page = { content: [row], nextCursor: 'c1', hasMore: true };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    const out = await financialActivityApi.getForCustomer('cust-1', { cursor: 'c0', limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/customers/cust-1/activity', {
      params: { cursor: 'c0', limit: 50 },
    });
    expect(out).toEqual(page);
  });

  it('tolerates the pre-cursor bare-array shape (deploy window) by wrapping it as a final page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [row] });
    const out = await financialActivityApi.getForCustomer('cust-1');
    expect(out).toEqual({ content: [row], nextCursor: null, hasMore: false });
  });
});

describe('financialActivityApi.getForLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const row = { id: 'f1', kind: 'INVOICE_SENT', invoiceId: 'i1', invoiceNumber: 'INV-1', workOrderId: null, serviceLocationId: 'sl-1', amount: 50.0, actor: null, timestamp: '2026-06-14T15:00:00Z' };

  it('GETs the cursor-paginated location financial stream and passes the envelope through', async () => {
    const page = { content: [row], nextCursor: 'c1', hasMore: true };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    const out = await financialActivityApi.getForLocation('sl-1', { cursor: 'c0', limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/locations/sl-1/activity', {
      params: { cursor: 'c0', limit: 50 },
    });
    expect(out).toEqual(page);
  });

  it('tolerates the pre-cursor bare-array shape by wrapping it as a final page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [row] });
    const out = await financialActivityApi.getForLocation('sl-1');
    expect(out).toEqual({ content: [row], nextCursor: null, hasMore: false });
  });
});

describe('financialActivityApi.getForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the tenant-wide financial stream, passing cursor params through', async () => {
    const page = { content: [], nextCursor: null, hasMore: false };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    const out = await financialActivityApi.getForTenant({ cursor: 'c0', limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/activity', { params: { cursor: 'c0', limit: 20 } });
    expect(out).toEqual(page);
  });

  it('narrows to regions when asked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], nextCursor: null, hasMore: false } });
    await financialActivityApi.getForTenant({ limit: 9, regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/activity', { params: { limit: 9, regionIds: ['r1'] } });
  });
});

describe('financialDashboardApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { currency: 'USD' } });
  });

  it.each([
    ['getAttention', '/financial/dashboard/attention'],
    ['getRevenue', '/financial/dashboard/revenue'],
    ['getReceivables', '/financial/dashboard/receivables'],
    ['getQuotes', '/financial/dashboard/quotes'],
  ] as const)('%s GETs %s', async (fn, path) => {
    const out = await financialDashboardApi[fn]();
    expect(apiClient.get).toHaveBeenCalledWith(path);
    expect(out).toEqual({ currency: 'USD' });
  });

  it('getRevenue passes a reporting period through', async () => {
    await financialDashboardApi.getRevenue({ period: '2026-YTD' });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/dashboard/revenue', { params: { period: '2026-YTD' } });
  });

  it('passes a region scope and drops an empty one', async () => {
    await financialDashboardApi.getRevenue({ period: '2026-Q3', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/dashboard/revenue', {
      params: { period: '2026-Q3', regionIds: ['r1'] },
    });
    await financialDashboardApi.getReceivables({ regionIds: ['r1', 'r2'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/dashboard/receivables', {
      params: { regionIds: ['r1', 'r2'] },
    });
    await financialDashboardApi.getQuotes({ regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/dashboard/quotes');
  });
});

describe('revenueReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report, dropping an empty region scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { billed: 1 } });
    await revenueReportApi.get({ from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'division', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/revenue', {
      params: { from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'division' },
    });
    await revenueReportApi.get({ from: '2026-09-01', to: '2026-09-30', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/revenue', {
      params: { from: '2026-09-01', to: '2026-09-30', regionIds: ['r1'] },
    });
  });
});

describe('receivablesReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report as of a date, dropping an empty scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { outstanding: 1 } });
    await receivablesReportApi.get({ asOf: '2026-09-30', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/receivables', { params: { asOf: '2026-09-30' } });
    await receivablesReportApi.get({ regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/receivables', { params: { regionIds: ['r1'] } });
  });
});

describe('revenueTargetsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs a year by query param', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { year: 2026 } });
    await revenueTargetsApi.get(2026);
    expect(apiClient.get).toHaveBeenCalledWith('/financial/revenue-targets', { params: { year: 2026 } });
  });

  it('PUTs all twelve months for the year, nulls included', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { year: 2027 } });
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: i === 0 ? 150000 : null }));
    await revenueTargetsApi.replace(2027, months);
    expect(apiClient.put).toHaveBeenCalledWith('/financial/revenue-targets/2027', { months });
  });
});

describe('quoteReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report with its grouping and scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await quoteReportApi.get({ from: '2026-09-01', to: '2026-09-30', compare: 'none', groupBy: 'sender', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/quotes', {
      params: { from: '2026-09-01', to: '2026-09-30', compare: 'none', groupBy: 'sender', regionIds: ['r1'] },
    });
  });

  it('quotesApi.getAll sends the sender and joins statuses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await quotesApi.getAll({ firstSentFrom: '2026-09-01', sentByUserId: 'u1', status: ['ACCEPTED', 'DECLINED'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/quotes', {
      params: { firstSentFrom: '2026-09-01', sentByUserId: 'u1', status: 'ACCEPTED,DECLINED' },
    });
  });
});

describe('paymentReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report, dropping an empty scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await paymentReportApi.get({ from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'day', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/payments', {
      params: { from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'day' },
    });
  });
});

describe('document edit routes (Pricebook Phase 1)', () => {
  const doc = { data: { id: 'q-1', version: 4 } };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue(doc);
    vi.mocked(apiClient.put).mockResolvedValue(doc);
    vi.mocked(apiClient.delete).mockResolvedValue(doc);
    vi.mocked(apiClient.get).mockResolvedValue(doc);
  });

  it('adds and replaces lines with the version in the body', async () => {
    await quotesApi.addLine('q-1', { version: 3, itemId: 'it-1', quantity: 2 });
    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/lines', { version: 3, itemId: 'it-1', quantity: 2 });

    await invoicesApi.updateLine('inv-1', 'l-1', { version: 3, type: 'MATERIAL', description: 'Cap', quantity: 1, unitPrice: 48 });
    expect(apiClient.put).toHaveBeenCalledWith('/financial/invoices/inv-1/lines/l-1', {
      version: 3,
      type: 'MATERIAL',
      description: 'Cap',
      quantity: 1,
      unitPrice: 48,
    });
  });

  it('sends the version as a query param on deletes', async () => {
    await quotesApi.deleteLine('q-1', 'l-1', 5);
    expect(apiClient.delete).toHaveBeenCalledWith('/financial/quotes/q-1/lines/l-1', { params: { version: 5 } });

    await invoicesApi.deleteAdjustment('inv-1', 'a-1', 6);
    expect(apiClient.delete).toHaveBeenCalledWith('/financial/invoices/inv-1/adjustments/a-1', { params: { version: 6 } });
  });

  it('reorders, adjusts, and replaces the header on the documented routes', async () => {
    await quotesApi.reorderLines('q-1', { version: 2, lineIds: ['b', 'a'] });
    expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/lines/order', { version: 2, lineIds: ['b', 'a'] });

    await invoicesApi.addAdjustment('inv-1', { version: 2, kind: 'PERCENT', value: 0.1, reasonCode: 'GOODWILL' });
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-1/adjustments', {
      version: 2,
      kind: 'PERCENT',
      value: 0.1,
      reasonCode: 'GOODWILL',
    });

    const header = { version: 2, quoteDate: '2026-10-12', expirationDate: '2026-11-11', serviceLocationId: null, customerPoNumber: null, notes: null };
    await quotesApi.updateHeader('q-1', header);
    expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/header', header);
  });

  it('duplicates a quote, reads what is left to bill, and bills it', async () => {
    await quotesApi.duplicate('q-1');
    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/duplicate');

    await quotesApi.getInvoiceable('q-1');
    expect(apiClient.get).toHaveBeenCalledWith('/financial/quotes/q-1/invoiceable');

    const request = { quoteId: 'q-1', lines: [{ quoteLineId: 'l-1', quantity: 1 }], invoiceDate: '2026-10-12', dueDate: '2026-11-11' };
    await invoicesApi.createFromQuote(request);
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/from-quote', request);
  });

  it('reissues an invoice and applies freed credit to the copy', async () => {
    await invoicesApi.reissue('inv-1');
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-1/reissue');

    await paymentsApi.apply('p-1', [{ invoiceId: 'inv-2', amountApplied: 500 }]);
    expect(apiClient.post).toHaveBeenCalledWith('/financial/payments/p-1/applications', {
      applications: [{ invoiceId: 'inv-2', amountApplied: 500 }],
    });
  });
});

describe('taxApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
  });

  it('clears a location assignment with an explicit null', async () => {
    await taxApi.setLocationJurisdiction('loc-1', null);
    expect(apiClient.put).toHaveBeenCalledWith('/financial/service-locations/loc-1/tax-jurisdiction', { taxJurisdictionId: null });
  });

  it('sets the agreement fee tax class', async () => {
    await taxApi.updatePricingSettings('FEE');
    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE' });
  });
});

describe('laborRatesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
  });

  it('replaces the whole rate type', async () => {
    const request = { name: 'Emergency', billRate: 195, costRate: null, sortOrder: 4, active: true };
    await laborRatesApi.update('r-5', request);
    expect(apiClient.put).toHaveBeenCalledWith('/financial/labor-rates/r-5', request);
  });

  it('reorders with the full list of ids', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    await laborRatesApi.reorder(['r-2', 'r-1']);
    expect(apiClient.post).toHaveBeenCalledWith('/financial/labor-rates/reorder', { orderedIds: ['r-2', 'r-1'] });
  });
});
