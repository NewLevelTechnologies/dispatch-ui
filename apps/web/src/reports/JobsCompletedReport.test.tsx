import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { useHasCapability } from '../hooks/useCurrentUser';
import JobsCompletedReport from './JobsCompletedReport';

const mockJobs = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    workOrderReportsApi: { ...actual.workOrderReportsApi, jobsCompleted: (...a: unknown[]) => mockJobs(...a) },
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: () => Promise.resolve([{ id: 'ty1', name: 'Repair', isActive: true }]) },
    divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([]) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, jobs: 7, billed: 3200 }));

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    jobs: 214,
    billed: 96420,
    averageTicket: 512.87,
    notBilled: 26,
    agreementVisits: 12,
    jobsByDay: days,
    comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30', jobs: 200, billed: 88100, averageTicket: 489.44, notBilled: 18, agreementVisits: 11 },
    groupBy: 'workOrderType',
    groups: [
      { id: 'ty1', jobs: 90, billed: 51000, averageTicket: 600, notBilled: 5, agreementVisits: 0, comparisonJobs: 80, comparisonBilled: 45000, comparisonAverageTicket: 562.5 },
      { id: null, jobs: 124, billed: 45420, averageTicket: 440, notBilled: 21, agreementVisits: 12, comparisonJobs: 120, comparisonBilled: 43100, comparisonAverageTicket: 420 },
    ],
    currency: 'USD',
    regionIds: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockJobs.mockResolvedValue(report());
  vi.mocked(useHasCapability).mockImplementation((cap: string) => cap === 'VIEW_ALL_INVOICES');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('JobsCompletedReport', () => {
  it('opens on last month by type: jobs, billed, average ticket and a row per type', async () => {
    renderWithProviders(<JobsCompletedReport />, { initialPath: '/reports/jobs-completed' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockJobs).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'workOrderType',
      regionIds: undefined,
    });
    expect(within(summary).getByText('214')).toBeInTheDocument();
    expect(within(summary).getByText('+7.0%')).toBeInTheDocument();
    expect(within(summary).getByText('$96,420')).toBeInTheDocument();
    expect(within(summary).getByText('$513')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: '26' })).toHaveAttribute(
      'href',
      '/work-orders?status=COMPLETED&completedFrom=2026-09-01&completedTo=2026-09-30&unbilled=true',
    );
    expect(within(summary).getByText('reports.jobs.summary.notBilledVisitsSub')).toBeInTheDocument();

    const groups = screen.getAllByTestId('report-group');
    await waitFor(() => expect(groups[0]).toHaveTextContent('Repair'));
    expect(groups[0]).toHaveTextContent('$600');
    expect(groups[1]).toHaveTextContent('reports.revenue.unassigned');
    expect(screen.getByRole('link', { name: /reports.jobs.table.perTech/ })).toHaveAttribute('href', '/reports/tech-productivity');
  });

  it('opens a type’s completed jobs on the Work orders list', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<JobsCompletedReport />, { initialPath: '/reports/jobs-completed?region=r1' });

    const [row] = await screen.findAllByTestId('report-group');
    await user.click(row);
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders'));
    expect(router.state.location.search).toBe('?status=COMPLETED&completedFrom=2026-09-01&completedTo=2026-09-30&region=r1&type=ty1');
  });

  it('opens a type’s jobs waiting to be invoiced, not the whole type', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<JobsCompletedReport />, { initialPath: '/reports/jobs-completed' });

    const [row] = await screen.findAllByTestId('report-group');
    await user.click(within(row).getByRole('link', { name: '5' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders'));
    expect(router.state.location.search).toBe(
      '?status=COMPLETED&completedFrom=2026-09-01&completedTo=2026-09-30&type=ty1&unbilled=true',
    );
  });

  it('leaves out money without the invoice capability', async () => {
    vi.mocked(useHasCapability).mockReturnValue(false);
    renderWithProviders(<JobsCompletedReport />, { initialPath: '/reports/jobs-completed' });

    const summary = await screen.findByTestId('report-summary');
    expect(within(summary).queryByText('$96,420')).toBeNull();
    expect(screen.queryByText('$600')).toBeNull();
    expect(screen.queryByRole('link', { name: /reports.jobs.table.perTech/ })).toBeNull();
  });
});
