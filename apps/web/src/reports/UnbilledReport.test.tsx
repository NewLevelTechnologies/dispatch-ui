import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UnbilledReport from './UnbilledReport';

const mockGet = vi.fn();
const mockRows = vi.fn();
const mockExport = vi.fn();
const mockQuoteBilling = vi.fn();
const mockPoBilling = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    unbilledReportApi: {
      get: (...a: unknown[]) => mockGet(...a),
      rows: (...a: unknown[]) => mockRows(...a),
      exportCsv: (...a: unknown[]) => mockExport(...a),
    },
    quoteLineBillingApi: { setBilling: (...a: unknown[]) => mockQuoteBilling(...a) },
    purchaseBillingApi: { ...actual.purchaseBillingApi, setBilling: (...a: unknown[]) => mockPoBilling(...a) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }, { id: 'r2', name: 'West', isActive: true }]),
    },
  };
});

function item(over: Record<string, unknown> = {}) {
  return {
    itemId: 'pol-1',
    source: 'PO',
    description: 'Capacitor 45/5',
    quantity: 2,
    amount: 60,
    estimate: true,
    estimateBasis: 'MARKUP_TIER',
    since: '2026-09-01',
    ageDays: 45,
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-1042',
    billToCustomerId: 'c1',
    billToName: 'Acme Property Mgmt',
    billToIsPayer: true,
    customerId: 'c2',
    customerName: 'Jane Homeowner',
    quoteId: null,
    quoteNumber: null,
    purchaseOrderId: 'po-1',
    poNumber: 'PO-1043',
    onDraftInvoice: null,
    ...over,
  };
}

const quoteItem = item({
  itemId: 'ql-1',
  source: 'QUOTE',
  description: 'Replace condenser fan motor',
  quantity: 1,
  amount: 500,
  estimate: false,
  estimateBasis: null,
  ageDays: 12,
  quoteId: 'q-1',
  quoteNumber: 'Q-2001',
  purchaseOrderId: null,
  poNumber: null,
  onDraftInvoice: { invoiceId: 'inv-9', invoiceNumber: 'INV-2001' },
});

function report(over: Record<string, unknown> = {}) {
  return {
    asOf: '2026-10-16',
    source: 'all',
    groupBy: 'job',
    summary: { total: 560, itemCount: 6, jobCount: 2, quoted: 500, estimated: 60, overThirtyDays: 60, overThirtyDaysCount: 1 },
    groups: [
      {
        key: 'wo-1',
        label: 'WO-1042',
        count: 5,
        amount: 560,
        share: 0.9,
        oldestAgeDays: 45,
        job: { workOrderId: 'wo-1', workOrderNumber: 'WO-1042', billToCustomerId: 'c1', billToName: 'Acme Property Mgmt', billToIsPayer: true },
        sample: [item(), quoteItem],
      },
      {
        key: 'QUOTE:q-7',
        label: 'Q-2007',
        count: 1,
        amount: 40,
        share: 0.1,
        oldestAgeDays: 3,
        job: { workOrderId: null, workOrderNumber: null, billToCustomerId: 'c3', billToName: 'Bo Diner', billToIsPayer: false },
        sample: [],
      },
    ],
    total: { count: 6, amount: 600 },
    currency: 'USD',
    regionIds: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(report());
});

describe('UnbilledReport', () => {
  it('opens by job as of today: the strip and a row per job opening its billing tab', async () => {
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({ source: 'all', groupBy: 'job', regionIds: undefined });
    expect(within(summary).getByText('$560.00')).toBeInTheDocument();
    expect(within(summary).getByText('≈ $60.00')).toBeInTheDocument();
    expect(within(summary).getByText('$60.00')).toHaveClass('text-warning-fg');

    const [job, quoteOnly] = screen.getAllByTestId('report-group');
    expect(job).toHaveTextContent('WO-1042');
    expect(job).toHaveTextContent('Acme Property Mgmt');
    expect(within(job).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/work-orders/wo-1?tab=estimate');
    expect(job).toHaveTextContent('45 days');
    // A quote with no work order opens the quote.
    expect(within(quoteOnly).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/quotes/q-7');
  });

  it('expands a job to its items: estimate marker, source, draft invoice, the header’s columns', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    const [job] = await screen.findAllByTestId('report-group');
    await user.click(job);
    const [po, quote] = screen.getAllByTestId('report-group-item');
    expect(po).toHaveTextContent('Capacitor 45/5');
    expect(po).toHaveTextContent('≈ $60.00');
    expect(within(po).getByRole('link', { name: 'PO-1043' })).toHaveAttribute('href', '/purchase-orders/po-1');
    expect(quote).toHaveTextContent('$500.00');
    expect(quote).not.toHaveTextContent('≈');
    expect(within(quote).getByRole('link', { name: 'INV-2001' })).toHaveAttribute('href', '/invoices/inv-9');
    // Grouped by job, the rows don't repeat the WO.
    expect(within(po).queryByRole('link', { name: 'WO-1042' })).not.toBeInTheDocument();
    expect(po.querySelectorAll('td')).toHaveLength(6);
  });

  it('names source and age groups, and asks by source', async () => {
    mockGet.mockResolvedValue(
      report({
        groupBy: 'age',
        groups: [
          { key: 'DAYS_31_60', label: null, count: 1, amount: 60, share: 1, oldestAgeDays: 45, job: null, sample: [item()] },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled?group=age&source=po' });

    const [group] = await screen.findAllByTestId('report-group');
    expect(mockGet).toHaveBeenCalledWith({ source: 'po', groupBy: 'age', regionIds: undefined });
    expect(group).toHaveTextContent('reports.unbilled.age.DAYS_31_60');
    expect(within(group).queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
    await user.click(group);
    // Not grouped by job: the row names its WO.
    expect(within(screen.getByTestId('report-group-item')).getByRole('link', { name: 'WO-1042' })).toBeInTheDocument();
  });

  it('opens every item in a group below the table', async () => {
    mockRows.mockResolvedValue({ content: [item(), quoteItem], page: 0, size: 25, totalElements: 5, totalPages: 1, first: true, last: true });
    const user = userEvent.setup();
    const { router } = renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    const [job] = await screen.findAllByTestId('report-group');
    await user.click(job);
    await user.click(screen.getByRole('button', { name: 'View all' }));
    await waitFor(() => expect(router.state.location.search).toBe('?key=wo-1'));
    expect(await screen.findAllByTestId('report-item')).toHaveLength(2);
    expect(mockRows).toHaveBeenCalledWith({ source: 'all', groupBy: 'job', regionIds: undefined, groupKey: 'wo-1', page: 0, size: 25 });
  });

  it('dismisses a quote line with a reason and refetches the report', async () => {
    mockQuoteBilling.mockResolvedValue({ quoteLineId: 'ql-1', notBillable: true, reason: 'Warranty' });
    const user = userEvent.setup();
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    const [job] = await screen.findAllByTestId('report-group');
    await user.click(job);
    const [, quote] = screen.getAllByTestId('report-group-item');
    await user.click(within(quote).getByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Dismiss' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'Warranty');
    await user.click(confirm);

    await waitFor(() => expect(mockQuoteBilling).toHaveBeenCalledWith('ql-1', { notBillable: true, reason: 'Warranty' }));
    expect(mockPoBilling).not.toHaveBeenCalled();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('dismisses a PO part through the PO-line call', async () => {
    mockPoBilling.mockResolvedValue({ poLineId: 'pol-1', notBillable: true, reason: 'Shop stock' });
    const user = userEvent.setup();
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    const [job] = await screen.findAllByTestId('report-group');
    await user.click(job);
    const [po] = screen.getAllByTestId('report-group-item');
    await user.click(within(po).getByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Shop stock');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(mockPoBilling).toHaveBeenCalledWith('pol-1', { notBillable: true, reason: 'Shop stock' }));
  });

  it('downloads the server’s CSV for the source and scope', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    mockExport.mockResolvedValue(new Blob(['source\r\n'], { type: 'text/csv' }));
    const user = userEvent.setup();
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled?source=quote&region=r1' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: /reports\.revenue\.export/ }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(mockExport).toHaveBeenCalledWith({ source: 'quote', regionIds: ['r1'] });
  });

  it('says so when nothing is unbilled', async () => {
    mockGet.mockResolvedValue(
      report({
        summary: { total: 0, itemCount: 0, jobCount: 0, quoted: 0, estimated: 0, overThirtyDays: 0, overThirtyDaysCount: 0 },
        groups: [],
        total: { count: 0, amount: 0 },
      }),
    );
    renderWithProviders(<UnbilledReport />, { initialPath: '/reports/unbilled' });

    expect(await screen.findByText('reports.unbilled.empty.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reports\.revenue\.export/ })).toBeDisabled();
  });
});
