import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AgreementsReport from './AgreementsReport';

const mockReport = vi.fn();
const mockEvents = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    workOrderReportsApi: {
      ...actual.workOrderReportsApi,
      agreements: (...a: unknown[]) => mockReport(...a),
      agreementEvents: (...a: unknown[]) => mockEvents(...a),
    },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: () => Promise.resolve([]) },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const line = (count: number, monthly: number) => ({ count, monthly });

function bridge(over: Record<string, unknown> = {}) {
  return {
    recurringMonthlyAtStart: 18380,
    recurringMonthlyAtEnd: 18350,
    new: line(3, 420),
    renewed: { count: 5, auto: 4, manual: 1, monthly: 30 },
    repriced: line(1, 25),
    suspended: line(1, -150),
    resumed: line(0, 0),
    cancelled: line(2, -260),
    expired: line(1, -95),
    returnedToDraft: line(0, 0),
    visits: { planned: 140, completed: 96, missed: 4 },
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    eventsTrackedSince: '2026-01-01',
    ...bridge(),
    comparison: null,
    currency: 'USD',
    regionIds: null,
    ...over,
  };
}

const event = {
  id: 'e1',
  agreementId: 'a1',
  agreementNumber: 'SA-0042',
  customerName: 'Acme Diner',
  kind: 'CANCELLED',
  autoRenewed: null,
  occurredOn: '2026-09-12',
  userId: 'u1',
  userName: 'Pat Office',
  monthlyValueBefore: 130,
  monthlyValueAfter: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockReport.mockResolvedValue(report());
  mockEvents.mockResolvedValue({ content: [event], totalElements: 1, totalPages: 1, number: 0, size: 25 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AgreementsReport', () => {
  it('draws the bridge from start to end, signed, with the events behind it', async () => {
    renderWithProviders(<AgreementsReport />, { initialPath: '/reports/agreements' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30', compare: 'sameDatesLastYear', regionIds: undefined });
    expect(within(summary).getByText('$18,350.00')).toBeInTheDocument();
    expect(within(summary).getByText('−$30.00')).toBeInTheDocument();
    expect(within(summary).getByText('+$420.00')).toBeInTheDocument();
    expect(within(summary).getByText('69%')).toBeInTheDocument();

    expect(screen.getByTestId('bridge-start')).toHaveTextContent('$18,380.00');
    expect(screen.getByTestId('bridge-cancelled')).toHaveTextContent('−$260.00');
    expect(screen.getByTestId('bridge-renewed')).toHaveTextContent('reports.agreements.bridge.renewedSub');
    expect(screen.getByTestId('bridge-end')).toHaveTextContent('$18,350.00');

    const [row] = await screen.findAllByTestId('agreement-event');
    expect(within(row).getByRole('link', { name: 'SA-0042' })).toHaveAttribute('href', '/agreements/a1');
    expect(row).toHaveTextContent('reports.agreements.kind.CANCELLED');
    expect(row).toHaveTextContent('Pat Office');
    expect(row).toHaveTextContent('−$130.00');
  });

  it('lists one line’s events when it is picked, and not an empty one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementsReport />, { initialPath: '/reports/agreements' });

    await user.click(await screen.findByTestId('bridge-cancelled'));
    await waitFor(() => expect(mockEvents).toHaveBeenLastCalledWith(expect.objectContaining({ kind: ['CANCELLED'], page: 0 })));
    expect(screen.getByTestId('bridge-cancelled')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bridge-resumed')).not.toHaveAttribute('aria-pressed');
  });

  it('says when history begins and leaves the unknown start blank', async () => {
    mockReport.mockResolvedValue(report({ recurringMonthlyAtStart: null, eventsTrackedSince: '2026-09-15' }));
    renderWithProviders(<AgreementsReport />, { initialPath: '/reports/agreements' });

    expect(await screen.findByText(/reports.agreements.untracked/)).toBeInTheDocument();
    expect(screen.getByTestId('bridge-start')).toHaveTextContent('—');
    expect(within(screen.getByTestId('report-summary')).getByText(/reports.agreements.summary.netUnknown/)).toBeInTheDocument();
    // The comparison was asked for but starts before history: say that, not "no data".
    expect(within(screen.getByTestId('report-summary')).getByText(/reports.agreements.noComparison/)).toBeInTheDocument();
  });
});
