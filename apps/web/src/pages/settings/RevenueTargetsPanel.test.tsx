import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { useHasCapability } from '../../hooks/useCurrentUser';
import RevenueTargetsPanel from './RevenueTargetsPanel';

const mockGet = vi.fn();
const mockReplace = vi.fn();
const mockRevenue = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    revenueTargetsApi: {
      get: (...a: unknown[]) => mockGet(...a),
      replace: (...a: unknown[]) => mockReplace(...a),
    },
    financialDashboardApi: { ...actual.financialDashboardApi, getRevenue: (...a: unknown[]) => mockRevenue(...a) },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, showSuccess: (...a: unknown[]) => mockShowSuccess(...a) };
});

function grant(caps: string[]) {
  vi.mocked(useHasCapability).mockImplementation((cap: string) => caps.includes(cap));
}

const T2026 = [160000, 140000, 140000, 150000, 180000, 215000, 235000, 235000, 210000, 165000, 150000, 170000];
const A2025 = [141000, 120000, 118000, 130000, 160000, 197000, 214000, 211000, 182000, 142000, 128000, 151000];
const A2026 = [163000, 139000, 131000, 148000, 176000, 218000, 241000, 229000, 204800, 38600];

function targets(year: number, amounts: (number | null)[] | null) {
  return {
    year,
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: amounts?.[i] ?? null })),
    updatedBy: amounts ? 'u9' : null,
    updatedByName: amounts ? 'Maria Lopez' : null,
    updatedAt: amounts ? '2026-01-06T15:00:00Z' : null,
    firstInvoiceYear: 2025,
  };
}

/** One billed day mid-month per actual, the way the dashboard read returns them. */
function revenue(year: number, actuals: number[]) {
  return {
    billedByDay: actuals.map((amount, i) => ({ date: `${year}-${String(i + 1).padStart(2, '0')}-05`, amount })),
  };
}

const rowFor = (month: string) =>
  screen.getAllByTestId('target-row').find((r) => r.textContent?.startsWith(month)) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  grant(['VIEW_ALL_INVOICES', 'MANAGE_REVENUE_TARGETS']);
  mockGet.mockImplementation((year: number) =>
    Promise.resolve(targets(year, year === 2026 ? T2026 : null)),
  );
  mockRevenue.mockImplementation(({ period }: { period: string }) =>
    Promise.resolve(period === '2025' ? revenue(2025, A2025) : revenue(2026, A2026)),
  );
  mockReplace.mockImplementation((year: number, months: { month: number; amount: number | null }[]) =>
    Promise.resolve(targets(year, months.map((m) => m.amount))),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RevenueTargetsPanel', () => {
  it('scores closed months, marks this month in progress and leaves future months open', async () => {
    renderWithProviders(<RevenueTargetsPanel />, { initialPath: '/settings/revenue-targets' });

    await waitFor(() => expect(screen.getAllByTestId('target-row')).toHaveLength(12));
    // Actuals come from the dashboard's own year reads.
    await waitFor(() => expect(rowFor('September')).toHaveTextContent('$204,800'));
    expect(mockRevenue).toHaveBeenCalledWith({ period: '2026-YTD' });
    expect(mockRevenue).toHaveBeenCalledWith({ period: '2025' });

    expect(within(rowFor('September')).getByText('settings.revenueTargets.missed')).toBeInTheDocument();
    expect(within(rowFor('August')).getByText('settings.revenueTargets.missed')).toBeInTheDocument();
    expect(within(rowFor('July')).getByText('settings.revenueTargets.hit')).toBeInTheDocument();
    expect(within(rowFor('October')).getByText('settings.revenueTargets.inProgress')).toBeInTheDocument();
    expect(within(rowFor('October')).getByText('settings.revenueTargets.thisMonth')).toBeInTheDocument();
    expect(within(rowFor('November')).queryByText('settings.revenueTargets.hit')).toBeNull();
    expect(screen.getByText('settings.revenueTargets.lastChanged')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('is read-only without the capability to set targets', async () => {
    grant(['VIEW_ALL_INVOICES']);
    renderWithProviders(<RevenueTargetsPanel />, { initialPath: '/settings/revenue-targets' });

    await waitFor(() => expect(screen.getAllByTestId('target-row')).toHaveLength(12));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('starts an empty year from the empty state and saves all twelve months, blanks as null', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RevenueTargetsPanel />, { initialPath: '/settings/revenue-targets?year=2027' });

    expect(await screen.findByTestId('targets-empty')).toHaveTextContent('settings.revenueTargets.empty.title');
    await user.click(screen.getByRole('button', { name: 'settings.revenueTargets.empty.start' }));
    expect(screen.getByTestId('quick-fill')).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox', { name: 'settings.revenueTargets.inputLabel' });
    await user.type(inputs[0], '150000');
    await user.click(screen.getByRole('button', { name: 'settings.revenueTargets.save' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const [year, months] = mockReplace.mock.calls[0];
    expect(year).toBe(2027);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: 1, amount: 150000 });
    expect(months.slice(1).every((m: { amount: number | null }) => m.amount === null)).toBe(true);
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('settings.revenueTargets.saved'));
  });

  it('rejects 0 inline and warns when a closed month changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RevenueTargetsPanel />, { initialPath: '/settings/revenue-targets' });

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    // Editing only a future month: no re-score warning.
    const inputs = screen.getAllByRole('textbox', { name: 'settings.revenueTargets.inputLabel' });
    await user.clear(inputs[10]);
    await user.type(inputs[10], '155000');
    expect(screen.queryByText('settings.revenueTargets.closedWarning')).toBeNull();

    await user.clear(inputs[0]);
    await user.type(inputs[0], '0');
    expect(screen.getByText('settings.revenueTargets.errors.zero')).toBeInTheDocument();
    expect(screen.getByText('settings.revenueTargets.closedWarning')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.revenueTargets.save' })).toBeDisabled();
  });

  it('fills from last year plus growth, leaving closed months alone by default', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RevenueTargetsPanel />, { initialPath: '/settings/revenue-targets' });

    await waitFor(() => expect(rowFor('January')).toHaveTextContent('$141,000'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const growth = screen.getByRole('textbox', { name: 'settings.revenueTargets.fill.growth' });
    await user.clear(growth);
    await user.type(growth, '10');
    await user.click(screen.getByRole('button', { name: 'settings.revenueTargets.fill.apply' }));

    const inputs = screen.getAllByRole('textbox', { name: 'settings.revenueTargets.inputLabel' });
    // January (closed) keeps its target; October onward gets 2025 + 10%.
    expect(inputs[0]).toHaveValue('160,000');
    expect(inputs[9]).toHaveValue('156,000');
    expect(inputs[11]).toHaveValue('166,000');
    expect(screen.queryByText('settings.revenueTargets.closedWarning')).toBeNull();
  });
});
