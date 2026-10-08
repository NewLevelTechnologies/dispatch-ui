import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { useHasCapability } from '../hooks/useCurrentUser';
import AgreementsPage from './AgreementsPage';

const mockListPage = vi.fn();
const mockVisits = vi.fn();
const mockOverview = vi.fn();
const mockFacets = vi.fn();
const mockCancel = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    agreementApi: {
      ...actual.agreementApi,
      listPage: (...a: unknown[]) => mockListPage(...a),
      unscheduledVisits: (...a: unknown[]) => mockVisits(...a),
      getOverview: (...a: unknown[]) => mockOverview(...a),
      facets: (...a: unknown[]) => mockFacets(...a),
      cancel: (...a: unknown[]) => mockCancel(...a),
    },
    agreementPlanApi: {
      ...actual.agreementPlanApi,
      getAll: () => Promise.resolve({ content: [{ id: 'p1', name: 'Gold' }], totalElements: 1, totalPages: 1, number: 0, size: 200 }),
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

const page = <T,>(content: T[], totalElements = content.length) => ({
  content,
  totalElements,
  totalPages: 1,
  number: 0,
  size: 50,
});

function agreement(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    agreementNumber: 'SA-0042',
    customer: { id: 'c1', name: 'Acme Diner' },
    name: 'Kitchen PM',
    kind: 'VISIT',
    classification: 'CONTRACT',
    status: 'ACTIVE',
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    autoRenew: true,
    monthlyValue: 250,
    coverageLocationCount: 3,
    nextVisitDue: '2026-10-20',
    overdueVisitCount: 2,
    plan: { id: 'p1', name: 'Gold' },
    billing: { mode: 'FIXED_SCHEDULE', amount: 750, cadenceUnit: 'QUARTER', cadenceInterval: 1 },
    primaryLocation: null,
    visitsThisTerm: { planned: 12, completed: 7 },
    nextVisit: {
      windowStart: '2026-10-20',
      windowEnd: '2026-11-19',
      workOrderId: 'wo9',
      workOrderNumber: 'WO-4233',
      dispatch: null,
    },
    endedOn: null,
    createdByName: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function visit(over: Record<string, unknown> = {}) {
  return {
    obligationId: 'o1',
    agreementId: 'a1',
    agreementNumber: 'SA-0042',
    agreementName: 'Kitchen PM',
    customer: { id: 'c1', name: 'Acme Diner' },
    serviceLocation: { id: 'l1', name: 'Main Street Shop', streetAddress: '100 MAIN ST', city: 'SPRINGFIELD' },
    visitTemplateLabel: 'Spring PM',
    windowStart: '2026-09-01',
    windowEnd: '2026-09-30',
    status: 'MATERIALIZED',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1042',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  mockListPage.mockResolvedValue(page([agreement()]));
  mockFacets.mockResolvedValue({
    statusCounts: { DRAFT: 1, ACTIVE: 12, SUSPENDED: 0, EXPIRED: 3, CANCELLED: 2 },
    renewing: 2,
    renewingWithinDays: 30,
    visitsBehind: 4,
    noBilling: 1,
  });
  mockCancel.mockResolvedValue({});
  // Monthly value is invoice money.
  vi.mocked(useHasCapability).mockImplementation((cap: string) => cap === 'VIEW_ALL_INVOICES');
  mockVisits.mockResolvedValue(page([visit()]));
  mockOverview.mockResolvedValue({
    asOf: '2026-10-08',
    activeAgreementCount: 12,
    recurringMonthly: 3000,
    renewingSoon: { withinDays: 30, count: 2, monthlyValue: 500 },
    visitsThisMonth: { planned: 0, completed: 0, missed: 0, unscheduled: 0 },
    visitsDueSoonUnscheduled: { withinDays: 7, count: 1 },
    currency: 'USD',
    regionIds: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AgreementsPage', () => {
  it('lists the active agreements by customer, each opening its agreement', async () => {
    const { router } = renderWithProviders(<AgreementsPage />, { initialPath: '/agreements' });

    const [row] = await screen.findAllByTestId('agreement-row');
    expect(mockListPage).toHaveBeenCalledWith(
      expect.objectContaining({ q: undefined, status: ['ACTIVE'], sort: 'customerName,asc', page: 0, size: 50 }),
    );
    expect(mockFacets).toHaveBeenCalledWith(expect.objectContaining({ status: ['ACTIVE'], page: undefined }));
    expect(row).toHaveTextContent('Kitchen PM');
    expect(row).toHaveTextContent('SA-0042');
    expect(row).toHaveTextContent('agreements.list.cell.plan');
    expect(row).toHaveTextContent('Acme Diner');
    expect(row).toHaveTextContent('Dec 31, 2026');
    // Next visit has a work order but no dispatch.
    expect(within(row).getByText('agreements.list.cell.unscheduled')).toBeInTheDocument();
    expect(row).toHaveTextContent('WO-4233');
    await userEvent.setup().click(row);
    await waitFor(() => expect(router.state.location.pathname).toBe('/agreements/a1'));
    expect(router.state.location.search).toBe('?from=agreements');
  });

  it('shows /mo with the real cadence beneath, behind visits, and the chip counts', async () => {
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements' });

    const [row] = await screen.findAllByTestId('agreement-row');
    expect(row).toHaveTextContent('$250.00agreements.list.cell.perMonth');
    expect(row).toHaveTextContent('$750.00 / qtr');
    expect(row).toHaveTextContent('agreements.list.cell.visitsOf');
    expect(within(row).getByText('agreements.list.cell.behind')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'agreements.list.filters.visitsBehind' })).toHaveTextContent('4');
  });

  it('opens on Home’s renewing-soon set in Home’s scope, soonest first', async () => {
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements?renewing=30&region=r2' });

    await screen.findAllByTestId('agreement-row');
    expect(mockListPage).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ACTIVE'], renewingWithinDays: 30, regionIds: ['r2'], sort: 'termEnd,asc' }),
    );
    expect(mockOverview).toHaveBeenCalledWith({ regionIds: ['r2'] });
    expect(screen.getByRole('button', { name: 'agreements.list.filters.renewing' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('tones a manual renewal due soon as a warning and an auto-renewal as accent', async () => {
    mockListPage.mockResolvedValue(
      page([
        agreement({ id: 'a1', termEnd: '2026-10-22', autoRenew: false }),
        agreement({ id: 'a2', termEnd: '2026-10-22', autoRenew: true }),
      ]),
    );
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements' });

    const rows = await screen.findAllByTestId('agreement-row');
    expect(within(rows[0]).getByText(/agreements.list.cell.renewsIn/)).toHaveClass('ag-warn');
    expect(within(rows[1]).getByText(/agreements.list.cell.renewsIn/)).toHaveClass('ag-accent');
  });

  it('dims an ended agreement’s identity and strikes a cancelled status', async () => {
    mockListPage.mockResolvedValue(page([agreement({ status: 'CANCELLED', endedOn: '2026-08-30', monthlyValue: null })]));
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements?status=any' });

    const [row] = await screen.findAllByTestId('agreement-row');
    expect(within(row).getByText('Kitchen PM').closest('td')).toHaveClass('ag-dim');
    expect(within(row).getByText('agreements.list.status.CANCELLED').closest('.pill')).toHaveClass('ag-cancelled');
    expect(row).toHaveTextContent('agreements.list.cell.cancelledOn');
  });

  it('offers billing setup when there is none, and cancels from the row', async () => {
    mockListPage.mockResolvedValue(page([agreement({ billing: null, monthlyValue: null })]));
    const user = userEvent.setup();
    const { router } = renderWithProviders(<AgreementsPage />, { initialPath: '/agreements' });

    const [row] = await screen.findAllByTestId('agreement-row');
    expect(row).toHaveTextContent('agreements.list.cell.noBilling');
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'agreements.list.menu.cancel' }));
    await user.click(await screen.findByRole('button', { name: 'agreements.list.menu.cancelConfirm' }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('a1'));

    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'agreements.list.menu.setUpBilling' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agreements/a1'));
    expect(router.state.location.search).toBe('?from=agreements&billing=setup');
  });

  it('queues the visits waiting on a dispatch, with Schedule opening the booking', async () => {
    mockVisits.mockResolvedValue(
      page([visit(), visit({ obligationId: 'o2', status: 'PENDING', workOrderId: null, workOrderNumber: null })]),
    );
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements?view=visits&region=r1' });

    const rows = await screen.findAllByTestId('visit-row');
    expect(mockVisits).toHaveBeenCalledWith({ withinDays: 7, regionIds: ['r1'], page: 0, size: 50 });
    expect(rows[0]).toHaveTextContent('Sep 1 – 30');
    expect(rows[0]).toHaveTextContent('100 Main St, Springfield');
    expect(within(rows[0]).getByText('agreements.visits.state.overdue')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: 'agreements.visits.schedule' })).toHaveAttribute(
      'href',
      `/work-orders/wo1?from=agreements&back=${encodeURIComponent('view=visits&region=r1')}&schedule=new`,
    );
    // No work order yet: nothing to schedule, and the frontend doesn't make one.
    expect(within(rows[1]).queryByRole('link', { name: 'agreements.visits.schedule' })).toBeNull();
    expect(rows[1]).toHaveTextContent('agreements.visits.pending');
  });

  it('says so when every visit due soon has a dispatch', async () => {
    mockVisits.mockResolvedValue(page([]));
    renderWithProviders(<AgreementsPage />, { initialPath: '/agreements?view=visits' });
    expect(await screen.findByText('agreements.visits.empty.title')).toBeInTheDocument();
  });
});
