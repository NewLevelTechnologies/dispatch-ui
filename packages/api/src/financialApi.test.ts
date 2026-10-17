import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoicesApi, quotesApi, financialActivityApi, financialDashboardApi, revenueTargetsApi,
  revenueReportApi, receivablesReportApi, quoteReportApi, paymentReportApi, discountReportApi, salesTaxReportApi, unbilledReportApi, quoteLineBillingApi, paymentsApi, taxApi, laborRatesApi, pricebookApi, ratePlansApi, mediaApi } from './financialApi';
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
    await invoicesApi.send('inv-1', { recipientEmails: ['alice@example.com', 'bob@example.com'] });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/inv-1/send',
      { recipientEmails: ['alice@example.com', 'bob@example.com'] },
    );
  });

  it('omits the body when given an empty array (does NOT send recipientEmails: [])', async () => {
    // Empty array must collapse to "no body" so the backend resolver runs.
    // Sending { recipientEmails: [] } would be interpreted as an explicit
    // zero-recipient override and 422 NO_RECIPIENT.
    await invoicesApi.send('inv-1', { recipientEmails: [] });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/inv-1/send',
      undefined,
    );
  });
});

describe('send phones, message and preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue(okSendResponse);
  });

  it('sends phones and a message, and drops a blank message and empty lists', async () => {
    await invoicesApi.send('inv-1', { recipientPhones: ['(602) 555-0182'], message: 'Hi\n\n{{link}}', dueDate: '2026-11-30' });
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-1/send', {
      recipientPhones: ['(602) 555-0182'],
      message: 'Hi\n\n{{link}}',
      dueDate: '2026-11-30',
    });
    await quotesApi.send('q-1', { recipientEmails: [], recipientPhones: [], message: '   ' });
    expect(apiClient.post).toHaveBeenLastCalledWith('/financial/quotes/q-1/send', undefined);
  });

  it('passes the date override to the send preview', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await quotesApi.sendPreview('q-1', '2026-12-01');
    expect(apiClient.get).toHaveBeenCalledWith('/financial/quotes/q-1/send-preview', { params: { expirationDate: '2026-12-01' } });
    await invoicesApi.sendPreview('inv-1');
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/invoices/inv-1/send-preview', { params: {} });
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
    await quotesApi.send('q-1', { recipientEmails: ['alice@example.com'] });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/quotes/q-1/send',
      { recipientEmails: ['alice@example.com'] },
    );
  });

  it('omits the body when given an empty array', async () => {
    await quotesApi.send('q-1', { recipientEmails: [] });
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

  const row = {
    id: 'f1',
    kind: 'INVOICE_PAID',
    category: 'FINANCIAL',
    timestamp: '2026-06-14T15:00:00Z',
    subject: { type: 'INVOICE', id: 'i1', number: null, label: 'INV-1' },
    actor: null,
    workOrderId: null,
    serviceLocationId: null,
    data: { totalAmount: 250 },
  };

  it('GETs the cursor-paginated customer financial stream (ACT-1) and passes the envelope through', async () => {
    const page = { content: [row], nextCursor: 'c1', hasMore: true };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    const out = await financialActivityApi.getForCustomer('cust-1', { cursor: 'c0', limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/customers/cust-1/activity', {
      params: { cursor: 'c0', limit: 50 },
    });
    expect(out).toEqual(page);
  });

  it('narrows by kind on the server', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], nextCursor: null, hasMore: false } });
    await financialActivityApi.getForCustomer('cust-1', { kinds: ['PAYMENT_RECEIVED', 'INVOICE_PAID'] });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/customers/cust-1/activity', {
      params: { kinds: 'PAYMENT_RECEIVED,INVOICE_PAID' },
    });
  });
});

describe('financialActivityApi.getForLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const row = {
    id: 'f1',
    kind: 'INVOICE_SENT',
    category: 'FINANCIAL',
    timestamp: '2026-06-14T15:00:00Z',
    subject: { type: 'INVOICE', id: 'i1', number: null, label: 'INV-1' },
    actor: null,
    workOrderId: null,
    serviceLocationId: 'sl-1',
    data: { totalAmount: 50, channels: ['EMAIL'] },
  };

  it('GETs the cursor-paginated location financial stream and passes the envelope through', async () => {
    const page = { content: [row], nextCursor: 'c1', hasMore: true };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    const out = await financialActivityApi.getForLocation('sl-1', { cursor: 'c0', limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/locations/sl-1/activity', {
      params: { cursor: 'c0', limit: 50 },
    });
    expect(out).toEqual(page);
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
    await financialActivityApi.getForTenant({ limit: 9, regionIds: ['r1'], kinds: ['INVOICE_SENT', 'INVOICE_PAID'] });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/activity', {
      params: { limit: 9, kinds: 'INVOICE_SENT,INVOICE_PAID', regionIds: ['r1'] },
    });
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

describe('discountReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report, dropping an empty scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await discountReportApi.get({ from: '2026-09-01', to: '2026-09-30', member: 'exclude', groupBy: 'givenBy', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/discounts', {
      params: { from: '2026-09-01', to: '2026-09-30', member: 'exclude', groupBy: 'givenBy' },
    });
  });

  it('GETs one group\'s rows and the CSV as a blob', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await discountReportApi.rows({ from: '2026-09-01', to: '2026-09-30', groupBy: 'reason', groupKey: 'FEE_WAIVED', page: 1, size: 25, regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/discounts/rows', {
      params: { from: '2026-09-01', to: '2026-09-30', groupBy: 'reason', groupKey: 'FEE_WAIVED', page: 1, size: 25, regionIds: ['r1'] },
    });
    await discountReportApi.exportCsv({ from: '2026-09-01', to: '2026-09-30', member: 'include' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/discounts/export.csv', {
      params: { from: '2026-09-01', to: '2026-09-30', member: 'include' },
      responseType: 'blob',
    });
  });
});

describe('salesTaxReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report and the CSV as a blob, dropping an empty scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await salesTaxReportApi.get({ from: '2026-09-01', to: '2026-09-30', basis: 'sent', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/sales-tax', {
      params: { from: '2026-09-01', to: '2026-09-30', basis: 'sent' },
    });
    await salesTaxReportApi.exportCsv({ from: '2026-09-01', to: '2026-09-30', basis: 'sent', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/sales-tax/export.csv', {
      params: { from: '2026-09-01', to: '2026-09-30', basis: 'sent', regionIds: ['r1'] },
      responseType: 'blob',
    });
  });
});

describe('unbilledReportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs the report, a group\'s rows and the CSV, dropping an empty scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await unbilledReportApi.get({ source: 'po', groupBy: 'age', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/unbilled', { params: { source: 'po', groupBy: 'age' } });
    await unbilledReportApi.rows({ source: 'all', groupBy: 'job', groupKey: 'wo-1', page: 0, size: 25 });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/unbilled/rows', {
      params: { source: 'all', groupBy: 'job', groupKey: 'wo-1', page: 0, size: 25 },
    });
    await unbilledReportApi.exportCsv({ source: 'quote', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/reports/unbilled/export.csv', {
      params: { source: 'quote', regionIds: ['r1'] },
      responseType: 'blob',
    });
  });

  it('PUTs a quote line\'s billing', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    await quoteLineBillingApi.setBilling('ql-1', { notBillable: true, reason: 'Warranty' });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/quote-lines/ql-1/billing', { notBillable: true, reason: 'Warranty' });
  });
});

describe('quotesApi proposal structure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds groups and options, sets an add-on mode, and moves a line', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    await quotesApi.addOptionGroup('q-1', { version: 3, name: 'System' });
    expect(apiClient.post).toHaveBeenLastCalledWith('/financial/quotes/q-1/option-groups', { version: 3, name: 'System' });
    await quotesApi.addOption('q-1', { version: 4, groupId: 'g-1', name: 'Comfort' });
    expect(apiClient.post).toHaveBeenLastCalledWith('/financial/quotes/q-1/options', { version: 4, groupId: 'g-1', name: 'Comfort' });
    await quotesApi.reorderOptions('q-1', 'g-1', { version: 5, optionIds: ['o-2', 'o-1'] });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/quotes/q-1/option-groups/g-1/options/order', { version: 5, optionIds: ['o-2', 'o-1'] });
    await quotesApi.setAddOnMode('q-1', 'o-1', 'l-9', { version: 6, mode: 'INCLUDED' });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/quotes/q-1/options/o-1/add-ons/l-9', { version: 6, mode: 'INCLUDED' });
    await quotesApi.setLinePlacement('q-1', 'l-9', { version: 7, role: 'ADD_ON', recommended: true, recommendationNote: 'Leaky ducts' });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/quotes/q-1/lines/l-9/placement', {
      version: 7, role: 'ADD_ON', recommended: true, recommendationNote: 'Leaky ducts',
    });
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
    await quotesApi.getActivity('q-1', { limit: 30, kinds: ['QUOTE_VIEWED', 'QUOTE_CHOICE_CHANGED'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/quotes/q-1/activity', {
      params: { limit: 30, kinds: 'QUOTE_VIEWED,QUOTE_CHOICE_CHANGED' },
    });
    await quotesApi.getApproval('q-1');
    expect(apiClient.get).toHaveBeenLastCalledWith('/financial/quotes/q-1/approval');
    await quotesApi.saveSelection('q-1', { optionIds: ['o-2'], addOnLineIds: ['l-9'] });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/quotes/q-1/selection', { optionIds: ['o-2'], addOnLineIds: ['l-9'] });
    await quotesApi.delete('q-1', 9);
    expect(apiClient.delete).toHaveBeenLastCalledWith('/financial/quotes/q-1', { params: { version: 9 } });
    await quotesApi.deleteOption('q-1', 'o-1', 8);
    expect(apiClient.delete).toHaveBeenLastCalledWith('/financial/quotes/q-1/options/o-1', { params: { version: 8 } });
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

  it('sets or removes the margin floor', async () => {
    await taxApi.updatePricingSettings('FEE', undefined, { marginFloor: 0.35 });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', marginFloor: 0.35 });
    await taxApi.updatePricingSettings('FEE', 30, { marginFloor: 0 });
    expect(apiClient.put).toHaveBeenLastCalledWith('/financial/pricing-settings', { agreementFeeTaxClass: 'FEE', quoteValidityDays: 30, marginFloor: 0 });
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

describe('pricebookApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches items with the list params as given', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
    await pricebookApi.getItems({ q: 'cap', active: true, size: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/financial/pricebook/items', { params: { q: 'cap', active: true, size: 20 } });
  });
});

describe('ratePlansApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears an account’s plan with an explicit null', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    await ratePlansApi.setCustomerPlan('cust-1', null);
    expect(apiClient.put).toHaveBeenCalledWith('/financial/customers/cust-1/rate-plan', { ratePlanId: null });
  });
});

describe('mediaApi.upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets an upload URL, PUTs the file with the returned type, then confirms', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { mediaId: 'm-1', uploadUrl: 'https://s3/put', contentType: 'image/jpeg' } })
      .mockResolvedValueOnce({ data: { id: 'm-1', status: 'READY', url: 'https://cdn/m-1.jpg', thumbnailUrl: 'https://cdn/m-1-t.jpg' } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'unit.jpg', { type: 'image/jpeg' });

    const media = await mediaApi.upload(file);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/financial/media/upload-url', { fileName: 'unit.jpg', contentType: 'image/jpeg', sizeBytes: 1 });
    expect(fetchMock).toHaveBeenCalledWith('https://s3/put', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: file });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/financial/media/m-1/confirm');
    expect(media.status).toBe('READY');
    vi.unstubAllGlobals();
  });
});
