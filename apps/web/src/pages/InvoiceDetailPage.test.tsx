import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
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

  it('takes a payment on an open invoice, and voids one after confirming', async () => {
    const user = userEvent.setup();
    mockApi({ ...invoice, status: 'SENT' });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Take payment' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Void PMT-0012' }));
    await user.click(await screen.findByRole('button', { name: 'Void payment' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/payments/p-1/void');
  });

  it('voids a sent invoice from the menu', async () => {
    const user = userEvent.setup();
    mockApi(invoice);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...invoice, status: 'VOID', version: 4 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Replace customer link' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Void invoice' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /void/i }));
    expect(apiClient.patch).toHaveBeenCalledWith('/financial/invoices/inv-1/status', { status: 'VOID' });
  });
});

describe('InvoiceDetailPage reissue and credit', () => {
  const copy: Invoice = {
    ...invoice,
    id: 'inv-2',
    invoiceNumber: 'INV-3412',
    status: 'DRAFT',
    version: 1,
    amountPaid: 0,
    balanceDue: 1450,
    payments: [],
    lastSentAt: null,
    reissuedFromInvoiceId: 'inv-1',
    reissuedFromInvoiceNumber: 'INV-3307',
  };
  const voided: Invoice = {
    ...invoice,
    status: 'VOID',
    amountPaid: 0,
    payments: [payment({ reversedAt: '2026-10-12T10:00:00Z' })],
    reissuedAsInvoiceId: 'inv-2',
    reissuedAsInvoiceNumber: 'INV-3412',
  };
  const mockBoth = (original: Invoice, corrected: Invoice) =>
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/invoices/inv-1') return Promise.resolve({ data: original });
      if (url === '/financial/invoices/inv-2') return Promise.resolve({ data: corrected });
      if (url === '/financial/payments/p-1')
        return Promise.resolve({ data: { id: 'p-1', paymentNumber: 'PMT-0012', status: 'RECEIVED', amount: 500, unappliedAmount: 500, applications: [] } });
      if (url === '/customers/pay-1') return Promise.resolve({ data: payer });
      if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  const renderAt = (id: string) =>
    renderWithProviders(<div />, {
      routes: [{ path: '/invoices/:id', element: <InvoiceDetailPage /> }],
      initialPath: `/invoices/${id}`,
    });

  beforeEach(() => vi.clearAllMocks());

  it('voids a sent invoice and opens its corrected draft', async () => {
    const user = userEvent.setup();
    mockBoth(invoice, copy);
    vi.mocked(apiClient.post).mockResolvedValue({ data: copy });
    renderAt('inv-1');

    await user.click(await screen.findByRole('button', { name: 'Void & reissue' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The $500.00 paid on it goes back to Desert Ridge Property Mgmt’s credit.');
    await user.click(within(dialog).getByRole('button', { name: 'Void & reissue' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices/inv-1/reissue');
    expect(await screen.findByText('INV-3412')).toBeInTheDocument();
  });

  it('offers no reissue once an invoice was already reissued', async () => {
    mockBoth(voided, copy);
    renderAt('inv-1');

    expect(await screen.findByText(/Voided and reissued as/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reissue/i })).not.toBeInTheDocument();
  });

  it('holds the returned credit while the corrected copy is a draft', async () => {
    mockBoth(voided, copy);
    renderAt('inv-2');

    expect(await screen.findByText(/\$500\.00 from INV-3307’s payments is on Desert Ridge Property Mgmt’s credit/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credit/ })).not.toBeInTheDocument();
  });

  it('applies the returned credit once the corrected copy is sent', async () => {
    const user = userEvent.setup();
    mockBoth(voided, { ...copy, status: 'SENT', lastSentAt: '2026-10-13T10:00:00Z' });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    renderAt('inv-2');

    await user.click(await screen.findByRole('button', { name: 'Apply $500.00 credit' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/payments/p-1/applications', {
      applications: [{ invoiceId: 'inv-2', amountApplied: 500 }],
    });
  });
});

describe('InvoiceDetailPage · parts from purchase orders', () => {
  const draft: Invoice = { ...invoice, status: 'DRAFT', version: 4, amountPaid: 0, balanceDue: 1450, payments: [], lastSentAt: null, ratePlanId: 'rp-1' };
  const parts = [
    {
      purchaseOrderId: 'po-1', purchaseOrderNumber: 'PO-1043', purchaseOrderType: 'ORDER', poLineId: 'pl-1', description: 'Capacitor 45/5',
      sku: 'CAP-455', quantity: 2, billedQuantity: 0, unbilledQuantity: 2, unitCost: 18.75, unbilledCost: 37.5, suggestedUnitPrice: 48,
    },
    {
      purchaseOrderId: 'po-1', purchaseOrderNumber: 'PO-1043', purchaseOrderType: 'ORDER', poLineId: 'pl-2', description: 'Contactor 40A',
      sku: null, quantity: 1, billedQuantity: 0, unbilledQuantity: 1, unitCost: 28.4, unbilledCost: 28.4, suggestedUnitPrice: null,
    },
  ];
  const withParts = (tiers: { minCost: number; markupPct: number }[]) =>
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/invoices/inv-1') return Promise.resolve({ data: draft });
      if (url === '/financial/work-orders/wo-1/unbilled-purchases') return Promise.resolve({ data: parts });
      if (url === '/financial/rate-plans/rp-1')
        return Promise.resolve({ data: { id: 'rp-1', name: 'Desert Ridge', markupTiers: tiers, laborRates: [], categoryMultipliers: [] } });
      if (url === '/customers/pay-1') return Promise.resolve({ data: payer });
      if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  const renderAddPo = () =>
    renderWithProviders(<div />, {
      routes: [{ path: '/invoices/:id', element: <InvoiceDetailPage /> }],
      initialPath: '/invoices/inv-1?add=po',
    });

  beforeEach(() => vi.clearAllMocks());

  it('opens on the job’s unbilled parts and adds them linked to their PO lines', async () => {
    const user = userEvent.setup();
    withParts([{ minCost: 0, markupPct: 0.5 }]);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 5 } });
    renderAddPo();

    const form = await screen.findByRole('form', { name: 'Add from purchase orders' });
    expect(screen.getByRole('tab', { name: 'From PO (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(await within(form).findByText(/Leave price blank to price from cost by Desert Ridge’s markup tiers/)).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Price of Capacitor 45/5' })).toHaveValue('48');
    await user.click(within(form).getByRole('button', { name: 'Add 2 lines' }));

    await vi.waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/financial/invoices/inv-1/lines', {
      version: 4, type: 'MATERIAL', description: 'Capacitor 45/5', quantity: 2, unitCost: 18.75, sourcePoLineId: 'pl-1', unitPrice: 48,
    });
    // No price: the plan's tiers price it from cost.
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/financial/invoices/inv-1/lines', {
      version: 5, type: 'MATERIAL', description: 'Contactor 40A', quantity: 1, unitCost: 28.4, sourcePoLineId: 'pl-2',
    });
  });

  it('needs a price on every part when the plan can’t price from cost', async () => {
    const user = userEvent.setup();
    withParts([]);
    renderAddPo();

    const form = await screen.findByRole('form', { name: 'Add from purchase orders' });
    expect(await within(form).findByText(/has no markup tiers to price from cost/)).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Add 2 lines' })).toBeDisabled();
    await user.click(within(form).getByRole('checkbox', { name: 'Add Contactor 40A' }));
    expect(within(form).getByRole('button', { name: 'Add 1 line' })).toBeEnabled();
  });
});

describe('InvoiceDetailPage · the work order it shows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refetches the job when the work order page refreshes it, so a changed NTE shows', async () => {
    mockApi(invoice);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders(<div />, {
      queryClient,
      routes: [{ path: '/invoices/:id', element: <InvoiceDetailPage /> }],
      initialPath: '/invoices/inv-1',
    });
    await screen.findByText('INV-3307');
    const jobFetches = () => vi.mocked(apiClient.get).mock.calls.filter(([u]) => u === '/work-orders/wo-1').length;
    await vi.waitFor(() => expect(jobFetches()).toBe(1));

    // What the work order page does after saving a field.
    await queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    await vi.waitFor(() => expect(jobFetches()).toBe(2));
  });
});

describe('InvoiceDetailPage · an undated draft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says it isn’t sent and when it will be due, from the bill-to’s terms', async () => {
    mockApi({ ...invoice, status: 'DRAFT', invoiceDate: null, dueDate: null, amountPaid: 0, balanceDue: 1450, payments: [], lastSentAt: null });
    renderPage();

    expect(await screen.findByText(/Not sent · due 30 days after it’s sent/)).toBeInTheDocument();
  });
});
