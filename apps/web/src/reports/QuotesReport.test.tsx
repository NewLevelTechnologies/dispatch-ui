import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import QuotesReport from './QuotesReport';

const mockGet = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    quoteReportApi: { get: (...a: unknown[]) => mockGet(...a) },
    userApi: {
      ...actual.userApi,
      getAll: () => Promise.resolve([{ id: 'u1', firstName: 'Sam', lastName: 'Seller', email: 's@x.com' }]),
    },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const b = (count: number, amount: number) => ({ count, amount });

function figures(over: Record<string, unknown> = {}) {
  return {
    sent: b(31, 48200),
    viewed: b(25, 40100),
    accepted: b(12, 21000),
    declined: b(5, 6400),
    expired: b(2, 1800),
    open: b(12, 19000),
    winRate: 0.706,
    averageDaysToDecision: 3.4,
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    ...figures(),
    comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30', ...figures({ sent: b(25, 40000), winRate: 0.65, averageDaysToDecision: 4.1 }) },
    groupBy: 'sender',
    groups: [
      { id: 'u1', ...figures({ sent: b(20, 30000), winRate: 0.75 }), comparisonSent: b(15, 20000), comparisonAccepted: b(6, 9000), comparisonWinRate: 0.6 },
      { id: null, ...figures({ sent: b(11, 18200), winRate: null }), comparisonSent: b(0, 0), comparisonAccepted: b(0, 0), comparisonWinRate: null },
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
  mockGet.mockResolvedValue(report());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QuotesReport', () => {
  it('opens on last month by sender: the strip, the funnel and a row per sender', async () => {
    renderWithProviders(<QuotesReport />, { initialPath: '/reports/quotes' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'sender',
      regionIds: undefined,
    });
    expect(within(summary).getByText('31')).toBeInTheDocument();
    expect(within(summary).getByText('+24.0%')).toBeInTheDocument();
    expect(within(summary).getByText('70.6%')).toBeInTheDocument();
    expect(within(summary).getByText('+5.6 pts')).toBeInTheDocument();
    expect(within(summary).getByText('3.4 d')).toBeInTheDocument();

    // Each status opens the list on the same quotes; viewed has no list filter.
    expect(within(screen.getByTestId('funnel-accepted')).getByRole('link', { name: '12' })).toHaveAttribute(
      'href',
      '/quotes?sentFrom=2026-09-01&sentTo=2026-09-30&status=ACCEPTED',
    );
    expect(within(screen.getByTestId('funnel-open')).getByRole('link', { name: '12' })).toHaveAttribute(
      'href',
      '/quotes?sentFrom=2026-09-01&sentTo=2026-09-30&status=SENT',
    );
    expect(within(screen.getByTestId('funnel-viewed')).queryByRole('link')).toBeNull();

    const groups = screen.getAllByTestId('report-group');
    await waitFor(() => expect(groups[0]).toHaveTextContent('Sam Seller'));
    expect(groups[0]).toHaveTextContent('75.0%');
    expect(groups[0]).toHaveTextContent('+15.0 pts');
    expect(groups[1]).toHaveTextContent('reports.quotes.noSender');
  });

  it('opens a sender’s quotes in the scope it was asked for', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<QuotesReport />, { initialPath: '/reports/quotes?region=r1' });

    const [row] = await screen.findAllByTestId('report-group');
    await user.click(row);
    await waitFor(() => expect(router.state.location.pathname).toBe('/quotes'));
    expect(router.state.location.search).toBe('?sentFrom=2026-09-01&sentTo=2026-09-30&region=r1&sender=u1');
  });

  it('says so when nothing went out in the range', async () => {
    mockGet.mockResolvedValue(report({ ...figures({ sent: b(0, 0), winRate: null, averageDaysToDecision: null }), groups: [] }));
    renderWithProviders(<QuotesReport />, { initialPath: '/reports/quotes' });

    expect(await screen.findByText('reports.quotes.empty.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reports.revenue.export/ })).toBeDisabled();
  });
});
