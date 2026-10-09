import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CallbacksReport from './CallbacksReport';

const mockReport = vi.fn();
const mockList = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    workOrderReportsApi: {
      ...actual.workOrderReportsApi,
      callbacks: (...a: unknown[]) => mockReport(...a),
      callbackList: (...a: unknown[]) => mockList(...a),
    },
    userApi: {
      ...actual.userApi,
      getAll: () => Promise.resolve([{ id: 'u1', firstName: 'Lena', lastName: 'Lead', email: 'l@x.com' }]),
    },
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: () => Promise.resolve([{ id: 'ty1', name: 'Repair', isActive: true }]) },
    divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([]) },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: () => Promise.resolve([]) },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    count: 12,
    averageDaysBetween: 6.5,
    callbacksTrackedSince: '2026-03-01',
    comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30', count: 15, averageDaysBetween: 8 },
    groupBy: 'technician',
    groups: [
      { id: 'u1', count: 4, comparisonCount: 6 },
      { id: null, count: 1, comparisonCount: 0 },
    ],
    regionIds: null,
    ...over,
  };
}

const row = {
  id: 'w9',
  workOrderNumber: 'WO-1302',
  createdOn: '2026-09-29',
  createdByName: 'Cara CSR',
  linkedByName: 'Cara CSR',
  linkedAt: '2026-09-29T15:00:00',
  workOrderTypeId: 'ty1',
  serviceLocation: { name: 'Main St', streetAddress: '100 MAIN ST', city: 'SPRINGFIELD' },
  original: { id: 'w1', workOrderNumber: 'WO-1234', completedDate: '2026-09-21', workOrderTypeId: 'ty1' },
  chargedTechnicians: [{ userId: 'u1', name: 'Lena Lead' }, { userId: 'u2', name: 'Max Mate' }],
  daysBetween: 8,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  mockReport.mockResolvedValue(report());
  mockList.mockResolvedValue({ content: [row], totalElements: 1, totalPages: 1, number: 0, size: 25 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CallbacksReport', () => {
  it('opens on last month by tech, listing each callback with its original', async () => {
    renderWithProviders(<CallbacksReport />, { initialPath: '/reports/callbacks' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockReport).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: 'sameDatesLastYear',
      groupBy: 'technician',
      regionIds: undefined,
    });
    expect(within(summary).getByText('12')).toBeInTheDocument();
    // Fewer callbacks is good news.
    expect(within(summary).getByText('−20.0%')).toHaveClass('up');
    expect(within(summary).getByText('6.5 d')).toBeInTheDocument();

    const groups = screen.getAllByTestId('report-group');
    await waitFor(() => expect(groups[0]).toHaveTextContent('Lena Lead'));
    expect(groups[1]).toHaveTextContent('reports.callbacks.nobodyArrived');

    const [line] = await screen.findAllByTestId('callback-row');
    expect(within(line).getByRole('link', { name: 'WO-1302' })).toHaveAttribute('href', '/work-orders/w9');
    expect(within(line).getByRole('link', { name: 'WO-1234' })).toHaveAttribute('href', '/work-orders/w1');
    expect(line).toHaveTextContent('Repair · Main St · 100 Main St');
    expect(line).toHaveTextContent('Lena Lead, Max Mate');
    expect(line).toHaveTextContent('8');
  });

  it('lists one tech’s callbacks when their row is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CallbacksReport />, { initialPath: '/reports/callbacks' });

    const [first] = await screen.findAllByTestId('report-group');
    await user.click(first);
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ technicianId: 'u1', page: 0 })));
    expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters by the original job’s type from the type grouping', async () => {
    mockReport.mockResolvedValue(report({ groupBy: 'workOrderType', groups: [{ id: 'ty1', count: 12, comparisonCount: 15 }] }));
    const user = userEvent.setup();
    renderWithProviders(<CallbacksReport />, { initialPath: '/reports/callbacks?group=workOrderType' });

    const [first] = await screen.findAllByTestId('report-group');
    await user.click(first);
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ workOrderTypeId: 'ty1' })));
  });

  it('says when the range starts before callbacks were tracked', async () => {
    mockReport.mockResolvedValue(report({ callbacksTrackedSince: '2026-09-15', comparison: null }));
    renderWithProviders(<CallbacksReport />, { initialPath: '/reports/callbacks' });

    expect(await screen.findByText(/reports.callbacks.untracked/)).toBeInTheDocument();
  });
});
