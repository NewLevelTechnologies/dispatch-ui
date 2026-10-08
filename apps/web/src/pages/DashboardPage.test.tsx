import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { useCurrentUser, useHasCapability } from '../hooks/useCurrentUser';
import DashboardPage from './DashboardPage';

const mockGetBoard = vi.fn();
const mockGetSummary = vi.fn();
const mockGetUnscheduled = vi.fn();
const mockRelease = vi.fn();
const mockBell = vi.fn();
const mockAttention = vi.fn();
const mockRevenue = vi.fn();
const mockReceivables = vi.fn();
const mockQuotes = vi.fn();
const mockOverview = vi.fn();
const mockPoSummary = vi.fn();
const mockActivity = vi.fn();
const mockFinancialActivity = vi.fn();
const mockRegions = vi.fn();
const mockWorkOrders = vi.fn();
const mockShowSuccess = vi.fn();
const mockProductivity = vi.fn();
const mockCredited = vi.fn();
const mockChargedCallbacks = vi.fn();
const mockTargets = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    dispatchBoardApi: {
      ...actual.dispatchBoardApi,
      getBoard: (...a: unknown[]) => mockGetBoard(...a),
      getSummary: (...a: unknown[]) => mockGetSummary(...a),
      getUnscheduled: (...a: unknown[]) => mockGetUnscheduled(...a),
      release: (...a: unknown[]) => mockRelease(...a),
    },
    approvalsApi: { ...actual.approvalsApi, getBellSummary: () => mockBell() },
    financialDashboardApi: {
      ...actual.financialDashboardApi,
      getAttention: (...a: unknown[]) => mockAttention(...a),
      getRevenue: (...a: unknown[]) => mockRevenue(...a),
      getReceivables: (...a: unknown[]) => mockReceivables(...a),
      getQuotes: (...a: unknown[]) => mockQuotes(...a),
    },
    agreementApi: { ...actual.agreementApi, getOverview: (...a: unknown[]) => mockOverview(...a) },
    purchaseOrderApi: { ...actual.purchaseOrderApi, summary: (...a: unknown[]) => mockPoSummary(...a) },
    activityApi: { ...actual.activityApi, listForTenant: (...a: unknown[]) => mockActivity(...a) },
    financialActivityApi: {
      ...actual.financialActivityApi,
      getForTenant: (...a: unknown[]) => mockFinancialActivity(...a),
    },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: (...a: unknown[]) => mockRegions(...a) },
    workOrderApi: { ...actual.workOrderApi, getAll: (...a: unknown[]) => mockWorkOrders(...a) },
    technicianProductivityApi: {
      ...actual.technicianProductivityApi,
      get: (...a: unknown[]) => mockProductivity(...a),
      getCreditedInvoices: (...a: unknown[]) => mockCredited(...a),
      getChargedCallbacks: (...a: unknown[]) => mockChargedCallbacks(...a),
    },
    revenueTargetsApi: { ...actual.revenueTargetsApi, get: (...a: unknown[]) => mockTargets(...a) },
  };
});

vi.mock('@dispatch/api/src/client');

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: (...a: unknown[]) => mockShowSuccess(...a) };
});

const TWO_REGIONS = [
  { id: 'r1', name: 'East Valley', abbreviation: 'EV', isActive: true, sortOrder: 0 },
  { id: 'r2', name: 'West Valley', abbreviation: 'WV', isActive: true, sortOrder: 1 },
];

const OFFICE_CAPS = ['EDIT_DISPATCHES', 'APPROVE_WORK_ITEM_TRANSITIONS', 'VIEW_ALL_INVOICES', 'CREATE_WORK_ORDERS'];

function grant(caps: string[]) {
  vi.mocked(useHasCapability).mockImplementation((cap: string) => caps.includes(cap));
}

const pending = (total: number) => ({
  newCount: total,
  changedCount: 0,
  removedCount: 0,
  total,
  techCount: total > 0 ? 1 : 0,
});

const board = (over: Record<string, unknown> = {}) => ({
  date: '2026-09-30',
  timeZone: 'UTC',
  techs: [
    { id: 't1', name: 'Maya Ortiz', regionIds: [], stopCount: 2, committedCount: 2, divisionIds: [], timeOff: [] },
    {
      id: 't2',
      name: 'Dev Patel',
      regionIds: [],
      stopCount: 0,
      committedCount: 0,
      divisionIds: [],
      timeOff: [{ startsAt: '', endsAt: '', allDay: true, label: 'PTO' }],
    },
  ],
  dispatches: [
    {
      id: 'd1',
      assignedUserId: 't1',
      status: 'IN_PROGRESS',
      arrivalWindowStart: '2026-09-30T09:00:00Z',
      arrivalWindowEnd: '2026-09-30T11:00:00Z',
      arrivedAt: '2026-09-30T09:42:00Z',
      departedAt: null,
      serviceLocationName: 'Pham Residence',
      customerName: 'Pham, A.',
      serviceLocationCity: 'PHOENIX',
      workOrderNumber: 'WO-1',
    },
    {
      id: 'd2',
      assignedUserId: 't1',
      status: 'SCHEDULED',
      arrivalWindowStart: '2026-09-30T13:00:00Z',
      arrivalWindowEnd: '2026-09-30T15:00:00Z',
      arrivedAt: null,
      departedAt: null,
      serviceLocationName: null,
      customerName: 'Joe’s Pizza',
      serviceLocationCity: null,
      workOrderNumber: 'WO-2',
    },
  ],
  pendingRelease: pending(0),
  ...over,
});

const emptyPage = { content: [], nextCursor: null, hasMore: false };

function allQuiet() {
  mockGetBoard.mockResolvedValue(board());
  mockGetSummary.mockResolvedValue({ asOf: '2026-09-30', timeZone: 'UTC', days: [], arrivalWindow: { arrivedCount: 0, onTimeCount: 0, onTimeRate: null } });
  mockGetUnscheduled.mockResolvedValue({ content: [], totalElements: 0 });
  mockBell.mockResolvedValue({ pendingForMe: 0, recentlyResolvedMine: 0 });
  mockAttention.mockResolvedValue({ overdue: { amount: 0, count: 0 }, unbilledWorkOrderCount: 0, currency: 'USD' });
  mockOverview.mockResolvedValue({
    asOf: '2026-09-30',
    activeAgreementCount: 0,
    recurringMonthly: 0,
    renewingSoon: { withinDays: 30, count: 0, monthlyValue: 0 },
    visitsThisMonth: { planned: 0, completed: 0, missed: 0, unscheduled: 0 },
    visitsDueSoonUnscheduled: { withinDays: 7, count: 0 },
    currency: 'USD',
  });
  mockPoSummary.mockResolvedValue({ openCount: 0, committedCost: 0 });
  mockActivity.mockResolvedValue(emptyPage);
  mockFinancialActivity.mockResolvedValue(emptyPage);
  mockRegions.mockResolvedValue([]);
  mockWorkOrders.mockResolvedValue({ content: [], totalElements: 0 });
  mockProductivity.mockResolvedValue(productivity());
  mockCredited.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 25 });
  mockChargedCallbacks.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 });
  mockTargets.mockResolvedValue(targets({}));
}

/** A year of targets: `byMonth` maps 1–12 to an amount; the rest have none. */
function targets(byMonth: Record<number, number>) {
  return {
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: byMonth[i + 1] ?? null })),
    updatedBy: null,
    updatedByName: null,
    updatedAt: null,
    firstInvoiceYear: 2025,
  };
}

function techRow(over: Record<string, unknown> = {}) {
  return {
    userId: 't1',
    name: 'Dana Cruz',
    jobs: 12,
    revenue: 30000.01,
    averageTicket: 2500,
    onSiteHours: 48.5,
    invoicedHours: 40,
    revenuePerInvoicedHour: 750,
    excludedHours: { agreement: 6, notBilled: 2.5 },
    firstVisit: { eligible: 10, completed: 7, rate: 0.7 },
    callbacks: 3,
    ...over,
  };
}

function productivity(over: Record<string, unknown> = {}) {
  return {
    periodStart: '2026-09-01',
    asOf: '2026-09-10',
    technicians: [],
    unattributed: { noWorkOrder: { count: 0, amount: 0 }, noTechArrived: { count: 0, amount: 0 } },
    totalRevenue: 0,
    currency: 'USD',
    ...over,
  };
}

describe('DashboardPage — Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(OFFICE_CAPS);
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { id: 'u1', firstName: 'Sam', lastName: 'Lee', capabilities: OFFICE_CAPS },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);
    allQuiet();
  });

  it('greets the user by first name', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /Sam$/ })).toBeInTheDocument();
  });

  it('says so explicitly when nothing needs attention', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Nothing needs you right now')).toBeInTheDocument();
    expect(screen.queryByTestId(/^attention-/)).toBeNull();
  });

  it('shows only the rows with a count, each with its count', async () => {
    mockBell.mockResolvedValue({ pendingForMe: 2, recentlyResolvedMine: 0 });
    mockAttention.mockResolvedValue({ overdue: { amount: 1240, count: 5 }, unbilledWorkOrderCount: 0, currency: 'USD' });
    mockPoSummary.mockResolvedValue({ openCount: 3, committedCost: 0 });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('attention-approvals')).toHaveTextContent('2');
    expect(await screen.findByTestId('attention-overdue')).toHaveTextContent('5');
    expect(screen.getByTestId('attention-po-late')).toHaveTextContent('3');
    expect(screen.queryByTestId('attention-unbilled')).toBeNull();
    expect(screen.queryByTestId('attention-unscheduled')).toBeNull();
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
    expect(mockPoSummary).toHaveBeenCalledWith({ overdue: true });
  });

  it('hides rows the user lacks the capability for instead of disabling them', async () => {
    grant(['EDIT_DISPATCHES']);
    mockBell.mockResolvedValue({ pendingForMe: 2, recentlyResolvedMine: 0 });
    mockAttention.mockResolvedValue({ overdue: { amount: 1240, count: 5 }, unbilledWorkOrderCount: 0, currency: 'USD' });
    mockWorkOrders.mockResolvedValue({ content: [], totalElements: 4 });
    mockGetUnscheduled.mockResolvedValue({ content: [], totalElements: 6 });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('attention-unscheduled')).toHaveTextContent('6');
    expect(screen.queryByTestId('attention-approvals')).toBeNull();
    expect(screen.queryByTestId('attention-overdue')).toBeNull();
    expect(screen.queryByTestId('attention-unbilled')).toBeNull();
    expect(mockBell).not.toHaveBeenCalled();
    expect(mockAttention).not.toHaveBeenCalled();
    expect(mockWorkOrders).not.toHaveBeenCalled();
  });

  it('counts "completed, not invoiced" from the same query as the list it opens', async () => {
    // The deprecated financial count is ignored even when it disagrees.
    mockAttention.mockResolvedValue({ overdue: { amount: 0, count: 0 }, unbilledWorkOrderCount: 99, currency: 'USD' });
    mockWorkOrders.mockResolvedValue({ content: [], totalElements: 4 });

    const { router } = renderWithProviders(<DashboardPage />);

    const row = await screen.findByTestId('attention-unbilled');
    expect(row).toHaveTextContent('4');
    expect(mockWorkOrders).toHaveBeenCalledWith({ unbilled: true, size: 1 });
    await userEvent.setup().click(row);
    await waitFor(() => expect(router.state.location.search).toBe('?status=COMPLETED&unbilled=true'));
  });

  it('releases exactly what the board counts after confirming, with no Undo', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue(board({ pendingRelease: { newCount: 3, changedCount: 2, removedCount: 0, total: 5, techCount: 2 } }));
    mockRelease.mockResolvedValue({ released: 5, newCount: 3, changedCount: 2, removedCount: 0 });

    renderWithProviders(<DashboardPage />);

    const row = await screen.findByTestId('attention-unreleased');
    expect(row).toHaveTextContent('5');
    await user.click(within(row).getByRole('button', { name: 'Release 5' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
    expect(mockRelease.mock.calls[0][0]).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), regionIds: undefined });
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledTimes(1));
  });

  it('hides the scope chip with one region and scopes scheduling reads when one is picked', async () => {
    mockRegions.mockResolvedValue([{ id: 'r1', name: 'East Valley', abbreviation: 'EV', isActive: true, sortOrder: 0 }]);
    const { unmount } = renderWithProviders(<DashboardPage />);
    await screen.findByText('Nothing needs you right now');
    expect(screen.queryByRole('button', { name: 'dashboard.scope.label' })).toBeNull();
    unmount();

    mockRegions.mockResolvedValue([
      { id: 'r1', name: 'East Valley', abbreviation: 'EV', isActive: true, sortOrder: 0 },
      { id: 'r2', name: 'West Valley', abbreviation: 'WV', isActive: true, sortOrder: 1 },
    ]);
    renderWithProviders(<DashboardPage />, { initialPath: '/?region=r2' });
    expect(await screen.findByText('West Valley')).toBeInTheDocument();
    await waitFor(() => expect(mockGetBoard).toHaveBeenLastCalledWith(expect.objectContaining({ regionIds: ['r2'] })));
    expect(mockGetSummary).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    expect(mockGetUnscheduled).toHaveBeenLastCalledWith({ regionIds: ['r2'], size: 1 });
  });

  it('scopes invoices, agreements and activity with the chip, and carries it into the list it opens', async () => {
    mockRegions.mockResolvedValue(TWO_REGIONS);
    mockWorkOrders.mockResolvedValue({ content: [], totalElements: 2 });
    const { router } = renderWithProviders(<DashboardPage />, { initialPath: '/?region=r2' });

    const row = await screen.findByTestId('attention-unbilled');
    expect(mockWorkOrders).toHaveBeenLastCalledWith({ unbilled: true, dispatchRegionIds: ['r2'], size: 1 });
    expect(mockAttention).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    expect(mockOverview).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    await waitFor(() => expect(mockActivity).toHaveBeenLastCalledWith(expect.objectContaining({ regionIds: ['r2'] })));
    expect(mockFinancialActivity).toHaveBeenLastCalledWith(expect.objectContaining({ regionIds: ['r2'] }));
    // POs carry no location: always whole-company.
    expect(mockPoSummary).toHaveBeenLastCalledWith({ overdue: true });

    await userEvent.setup().click(row);
    await waitFor(() => expect(router.state.location.search).toBe('?status=COMPLETED&unbilled=true&region=r2'));
  });

  it('fills the Today KPIs and Who’s where from the day board', async () => {
    renderWithProviders(<DashboardPage />);

    // 1 working (Maya), Dev is off.
    expect(await screen.findByText('dashboard.kpis.techsMeta')).toBeInTheDocument();
    const maya = await screen.findByTestId('tech-t1');
    expect(maya).toHaveTextContent('Maya Ortiz');
    expect(maya).toHaveTextContent('Pham Residence · Phoenix');
    expect(maya).toHaveTextContent('0 / 2');
    expect(screen.queryByTestId('tech-t2')).toBeNull();
  });
});

const bucket = (amount: number, count: number) => ({ amount, count });

describe('DashboardPage — Revenue & productivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(OFFICE_CAPS);
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { id: 'u1', firstName: 'Sam', lastName: 'Lee', capabilities: OFFICE_CAPS },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);
    allQuiet();
    mockRevenue.mockResolvedValue({
      periodStart: '2026-09-01',
      asOf: '2026-09-10',
      billed: 48920,
      billedPreviousPeriod: 40000,
      collected: 24460,
      collectedPreviousPeriod: 20000,
      billedByDay: Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, amount: 4892 })),
      periodEnd: '2026-09-30',
      isCurrent: true,
      comparison: { basis: 'sameDaysLastYear', billed: 40000 },
      currency: 'USD',
    });
    mockReceivables.mockResolvedValue({
      asOf: '2026-09-10',
      outstanding: 1000,
      overdue: bucket(600, 5),
      current: bucket(400, 4),
      days1To30: bucket(300, 3),
      days31To60: bucket(100, 1),
      days61To90: bucket(150, 1),
      days91Plus: bucket(50, 1),
      averageDaysToPay: null,
      currency: 'USD',
    });
    mockQuotes.mockResolvedValue({
      openCount: 23,
      openAmount: 81000,
      sent: bucket(20000, 10),
      viewed: bucket(15000, 8),
      accepted: bucket(8000, 4),
      declined: bucket(2000, 1),
      winRate: 0.8,
      averageDaysToDecision: null,
      currency: 'USD',
    });
  });

  it('hides the tab bar and ignores ?view=rev without the invoice capability', async () => {
    grant(['EDIT_DISPATCHES']);
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

    expect(await screen.findByText('Nothing needs you right now')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(mockRevenue).not.toHaveBeenCalled();
  });

  it('carries the attention total on the Operations tab', async () => {
    mockBell.mockResolvedValue({ pendingForMe: 2, recentlyResolvedMine: 0 });
    mockPoSummary.mockResolvedValue({ openCount: 3, committedCost: 0 });
    renderWithProviders(<DashboardPage />);

    const ops = await screen.findByRole('tab', { name: /dashboard.tabs.operations/ });
    await waitFor(() => expect(ops).toHaveTextContent('5'));
    expect(ops).toHaveAttribute('aria-selected', 'true');
  });

  it('deep-links to the Revenue tab and renders its cards from the dashboard reads', async () => {
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

    expect(await screen.findByRole('tab', { name: 'dashboard.tabs.revenue' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('$48,920')).toBeInTheDocument();
    // Two 7-day buckets through the 10th; the second is still in progress.
    const weeks = await screen.findAllByTestId('revenue-week');
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toHaveTextContent('dashboard.revenue.byWeek.soFar');
    // 61+ folds 61–90 and 91+.
    expect(await screen.findByTestId('aging-days61Plus')).toHaveTextContent('$200');
    // Funnel counts, relative to sent.
    expect(screen.getByTestId('funnel-accepted')).toHaveTextContent('4');
    // Null decision time → the footer is hidden, not "0 days".
    expect(screen.queryByText('dashboard.revenue.quotes.avgDecision')).toBeNull();
    // Scope doesn't apply to anything on this tab.
    expect(screen.queryByRole('button', { name: 'dashboard.scope.label' })).toBeNull();
  });

  describe('targets', () => {
    // The targets read is for the period's year, so pin the clock.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('draws a prorated target rule per week and puts the month’s target beside Revenue', async () => {
      // September has 30 days: the 1st–7th is 7/30 of the month's target.
      mockTargets.mockResolvedValue(targets({ 9: 150000 }));
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

      expect(await screen.findAllByTestId('revenue-target-rule')).toHaveLength(2);
      expect(mockTargets).toHaveBeenCalledWith(2026);
      expect(screen.getByText('dashboard.revenue.kpis.ofTarget')).toBeInTheDocument();
      // The one complete week is scored; the week in progress isn't.
      expect(screen.getByText('dashboard.revenue.chart.weeksHit')).toBeInTheDocument();
      expect(screen.getByText('dashboard.revenue.chart.target')).toBeInTheDocument();
      expect(screen.queryByText('dashboard.revenue.chart.setTargets')).toBeNull();
    });

    it('offers "Set targets" only to someone who can set them, when the period has none', async () => {
      grant([...OFFICE_CAPS, 'MANAGE_REVENUE_TARGETS']);
      const { unmount } = renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });
      const link = await screen.findByRole('link', { name: 'dashboard.revenue.chart.setTargets' });
      expect(link).toHaveAttribute('href', '/settings/revenue-targets?year=2026');
      expect(screen.queryByTestId('revenue-target-rule')).toBeNull();
      expect(screen.queryByText('dashboard.revenue.kpis.ofTarget')).toBeNull();
      unmount();

      grant(OFFICE_CAPS);
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });
      expect(await screen.findAllByTestId('revenue-week')).toHaveLength(2);
      expect(screen.queryByText('dashboard.revenue.chart.setTargets')).toBeNull();
    });

    it('shows no targets when the revenue covers regions rather than the whole company', async () => {
      grant([...OFFICE_CAPS, 'MANAGE_REVENUE_TARGETS']);
      mockTargets.mockResolvedValue(targets({ 9: 150000 }));
      // A user held to their own regions gets a regional answer with no chip set.
      mockRevenue.mockResolvedValue({ ...(await mockRevenue()), regionIds: ['r1'] });
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

      expect(await screen.findAllByTestId('revenue-week')).toHaveLength(2);
      expect(screen.queryByTestId('revenue-target-rule')).toBeNull();
      expect(screen.queryByText('dashboard.revenue.kpis.ofTarget')).toBeNull();
      expect(screen.queryByText('dashboard.revenue.chart.weeksHit')).toBeNull();
      expect(screen.queryByText('dashboard.revenue.chart.setTargets')).toBeNull();
    });
  });

  it('opens the Revenue, Tech productivity and Receivables reports in the same scope', async () => {
    // The picker only offers recent periods, so pin the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    try {
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev&period=2026-08&region=r2' });
      const link = await screen.findByRole('link', { name: 'dashboard.revenue.chart.report' });
      expect(link).toHaveAttribute('href', '/reports/revenue?range=2026-08&from=home&region=r2');
      expect(screen.getByRole('link', { name: 'dashboard.revenue.techs.report' })).toHaveAttribute(
        'href',
        '/reports/tech-productivity?range=2026-08&from=home&region=r2',
      );
      // Receivables are current-only on Home, so the report opens as of today.
      expect(screen.getByRole('link', { name: 'dashboard.revenue.aging.report' })).toHaveAttribute(
        'href',
        '/reports/receivables?asOf=today&from=home&region=r2',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the scope chip on this tab and sends it to every read', async () => {
    mockRegions.mockResolvedValue(TWO_REGIONS);
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev&region=r2' });

    expect(await screen.findByText('West Valley')).toBeInTheDocument();
    await waitFor(() => expect(mockRevenue).toHaveBeenLastCalledWith({ period: undefined, regionIds: ['r2'] }));
    expect(mockReceivables).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    expect(mockQuotes).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    expect(mockOverview).toHaveBeenLastCalledWith({ regionIds: ['r2'] });
    expect(mockProductivity).toHaveBeenLastCalledWith({ period: undefined, regionIds: ['r2'] });
    // Targets are company-wide: not even fetched for a region.
    expect(mockTargets).not.toHaveBeenCalled();
  });

  it('lists each tech with the backend’s numbers and checks the total against Revenue MTD', async () => {
    mockProductivity.mockResolvedValue(
      productivity({
        technicians: [
          techRow(),
          techRow({
            userId: 't2',
            name: null,
            revenue: 15000,
            averageTicket: null,
            excludedHours: { agreement: 0, notBilled: 0 },
            firstVisit: { eligible: 0, completed: 0, rate: null },
            revenuePerInvoicedHour: null,
            callbacks: 0,
          }),
        ],
        unattributed: { noWorkOrder: { count: 2, amount: 2919.99 }, noTechArrived: { count: 1, amount: 1000 } },
        totalRevenue: 48920,
      }),
    );
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

    const rows = await screen.findAllByTestId('tech-row');
    expect(rows[0]).toHaveTextContent('Dana Cruz');
    expect(rows[0]).toHaveTextContent('$30,000.01');
    expect(rows[0]).toHaveTextContent('70%');
    // Only a deleted user comes back without a name.
    expect(within(rows[1]).getByText('dashboard.revenue.techs.formerUser')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('—');
    // Danger at 3+ callbacks, warning under 80% first visit.
    expect(within(rows[0]).getByText('3')).toHaveClass('home-danger');
    expect(within(rows[0]).getByText('70%')).toHaveClass('home-warn');
    expect(screen.getByTestId('unattributed-row')).toHaveTextContent('$3,919.99');
    expect(await screen.findByTestId('techs-check')).toHaveTextContent('dashboard.revenue.techs.matches');
  });

  it('shows "—" for callbacks before tracking started, and dates the header when a period straddles it', async () => {
    mockProductivity.mockResolvedValue(
      productivity({
        periodStart: '2026-09-01',
        asOf: '2026-09-30',
        callbacksTrackedSince: '2026-10-02',
        technicians: [techRow({ callbacks: 0 })],
        totalRevenue: 30000.01,
      }),
    );
    const { unmount } = renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });
    const row = await screen.findByTestId('tech-row');
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('dashboard.revenue.techs.callbacks')).toBeInTheDocument();
    unmount();

    mockProductivity.mockResolvedValue(
      productivity({
        periodStart: '2026-07-01',
        asOf: '2026-10-14',
        callbacksTrackedSince: '2026-10-02',
        technicians: [techRow({ callbacks: 4 })],
        totalRevenue: 30000.01,
      }),
    );
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });
    expect(await screen.findByText('dashboard.revenue.techs.callbacksSince')).toBeInTheDocument();
    expect(within(await screen.findByTestId('tech-row')).getByText('4')).toHaveClass('home-danger');
  });

  it('says so when the total disagrees with Revenue MTD instead of claiming a match', async () => {
    mockProductivity.mockResolvedValue(productivity({ technicians: [techRow()], totalRevenue: 30000.01 }));
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

    expect(await screen.findByTestId('techs-check')).toHaveTextContent('dashboard.revenue.techs.differs');
  });

  it('opens a tech’s credited invoices from the row, with who wrote each one', async () => {
    const user = userEvent.setup();
    mockProductivity.mockResolvedValue(productivity({ technicians: [techRow()], totalRevenue: 30000.01 }));
    mockCredited.mockResolvedValue({
      content: [
        {
          invoiceId: 'i1', invoiceNumber: 'INV-1001', invoiceDate: '2026-09-08', workOrderId: 'w1',
          invoiceTotal: 900, technicianCount: 3, creditedAmount: 300, writtenByUserId: 'u9', writtenByName: 'Pat Moss',
        },
        {
          invoiceId: 'i2', invoiceNumber: 'INV-1000', invoiceDate: '2026-09-02', workOrderId: 'w2',
          invoiceTotal: 450, technicianCount: 1, creditedAmount: 450, writtenByUserId: null, writtenByName: null,
        },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 25,
    });
    mockChargedCallbacks.mockResolvedValue({
      content: [
        { workOrderId: 'w9', workOrderNumber: 'WO-1302', createdAt: '2026-09-29T10:00:00Z', original: { id: 'w1', workOrderNumber: 'WO-1234' } },
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50,
    });
    renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

    await user.click(await screen.findByTestId('tech-row'));
    const lines = await screen.findAllByTestId('credited-invoice');
    expect(mockCredited).toHaveBeenCalledWith('t1', { page: 0, size: 25 });
    expect(lines[0]).toHaveTextContent('INV-1001');
    expect(lines[0]).toHaveTextContent('dashboard.revenue.techs.drawer.share');
    expect(lines[0]).toHaveTextContent('Pat Moss');
    expect(within(lines[0]).getByRole('link', { name: 'INV-1001' })).toHaveAttribute('href', '/work-orders/w1?tab=estimate');
    expect(lines[1]).toHaveTextContent('dashboard.revenue.techs.drawer.solo');
    expect(lines[1]).toHaveTextContent('dashboard.revenue.techs.drawer.notRecorded');
    // The row's 3 callbacks, each with the original job it calls back to.
    expect(mockChargedCallbacks).toHaveBeenCalledWith('t1', { period: undefined, size: 50 });
    const callback = await screen.findByTestId('charged-callback');
    expect(within(callback).getByRole('link', { name: 'WO-1302' })).toHaveAttribute('href', '/work-orders/w9');
    expect(within(callback).getByRole('link', { name: 'WO-1234' })).toHaveAttribute('href', '/work-orders/w1');
  });

  describe('period', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends nothing for this month and labels it to date, with no as-of tags', async () => {
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

      expect(await screen.findByText('$48,920')).toBeInTheDocument();
      expect(mockProductivity).toHaveBeenCalled();
      expect(screen.getByText('dashboard.subToDate')).toBeInTheDocument();
      expect(screen.getByText('dashboard.revenue.kpis.revenueToDate')).toBeInTheDocument();
      expect(screen.getByText('dashboard.revenue.kpis.vsSameDays')).toBeInTheDocument();
      expect(screen.queryByText('dashboard.revenue.asOfToday')).toBeNull();
    });

    it('reads a past period from the URL, sends it to every period read and tags the current-only cards', async () => {
      const { financialDashboardApi, technicianProductivityApi } = await import('../api/setup');
      const getRevenue = vi.spyOn(financialDashboardApi, 'getRevenue');
      const getProductivity = vi.spyOn(technicianProductivityApi, 'get');
      mockRevenue.mockResolvedValue({
        periodStart: '2026-07-01',
        asOf: '2026-09-30',
        periodEnd: '2026-09-30',
        isCurrent: false,
        billed: 300,
        billedPreviousPeriod: 0,
        collected: 0,
        collectedPreviousPeriod: 0,
        billedByDay: [
          { date: '2026-07-03', amount: 100 },
          { date: '2026-08-03', amount: 100 },
          { date: '2026-09-30', amount: 100 },
        ],
        comparison: { basis: null, billed: null },
        currency: 'USD',
      });
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev&period=2026-Q3' });

      // Last quarter: the sub line is just its name.
      expect((await screen.findAllByText('Q3 2026')).length).toBeGreaterThan(0);
      await waitFor(() => expect(getRevenue).toHaveBeenCalledWith({ period: '2026-Q3' }));
      expect(getProductivity).toHaveBeenCalledWith({ period: '2026-Q3' });
      // Monthly bars, none partial in a past period.
      const bars = await screen.findAllByTestId('revenue-week');
      expect(bars.map((b) => b.textContent)).toEqual(['$100Jul', '$100Aug', '$100Sep']);
      expect(screen.getByText('dashboard.revenue.byMonth.title')).toBeInTheDocument();
      // No MTD suffix, no delta, and the reason said plainly.
      expect(screen.getByText('dashboard.revenue.kpis.revenue')).toBeInTheDocument();
      expect(screen.getByText('dashboard.revenue.kpis.noComparison')).toBeInTheDocument();
      // AR, quotes, agreements (KPIs + cards) don't follow the period.
      expect(await screen.findAllByText('dashboard.revenue.asOfToday')).toHaveLength(6);
    });

    it('picks a period from the chip into the URL and refetches for it', async () => {
      const user = userEvent.setup();
      const { financialDashboardApi } = await import('../api/setup');
      const getRevenue = vi.spyOn(financialDashboardApi, 'getRevenue');
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev' });

      await user.click(await screen.findByRole('button', { name: /dashboard.period.label/ }));
      await user.click(await screen.findByRole('option', { name: /September 2026/ }));
      await waitFor(() => expect(getRevenue).toHaveBeenCalledWith({ period: '2026-09' }));
      // Operations ignores it; the chip is Revenue-only.
      await user.click(screen.getByRole('tab', { name: 'dashboard.tabs.operations' }));
      expect(screen.queryByRole('button', { name: /dashboard.period.label/ })).toBeNull();
    });

    it('falls back to this month for a period the picker doesn’t offer', async () => {
      const { financialDashboardApi } = await import('../api/setup');
      const getRevenue = vi.spyOn(financialDashboardApi, 'getRevenue');
      renderWithProviders(<DashboardPage />, { initialPath: '/?view=rev&period=2019-03' });

      expect(await screen.findByText('$48,920')).toBeInTheDocument();
      expect(getRevenue).toHaveBeenCalledWith({ period: undefined });
    });
  });

  it('switches tabs through the URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    await user.click(await screen.findByRole('tab', { name: 'dashboard.tabs.revenue' }));
    expect(await screen.findByText('$48,920')).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
  });
});
