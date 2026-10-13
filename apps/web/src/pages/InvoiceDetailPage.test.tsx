import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import InvoiceDetailPage from './InvoiceDetailPage';
import { apiClient, type Invoice, type NestedInvoicePayment } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const payment = (over: Partial<NestedInvoicePayment> = {}): NestedInvoicePayment => ({
  id: 'p-1',
  paymentNumber: 'PMT-0012',
  paymentDate: '2026-10-11',
  amount: 500,
  paymentMethod: 'CHECK',
  status: 'RECEIVED',
  createdAt: '2026-10-11T15:00:00Z',
  updatedAt: '2026-10-11T15:00:00Z',
  ...over,
});

const invoice: Invoice = {
  id: 'inv-1',
  customerId: 'pay-1',
  workOrderId: 'wo-1',
  invoiceNumber: 'INV-3307',
  status: 'SENT',
  invoiceDate: '2026-10-11',
  dueDate: '2026-11-10',
  serviceDate: '2026-10-10',
  customerPoNumber: 'DR-55821',
  version: 3,
  pricingModel: 'ENGINE',
  grossSubtotal: 1450,
  adjustmentTotal: 0,
  subtotal: 1450,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 1450,
  ratePlanName: 'Desert Ridge · Commercial T&M',
  tax: { jurisdictionId: 'j-1', jurisdictionName: 'Phoenix, AZ', jurisdictionRate: 0.086, exempt: true, exemptCertificate: 'AZ-5000-114' },
  warnings: [],
  adjustments: [],
  amountPaid: 500,
  balanceDue: 950,
  lineItems: [
    { id: 'l1', sortOrder: 0, type: 'SERVICE', description: 'Replace blower motor', quantity: 1, unitPrice: 1450, lineTotal: 1450, adjustmentAmount: 0, netAmount: 1450, taxClass: 'LABOR', taxable: false, unitCost: 260 },
  ],
  payments: [payment()],
  lastSentAt: '2026-10-11T16:00:00Z',
  lastSentToEmails: 'ap@desertridgepm.com',
  createdAt: '2026-10-10T22:00:00Z',
  updatedAt: '2026-10-11T16:00:00Z',
};

const payer = { id: 'pay-1', name: 'Desert Ridge Property Mgmt', email: 'ap@desertridgepm.com', type: 'BILLING_ONLY', paymentTermsDays: 30 };
const workOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-4107',
  summary: 'RTU-2 not cooling',
  notToExceed: 2500,
  serviceLocation: {
    id: 'loc-9',
    locationName: 'Camelback Plaza · Suite 210',
    address: { streetAddress: '2390 E CAMELBACK RD', city: 'PHOENIX', state: 'AZ', zipCode: '85016' },
  },
};

function mockApi(doc: Invoice) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/financial/invoices/inv-1') return Promise.resolve({ data: doc });
    if (url === '/customers/pay-1') return Promise.resolve({ data: payer });
    if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const renderPage = () =>
  renderWithProviders(<div />, {
    routes: [{ path: '/invoices/:id', element: <InvoiceDetailPage /> }],
    initialPath: '/invoices/inv-1',
  });

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(invoice);
  });

  it('leads with the payer, the job site and the balance due', async () => {
    renderPage();

    expect(await screen.findByText('INV-3307')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Desert Ridge Property Mgmt' })).toBeInTheDocument();
    expect(screen.getByText('Payer')).toBeInTheDocument();
    expect(screen.getByText('Net 30 · ap@desertridgepm.com')).toBeInTheDocument();
    // An invoice's location is its work order's.
    expect(await screen.findByRole('link', { name: 'Camelback Plaza · Suite 210' })).toHaveAttribute('href', '/service-locations/loc-9');
    expect(screen.getByText('2390 E Camelback Rd, Phoenix, AZ 85016')).toBeInTheDocument();
    expect(screen.getByText('Oct 10, 2026')).toBeInTheDocument(); // service date, not shifted a day
    expect(screen.getByText('DR-55821')).toBeInTheDocument();
    expect(screen.getByText('$2,500.00')).toBeInTheDocument(); // NTE

    expect(screen.getAllByText('Balance due')).toHaveLength(2); // header + totals
    expect(screen.getAllByText('$950.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Due Nov 10, 2026 · total \$1,450\.00, \$500\.00 paid/)).toBeInTheDocument();
  });

  it('says the bill-to is tax-exempt', async () => {
    renderPage();
    expect(await screen.findByText('Tax-exempt · cert AZ-5000-114')).toBeInTheDocument();
  });

  it('flags an NTE overrun from the server warning', async () => {
    mockApi({ ...invoice, status: 'DRAFT', warnings: [{ code: 'NTE_EXCEEDED', message: 'Invoices for this job come to 2740.00' }] });
    renderPage();

    expect(await screen.findByText('Over not-to-exceed')).toBeInTheDocument();
    expect(await screen.findByText(/more than its \$2,500\.00 not-to-exceed\. Get approval from Desert Ridge Property Mgmt/)).toBeInTheDocument();
    expect(screen.queryByText(/2740/)).not.toBeInTheDocument();
  });

  it('shows payments a void returned to credit, struck through, and nothing owed', async () => {
    mockApi({
      ...invoice,
      status: 'VOID',
      amountPaid: 0,
      balanceDue: 0,
      payments: [payment({ reversedAt: '2026-10-12T10:00:00Z' })],
    });
    renderPage();

    expect(await screen.findByText('Total (withdrawn)')).toBeInTheDocument();
    expect(screen.getByText('Nothing is owed on this invoice')).toBeInTheDocument();
    expect(await screen.findByText(/\$500\.00 in payments applied to this invoice went back to Desert Ridge Property Mgmt's credit/)).toBeInTheDocument();
    expect(screen.getByText('PMT-0012')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toHaveClass('line-through');
  });

  it('links a reissued invoice and its corrected copy to each other', async () => {
    mockApi({ ...invoice, status: 'VOID', reissuedAsInvoiceId: 'inv-2', reissuedAsInvoiceNumber: 'INV-3412' });
    const { unmount } = renderPage();
    expect(await screen.findByRole('link', { name: 'INV-3412' })).toHaveAttribute('href', '/invoices/inv-2');
    unmount();

    mockApi({ ...invoice, status: 'DRAFT', reissuedFromInvoiceId: 'inv-0', reissuedFromInvoiceNumber: 'INV-3307' });
    renderPage();
    expect(await screen.findByRole('link', { name: 'INV-3307' })).toHaveAttribute('href', '/invoices/inv-0');
  });
});

describe('InvoiceDetailPage editing', () => {
  const draft: Invoice = { ...invoice, status: 'DRAFT', amountPaid: 0, balanceDue: 1450, payments: [], lastSentAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(draft);
  });

  it('edits a draft’s lines and header, sending every header field back', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...draft, version: 4 } });
    renderPage();

    expect(await screen.findAllByRole('textbox', { name: 'Quantity' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Service date'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/invoices/inv-1/header', {
      version: 3, invoiceDate: '2026-10-11', dueDate: '2026-11-10', serviceDate: null, customerPoNumber: 'DR-55821', notes: null,
    });
  });

  it('sends a draft and says who it went to', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { lastSentToEmails: 'ap@desertridgepm.com' } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Send invoice' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-1/send', undefined);
  });

  it('cancels a draft after confirming', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...draft, status: 'CANCELLED', version: 4 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cancel invoice' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel invoice' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/financial/invoices/inv-1/status', { status: 'CANCELLED' });
  });

  it('locks a sent invoice', async () => {
    mockApi(invoice);
    renderPage();

    expect(await screen.findByText(/Sent invoices are locked/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Quantity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument();
  });
});
