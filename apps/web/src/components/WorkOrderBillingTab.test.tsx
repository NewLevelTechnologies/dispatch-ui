/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderBillingTab from './WorkOrderBillingTab';
import { apiClient, type Invoice, type Quote, type QuoteInvoiceable } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const quote = (over: Partial<Quote>): Quote =>
  ({
    id: 'q-1',
    customerId: 'cust-1',
    customerName: 'Tanya Reyes',
    workOrderId: 'wo-1',
    quoteNumber: 'Q-1882',
    status: 'ACCEPTED',
    revision: 2,
    totalAmount: 742.67,
    expirationDate: '2026-11-06',
    decidedAt: '2026-10-08T15:00:00Z',
    lineItems: [{ id: 'ql-1' }, { id: 'ql-2' }],
    createdAt: '2026-10-07T15:00:00Z',
    ...over,
  }) as Quote;

const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'inv-1',
    customerId: 'cust-1',
    workOrderId: 'wo-1',
    invoiceNumber: 'INV-2204',
    status: 'SENT',
    invoiceDate: '2026-10-09',
    dueDate: '2026-10-09',
    totalAmount: 512.4,
    amountPaid: 0,
    balanceDue: 512.4,
    lineItems: [{ id: 'il-1', sourceQuoteLineId: 'ql-1' }],
    payments: [],
    lastSentAt: '2026-10-09T15:00:00Z',
    createdAt: '2026-10-09T15:00:00Z',
    ...over,
  }) as Invoice;

const invoiceable: QuoteInvoiceable = {
  quoteId: 'q-1',
  status: 'ACCEPTED',
  lines: [
    { quoteLineId: 'ql-1', sortOrder: 0, description: 'Capacitor 45/5', type: 'MATERIAL', unit: 'ea', unitPrice: 300, quantity: 1, invoicedQuantity: 1, remainingQuantity: 0 },
    { quoteLineId: 'ql-2', sortOrder: 1, description: 'Labor', type: 'LABOR', unit: 'hr', unitPrice: 100, quantity: 2, invoicedQuantity: 0, remainingQuantity: 2 },
  ],
};

const ZERO = { invoiced: '0', inDraft: '0', quotedAccepted: '0', quotedAwaiting: '0', paid: '0', balance: '0', currency: 'USD' };

function mockApi(quotes: Quote[], invoices: Invoice[], summary: Record<string, string> = ZERO) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/financial/work-orders/wo-1/summary') return Promise.resolve({ data: summary });
    if (url === '/financial/work-orders/wo-1/quotes') return Promise.resolve({ data: quotes });
    if (url === '/financial/work-orders/wo-1/invoices') return Promise.resolve({ data: invoices });
    if (url === '/financial/quotes/q-1/invoiceable') return Promise.resolve({ data: invoiceable });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const renderTab = () =>
  renderWithProviders(<div />, {
    routes: [
      {
        path: '/work-orders/:id',
        element: <WorkOrderBillingTab workOrderId="wo-1" workOrderNumber="WO-3892" customer={{ id: 'cust-1', name: 'Tanya Reyes' }} />,
      },
      { path: '/invoices/:id', element: <div>Invoice page</div> },
      { path: '/quotes/:id', element: <div>Quote page</div> },
    ],
    initialPath: '/work-orders/wo-1',
  });

describe('WorkOrderBillingTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nests invoices under their quote, a voided invoice beside its reissue, with the rollup', async () => {
    mockApi(
      [quote({}), quote({ id: 'q-2', quoteNumber: 'Q-1907', status: 'SENT', totalAmount: 1500, lineItems: [], createdAt: '2026-10-11T15:00:00Z' })],
      [
        invoice({ status: 'VOID', reissuedAsInvoiceId: 'inv-2', reissuedAsInvoiceNumber: 'INV-2219' }),
        invoice({
          id: 'inv-2',
          invoiceNumber: 'INV-2219',
          amountPaid: 89,
          balanceDue: 423.4,
          reissuedFromInvoiceId: 'inv-1',
          reissuedFromInvoiceNumber: 'INV-2204',
          createdAt: '2026-10-10T15:00:00Z',
        }),
      ],
      // The server's figures, not sums of the rows.
      { invoiced: '512.40', inDraft: '150.00', quotedAccepted: '742.67', quotedAwaiting: '1500.00', paid: '89.00', balance: '423.40', currency: 'USD' },
    );
    renderTab();

    const links = await screen.findAllByRole('link', { name: /^(Q|INV)-/ });
    expect(links.map((l) => l.textContent)).toEqual(['Q-1907', 'Q-1882', 'INV-2204', 'INV-2219']);
    expect(screen.getByText('Voided · reissued as INV-2219')).toBeInTheDocument();
    expect(await screen.findByText('60% invoiced')).toBeInTheDocument();
    expect(screen.getByText('$423.40 due')).toBeInTheDocument();
    // Accepted, invoiced, collected and balance due, from the summary.
    expect(await screen.findByText('$742.67', { selector: '.text-\\[18px\\]' })).toBeInTheDocument();
    expect(screen.getByText('+ $1,500.00 awaiting customer')).toBeInTheDocument();
    expect(screen.getByText('$512.40', { selector: '.text-\\[18px\\]' })).toBeInTheDocument();
    expect(screen.getByText('+ $150.00 in draft')).toBeInTheDocument();
    expect(screen.getByText('$89.00', { selector: '.text-\\[18px\\]' })).toBeInTheDocument();
    expect(screen.getByText('$423.40', { selector: '.text-\\[18px\\]' })).toBeInTheDocument();
  });

  it('bills what is left on an accepted quote and opens the new invoice', async () => {
    const user = userEvent.setup();
    mockApi([quote({})], []);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'inv-9', invoiceNumber: 'INV-2300' } });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Create invoice' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('All billed')).toBeInTheDocument();
    const qty = within(dialog).getByRole('textbox', { name: 'Bill now: Labor' });
    expect(qty).toHaveValue('2');
    await user.clear(qty);
    await user.type(qty, '1');
    await user.click(within(dialog).getByRole('button', { name: 'Create invoice' }));

    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/invoices/from-quote',
      expect.objectContaining({ quoteId: 'q-1', lines: [{ quoteLineId: 'ql-2', quantity: 1 }], billToCustomerId: undefined, reprice: false }),
    );
    expect(await screen.findByText('Invoice page')).toBeInTheDocument();
  });

  it('starts an empty draft quote for the job and opens it', async () => {
    const user = userEvent.setup();
    mockApi([], []);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'q-9' } });
    renderTab();

    expect(await screen.findByText('No quotes or invoices yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New quote' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create quote' }));

    expect(apiClient.post).toHaveBeenCalledWith(
      '/financial/quotes',
      expect.objectContaining({ customerId: 'cust-1', workOrderId: 'wo-1', lineItems: [] }),
    );
    expect(await screen.findByText('Quote page')).toBeInTheDocument();
  });

  it('sends a draft invoice from its row and offers payment on an open one', async () => {
    const user = userEvent.setup();
    mockApi([], [invoice({ id: 'inv-3', invoiceNumber: 'INV-3000', status: 'DRAFT', lineItems: [], lastSentAt: null }), invoice({ lineItems: [] })]);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { lastSentToEmails: 'tanya@example.com' } });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Send' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-3/send', undefined);

    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
