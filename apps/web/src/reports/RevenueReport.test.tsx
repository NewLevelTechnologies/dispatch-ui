import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RevenueReport from './RevenueReport';

const mockReport = vi.fn();
const mockInvoices = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    revenueReportApi: { get: (...a: unknown[]) => mockReport(...a) },
    invoicesApi: { ...actual.invoicesApi, getAll: (...a: unknown[]) => mockInvoices(...a) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () =>
        Promise.resolve([
          { id: 'r1', name: 'East Valley', isActive: true },
          { id: 'r2', name: 'West Valley', isActive: true },
        ]),
    },
    divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([{ id: 'd1', name: 'HVAC' }]) },
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: () => Promise.resolve([{ id: 't1', name: 'Service Call' }]) },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: (...a: unknown[]) => mockShowSuccess(...a) };
});

function days(from: string, n: number, amount = 100) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), amount };
  });
}

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    billed: 3000,
    invoiceCount: 30,
    collected: 2500,
    billedByDay: days('2026-09-01', 30),
    comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30', billed: 2500, invoiceCount: 25, collected: 2000 },
    groupBy: 'division',
    groups: [
      { id: 'd1', billed: 2400, invoiceCount: 24, comparisonBilled: 2000, comparisonInvoiceCount: 20 },
      { id: null, billed: 600, invoiceCount: 6, comparisonBilled: 500, comparisonInvoiceCount: 5 },
    ],
    currency: 'USD',
    regionIds: null,
    ...over,
  };
}

function invoice(i: number) {
  return {
    id: `inv-${i}`,
    invoiceNumber: `INV-${1000 + i}`,
    invoiceDate: '2026-09-30',
    customerName: `Customer ${i}`,
    workOrderId: `wo-${i}`,
    workOrderNumber: `WO-${i}`,
    divisionId: 'd1',
    workOrderTypeId: 't1',
    regionId: 'r1',
    subtotal: 100,
    taxAmount: 8,
    totalAmount: 108,
  };
}

const page = (content: unknown[], pageIndex = 0, totalPages = 1, totalElements = content.length) => ({
  content,
  page: pageIndex,
  size: 25,
  totalElements,
  totalPages,
  first: pageIndex === 0,
  last: pageIndex + 1 >= totalPages,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockReport.mockImplementation((p: { from: string; groupBy: string }) =>
    Promise.resolve(p.groupBy === 'none' && p.from.startsWith('2025') ? report({ comparison: null, groups: [] }) : report()),
  );
  mockInvoices.mockResolvedValue(page([invoice(1), invoice(2)], 0, 1, 24));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RevenueReport', () => {
  it('opens on last month compared with last year, grouped by division', async () => {
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'division',
      regionIds: undefined,
    });
    expect(within(summary).getByText('$3,000')).toBeInTheDocument();
    expect(within(summary).getAllByText('+20.0%').length).toBeGreaterThan(0);
    expect(screen.getByText('reports.revenue.sub')).toBeInTheDocument();

    // A daily chart against last year lines ghosts up by weekday: 364 days back.
    await waitFor(() =>
      expect(mockReport).toHaveBeenCalledWith({
        from: '2025-09-02',
        to: '2025-10-01',
        compare: 'none',
        groupBy: 'none',
        regionIds: undefined,
      }),
    );
    expect(screen.getAllByTestId('report-bar')).toHaveLength(30);
    expect(await screen.findAllByTestId('report-ghost')).toHaveLength(30);

    const groups = screen.getAllByTestId('report-group');
    expect(groups[0]).toHaveTextContent('HVAC');
    expect(groups[0]).toHaveTextContent('$2,400');
    expect(groups[1]).toHaveTextContent('reports.revenue.unassigned');
  });

  it('expands a group to its newest invoices, with the list holding all of them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue' });

    await user.click((await screen.findAllByTestId('report-group'))[1]);
    await waitFor(() => expect(screen.getAllByTestId('report-group-invoice')).toHaveLength(2));
    expect(mockInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ billed: true, from: '2026-09-01', to: '2026-09-30', noDivision: true, size: 4 }),
    );
    expect(screen.getByRole('link', { name: 'reports.revenue.table.viewAll' })).toHaveAttribute(
      'href',
      '/invoices?status=billed&from=2026-09-01&to=2026-09-30&division=none',
    );
    expect(screen.getByRole('link', { name: 'WO-1' })).toHaveAttribute('href', '/work-orders/wo-1');
  });

  it('takes Home’s period and scope, and goes back to Home', async () => {
    mockReport.mockResolvedValue(
      report({ from: '2026-07-01', to: '2026-09-30', billedByDay: days('2026-07-01', 92), regionIds: ['r2'] }),
    );
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue?range=2026-Q3&from=home&region=r2' });

    await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-07-01', to: '2026-09-30', regionIds: ['r2'] }),
    );
    // 92 days: weekly bars.
    expect(screen.getAllByTestId('report-bar')).toHaveLength(14);
    expect(screen.getByRole('link', { name: 'reports.revenue.backHome' })).toHaveAttribute(
      'href',
      '/dashboard?view=rev&period=2026-Q3&region=r2',
    );
  });

  it('lists the invoices themselves when grouped by nothing', async () => {
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue?group=none' });

    await waitFor(() => expect(screen.getAllByTestId('report-invoice')).toHaveLength(2));
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'none' }));
    expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({ billed: true, page: 0, size: 25 }));
  });

  it('says so when nothing was billed, keeping the strip at zero', async () => {
    mockReport.mockResolvedValue(
      report({ billed: 0, invoiceCount: 0, collected: 0, billedByDay: days('2026-09-01', 30, 0), comparison: null, groups: [] }),
    );
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue' });

    expect(await screen.findByText('reports.revenue.empty.title')).toBeInTheDocument();
    expect(within(screen.getByTestId('report-summary')).getAllByText('$0')).toHaveLength(3);
    expect(screen.queryAllByTestId('report-bar')).toHaveLength(0);
    expect(screen.getAllByText('reports.revenue.noComparison.sameDatesLastYear').length).toBeGreaterThan(0);
  });

  it('exports every invoice in the report, a page at a time', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    mockInvoices.mockImplementation(({ page: p }: { page: number }) =>
      Promise.resolve(page(p === 0 ? [invoice(1), invoice(2)] : [invoice(3)], p, 2, 3)),
    );
    const user = userEvent.setup();
    renderWithProviders(<RevenueReport />, { initialPath: '/reports/revenue' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: 'reports.revenue.export' }));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('reports.revenue.exported'));
    expect(mockInvoices).toHaveBeenCalledWith(expect.objectContaining({ billed: true, page: 1, size: 200 }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
