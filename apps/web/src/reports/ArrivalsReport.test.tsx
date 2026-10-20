import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ArrivalsReport from './ArrivalsReport';

const mockGet = vi.fn();
const mockLate = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    arrivalReportApi: {
      get: (...a: unknown[]) => mockGet(...a),
      late: (...a: unknown[]) => mockLate(...a),
    },
    userApi: {
      ...actual.userApi,
      getAll: () => Promise.resolve([{ id: 'u1', firstName: 'Lena', lastName: 'Lead', email: 'l@x.com' }]),
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

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, visits: 14, arrived: 13, onTime: 11 }));

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    timeZone: 'UTC',
    visits: 412,
    arrived: 398,
    onTime: 351,
    late: 47,
    onTimeRate: 0.882,
    averageMinutesLate: 18.4,
    byDay: days(30),
    comparison: {
      basis: 'sameDatesLastYear',
      from: '2025-09-01',
      to: '2025-09-30',
      visits: 380,
      arrived: 371,
      onTime: 320,
      late: 51,
      onTimeRate: 0.863,
      averageMinutesLate: 21,
    },
    groupBy: 'technician',
    groups: [
      { id: 'u1', visits: 40, arrived: 39, onTime: 36, late: 3, onTimeRate: 0.923, comparisonArrived: 35, comparisonOnTime: 30, comparisonOnTimeRate: 0.857 },
      { id: null, visits: 2, arrived: 0, onTime: 0, late: 0, onTimeRate: null, comparisonArrived: 0, comparisonOnTime: 0, comparisonOnTimeRate: null },
    ],
    regionIds: null,
    ...over,
  };
}

function late(over: Record<string, unknown> = {}) {
  return {
    dispatchId: 'd1',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1042',
    technicianId: 'u1',
    technicianName: 'Lena Lead',
    regionId: 'r1',
    customerName: 'Acme Diner',
    serviceLocation: { name: 'Main St', streetAddress: '100 MAIN ST', city: 'SPRINGFIELD' },
    arrivalWindowStart: '2026-09-04T09:00:00Z',
    arrivalWindowEnd: '2026-09-04T11:00:00Z',
    arrivedAt: '2026-09-04T11:47:00Z',
    minutesLate: 47,
    ...over,
  };
}

const page = (content: unknown[]) => ({
  content,
  page: 0,
  size: 25,
  totalElements: content.length,
  totalPages: 1,
  first: true,
  last: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockGet.mockResolvedValue(report());
  mockLate.mockResolvedValue(page([late()]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ArrivalsReport', () => {
  it('opens on last month by tech: the rate, a row per tech and the late visits', async () => {
    renderWithProviders(<ArrivalsReport />, { initialPath: '/reports/arrivals' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'technician',
      regionIds: undefined,
    });
    expect(within(summary).getByText('88.2%')).toBeInTheDocument();
    expect(within(summary).getByText('+1.9 pts')).toBeInTheDocument();
    expect(within(summary).getByText('18 min')).toBeInTheDocument();

    const groups = await screen.findAllByTestId('report-group');
    await waitFor(() => expect(groups[0]).toHaveTextContent('Lena Lead'));
    expect(groups[0]).toHaveTextContent('92.3%');
    expect(groups[0]).toHaveTextContent('+6.6 pts');
    expect(groups[1]).toHaveTextContent('reports.arrivals.unassigned');

    const [row] = await screen.findAllByTestId('late-row');
    expect(row).toHaveTextContent('Sep 4');
    expect(row).toHaveTextContent('9:00 – 11:00 AM');
    expect(row).toHaveTextContent('11:47 AM');
    expect(row).toHaveTextContent('47 min');
    expect(row).toHaveTextContent('Main St · 100 Main St');
    expect(within(row).getByRole('link', { name: 'WO-1042' })).toHaveAttribute('href', '/work-orders/wo1');
  });

  it('lists one tech’s late visits when their row is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArrivalsReport />, { initialPath: '/reports/arrivals' });

    const [first] = await screen.findAllByTestId('report-group');
    await user.click(first);
    await waitFor(() => expect(mockLate).toHaveBeenLastCalledWith(expect.objectContaining({ technicianId: 'u1', page: 0 })));
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('button', { name: /reports.arrivals.late.onlyTech/ }));
    await waitFor(() => expect(mockLate).toHaveBeenLastCalledWith(expect.objectContaining({ technicianId: undefined })));
  });

  it('scopes to a region picked from the region grouping', async () => {
    mockGet.mockResolvedValue(
      report({
        groupBy: 'region',
        groups: [{ id: 'r2', visits: 9, arrived: 9, onTime: 8, late: 1, onTimeRate: 0.889, comparisonArrived: null, comparisonOnTime: null, comparisonOnTimeRate: null }],
      }),
    );
    const user = userEvent.setup();
    const { router } = renderWithProviders(<ArrivalsReport />, { initialPath: '/reports/arrivals?group=region' });

    const [row] = await screen.findAllByTestId('report-group');
    await waitFor(() => expect(row).toHaveTextContent('West Valley'));
    await user.click(row);
    await waitFor(() => expect(router.state.location.search).toContain('region=r2'));
  });

  it('says so when nobody was late, and offers no export', async () => {
    mockGet.mockResolvedValue(report({ late: 0, averageMinutesLate: null }));
    renderWithProviders(<ArrivalsReport />, { initialPath: '/reports/arrivals' });

    expect(await screen.findByText('reports.arrivals.late.none')).toBeInTheDocument();
    expect(mockLate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /reports.revenue.export/ })).toBeDisabled();
  });
});
