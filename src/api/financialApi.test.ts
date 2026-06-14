import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoicesApi, quotesApi, financialActivityApi } from './financialApi';
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
