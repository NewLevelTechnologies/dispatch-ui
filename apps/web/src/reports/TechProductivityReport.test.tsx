import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import TechProductivityReport from './TechProductivityReport';

const mockGet = vi.fn();
const mockInvoices = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    technicianProductivityApi: {
      get: (...a: unknown[]) => mockGet(...a),
      getCreditedInvoices: (...a: unknown[]) => mockInvoices(...a),
    },
    workOrderReportsApi: {
      callbackList: () => Promise.resolve({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 }),
    },
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

function tech(over: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    name: 'Lena Lead',
    jobs: 12,
    revenue: 9800,
    averageTicket: 816.67,
    onSiteHours: 61.5,
    invoicedHours: 55,
    revenuePerInvoicedHour: 178.18,
    excludedHours: { agreement: 0, billedLater: 0, billedEarlier: 0, notBilled: 0 },
    firstVisit: { eligible: 10, completed: 9, rate: 0.9 },
    callbacks: 1,
    comparison: { jobs: 10, revenue: 8400, onSiteHours: 58, callbacks: 0 },
    weekly: [
      { weekStart: '2026-09-01', revenue: 2100, jobs: 3 },
      { weekStart: '2026-09-08', revenue: 2650, jobs: 3 },
      { weekStart: '2026-09-15', revenue: 1900, jobs: 2 },
      { weekStart: '2026-09-22', revenue: 2400, jobs: 3 },
      { weekStart: '2026-09-29', revenue: 750, jobs: 1 },
    ],
    ...over,
  };
}

function response(over: Record<string, unknown> = {}) {
  return {
    periodStart: '2026-09-01',
    asOf: '2026-09-30',
    technicians: [tech(), tech({ userId: 'u2', name: null, revenue: 1000, comparison: { jobs: 0, revenue: 0, onSiteHours: 0, callbacks: 0 } })],
    unattributed: { noWorkOrder: { count: 2, amount: 4000 }, noTechArrived: { count: 1, amount: 250 } },
    totalRevenue: 15050,
    callbacksTrackedSince: '2026-06-01',
    currency: 'USD',
    regionIds: null,
    comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30', totalRevenue: 14000 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockGet.mockResolvedValue(response());
  mockInvoices.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 25 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TechProductivityReport', () => {
  it('opens on last month compared with last year: the strip, a row per tech and the total', async () => {
    renderWithProviders(<TechProductivityReport />, { initialPath: '/reports/tech-productivity' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      regionIds: undefined,
    });
    expect(within(summary).getByText('$15,050')).toBeInTheDocument();
    expect(within(summary).getByText('+7.5%')).toBeInTheDocument();
    // Credited = total less unattributed.
    expect(within(summary).getByText('$10,800')).toBeInTheDocument();

    const rows = screen.getAllByTestId('tech-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Lena Lead');
    expect(rows[0]).toHaveTextContent('$8,400');
    expect(rows[0]).toHaveTextContent('+16.7%');
    // A tech with nothing last year has no change to show.
    expect(rows[1]).toHaveTextContent('dashboard.revenue.techs.formerUser');
    expect(screen.getAllByTestId('tech-trend')).toHaveLength(2);
    expect(screen.getByTestId('unattributed-row')).toHaveTextContent('$4,250');
  });

  it('takes Home’s period and scope, and goes back to Home', async () => {
    mockGet.mockResolvedValue(response({ comparison: null, regionIds: ['r2'] }));
    renderWithProviders(<TechProductivityReport />, {
      initialPath: '/reports/tech-productivity?range=2026-Q3&compare=none&from=home&region=r2',
    });

    await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-09-30', compare: 'none', regionIds: ['r2'] });
    expect(screen.getByRole('link', { name: 'reports.range.backHome' })).toHaveAttribute(
      'href',
      '/dashboard?view=rev&period=2026-Q3&region=r2',
    );
    expect(screen.getAllByText('reports.range.noComparisonPicked').length).toBeGreaterThan(0);
  });

  it('opens a tech’s invoices for the report’s dates and scope', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TechProductivityReport />, { initialPath: '/reports/tech-productivity?region=r1' });

    await user.click((await screen.findAllByTestId('tech-row'))[0]);
    await waitFor(() =>
      expect(mockInvoices).toHaveBeenCalledWith('u1', {
        period: undefined,
        from: '2026-09-01',
        to: '2026-09-30',
        regionIds: ['r1'],
        page: 0,
        size: 25,
      }),
    );
  });

  it('says so when nothing was billed', async () => {
    mockGet.mockResolvedValue(
      response({
        technicians: [],
        totalRevenue: 0,
        unattributed: { noWorkOrder: { count: 0, amount: 0 }, noTechArrived: { count: 0, amount: 0 } },
      }),
    );
    renderWithProviders(<TechProductivityReport />, { initialPath: '/reports/tech-productivity' });
    expect(await screen.findByText('reports.techs.empty.title')).toBeInTheDocument();
  });

  it('exports the techs', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const user = userEvent.setup();
    renderWithProviders(<TechProductivityReport />, { initialPath: '/reports/tech-productivity' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: 'reports.revenue.export' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockShowSuccess).toHaveBeenCalledWith('reports.techs.exported');
  });
});
