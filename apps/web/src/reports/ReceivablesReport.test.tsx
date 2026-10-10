import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ReceivablesReport from './ReceivablesReport';

const mockReport = vi.fn();
const mockInvoices = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    receivablesReportApi: { get: (...a: unknown[]) => mockReport(...a) },
    invoicesApi: { ...actual.invoicesApi, getAll: (...a: unknown[]) => mockInvoices(...a) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () =>
        Promise.resolve([
          { id: 'r1', name: 'East Valley', isActive: true },
          { id: 'r2', name: 'West Valley', isActive: true },
        ]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: (...a: unknown[]) => mockShowSuccess(...a) };
});

const bucket = (amount: number, count: number) => ({ amount, count });

function report(over: Record<string, unknown> = {}) {
  return {
    asOf: '2026-09-30',
    outstanding: 1390,
    overdue: bucket(1240, 5),
    current: bucket(150, 2),
    days1To30: bucket(140, 2),
    days31To60: bucket(300, 1),
    days61To90: bucket(400, 1),
    days91Plus: bucket(400, 1),
    currency: 'USD',
    regionIds: null,
    ...over,
  };
}

function invoice(i: number) {
  return {
    id: `inv-${i}`,
    invoiceNumber: `INV-${1000 + i}`,
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-15',
    customerName: `Customer ${i}`,
    workOrderId: `wo-${i}`,
    workOrderNumber: `WO-${i}`,
    regionId: 'r1',
    totalAmount: 140,
    balanceDue: 70,
    balanceAsOf: 105,
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
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  mockReport.mockResolvedValue(report());
  mockInvoices.mockResolvedValue(page([invoice(1), invoice(2)], 0, 1, 7));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReceivablesReport', () => {
  it('opens as of the end of last month: the strip, the buckets and every open invoice', async () => {
    renderWithProviders(<ReceivablesReport />, { initialPath: '/reports/receivables' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({ asOf: '2026-09-30', regionIds: undefined });
    expect(within(summary).getByText('$1,390')).toBeInTheDocument();
    expect(within(summary).getByText('$1,240')).toBeInTheDocument();

    const buckets = screen.getAllByTestId('report-bucket');
    expect(buckets).toHaveLength(5);
    expect(buckets[1]).toHaveTextContent('$140.00');

    await waitFor(() => expect(screen.getAllByTestId('report-invoice')).toHaveLength(2));
    expect(mockInvoices).toHaveBeenCalledWith({ openAsOf: '2026-09-30', sort: 'dueDate,asc', page: 0, size: 25 });
    // Aged from the date asked about, not today.
    expect(screen.getAllByTestId('report-invoice')[0]).toHaveTextContent('46');
    // The balance on the as-of date, not today's.
    expect(screen.getAllByTestId('report-invoice')[0]).toHaveTextContent('$105.00');
  });

  it('opens a bucket’s invoices, aged from the date, in the scope', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesReport />, { initialPath: '/reports/receivables?asOf=2026-06-30&region=r1' });

    await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({ asOf: '2026-06-30', regionIds: ['r1'] });
    await user.click(screen.getAllByTestId('report-bucket')[2]);
    await waitFor(() =>
      expect(mockInvoices).toHaveBeenLastCalledWith({
        openAsOf: '2026-06-30',
        agingBucket: 'DAYS_31_60',
        regionIds: ['r1'],
        sort: 'dueDate,asc',
        page: 0,
        size: 25,
      }),
    );
    expect(screen.getByText('reports.receivables.list.bucket')).toBeInTheDocument();
  });

  it('takes Home’s scope as of today and goes back to Home', async () => {
    renderWithProviders(<ReceivablesReport />, { initialPath: '/reports/receivables?asOf=today&from=home&region=r2' });

    await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({ asOf: '2026-10-08', regionIds: ['r2'] });
    expect(screen.getByRole('link', { name: 'reports.range.backHome' })).toHaveAttribute(
      'href',
      '/dashboard?view=rev&region=r2',
    );
  });

  it('says so when nothing was owed', async () => {
    const zero = bucket(0, 0);
    mockReport.mockResolvedValue(
      report({ outstanding: 0, overdue: zero, current: zero, days1To30: zero, days31To60: zero, days61To90: zero, days91Plus: zero }),
    );
    renderWithProviders(<ReceivablesReport />, { initialPath: '/reports/receivables' });
    expect(await screen.findByText('reports.receivables.empty.title')).toBeInTheDocument();
    expect(screen.queryAllByTestId('report-bucket')).toHaveLength(0);
  });

  it('exports every open invoice, a page at a time', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    mockInvoices.mockImplementation(({ page: p }: { page: number }) =>
      Promise.resolve(page(p === 0 ? [invoice(1), invoice(2)] : [invoice(3)], p, 2, 3)),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesReport />, { initialPath: '/reports/receivables' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: 'reports.revenue.export' }));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('reports.revenue.exported'));
    expect(mockInvoices).toHaveBeenCalledWith({ openAsOf: '2026-09-30', sort: 'dueDate,asc', page: 1, size: 200 });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
