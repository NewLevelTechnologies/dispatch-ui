import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PaymentsReport from './PaymentsReport';

const mockGet = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    paymentReportApi: { get: (...a: unknown[]) => mockGet(...a) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, amount: 2000, count: 5 }));

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    received: { amount: 61250, count: 143 },
    voided: { amount: 420, count: 2 },
    receivedByDay: days,
    comparison: {
      basis: 'sameDatesLastYear',
      from: '2025-09-01',
      to: '2025-09-30',
      received: { amount: 49000, count: 130 },
      voided: { amount: 0, count: 0 },
    },
    groupBy: 'method',
    groups: [
      { id: 'CHECK', name: null, amount: 40000, count: 80, comparisonAmount: 32000, comparisonCount: 70 },
      { id: 'CREDIT_CARD', name: null, amount: 21250, count: 63, comparisonAmount: 0, comparisonCount: 0 },
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

describe('PaymentsReport', () => {
  it('opens on last month by method: the strip, the chart and a row per method', async () => {
    renderWithProviders(<PaymentsReport />, { initialPath: '/reports/payments' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'method',
      regionIds: undefined,
    });
    expect(within(summary).getByText('$61,250')).toBeInTheDocument();
    expect(within(summary).getByText('+25.0%')).toBeInTheDocument();
    expect(within(summary).getByText('$420')).toBeInTheDocument();
    expect(screen.getAllByTestId('report-bar')).toHaveLength(30);

    const groups = screen.getAllByTestId('report-group');
    expect(groups[0]).toHaveTextContent('payments.methods.check');
    expect(groups[0]).toHaveTextContent('$40,000');
    expect(groups[0]).toHaveTextContent('65%');
    expect(groups[1]).toHaveTextContent('payments.methods.creditCard');
  });

  it('opens a method’s received payments in the report’s scope', async () => {
    mockGet.mockResolvedValue(report({ regionIds: ['r1'] }));
    const user = userEvent.setup();
    const { router } = renderWithProviders(<PaymentsReport />, { initialPath: '/reports/payments?region=r1' });

    const [row] = await screen.findAllByTestId('report-group');
    await user.click(row);
    await waitFor(() => expect(router.state.location.pathname).toBe('/payments'));
    expect(router.state.location.search).toBe('?from=2026-09-01&to=2026-09-30&status=RECEIVED&region=r1&method=CHECK');
  });

  it('shows each deposit day split by method, opening that day', async () => {
    mockGet.mockResolvedValue(
      report({
        groupBy: 'day',
        groups: [
          {
            id: '2026-09-01',
            name: null,
            amount: 2140,
            count: 5,
            comparisonAmount: null,
            comparisonCount: null,
            byMethod: [
              { method: 'CHECK', amount: 1800, count: 3 },
              { method: 'CASH', amount: 340, count: 2 },
            ],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    const { router } = renderWithProviders(<PaymentsReport />, { initialPath: '/reports/payments?group=day' });

    const [row] = await screen.findAllByTestId('report-group');
    expect(row).toHaveTextContent('Tue, Sep 1, 2026');
    expect(row).toHaveTextContent('payments.methods.check $1,800 (3)');
    expect(row).toHaveTextContent('payments.methods.cash $340 (2)');
    await user.click(row);
    await waitFor(() => expect(router.state.location.search).toBe('?from=2026-09-01&to=2026-09-01&status=RECEIVED'));
  });

  it('names payers from the report', async () => {
    mockGet.mockResolvedValue(
      report({
        groupBy: 'payer',
        groups: [{ id: 'c1', name: 'Acme Diner', amount: 900, count: 2, comparisonAmount: 0, comparisonCount: 0 }],
      }),
    );
    const user = userEvent.setup();
    const { router } = renderWithProviders(<PaymentsReport />, { initialPath: '/reports/payments?group=payer' });

    const [row] = await screen.findAllByTestId('report-group');
    expect(row).toHaveTextContent('Acme Diner');
    await user.click(row);
    await waitFor(() => expect(router.state.location.search).toContain('payer=c1'));
  });
});
