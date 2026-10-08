import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import FilterPullListReport from './FilterPullListReport';

const mockPullList = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    reportsApi: { filterPullList: (...a: unknown[]) => mockPullList(...a) },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () =>
        Promise.resolve([
          { id: 'r1', name: 'East Valley', isActive: true },
          { id: 'r2', name: 'West Valley', isActive: true },
        ]),
    },
    divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([{ id: 'd1', name: 'HVAC', isActive: true }]) },
    workOrderTypesApi: {
      ...actual.workOrderTypesApi,
      getAll: () => Promise.resolve([{ id: 't1', name: 'Maintenance', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showSuccess: (...a: unknown[]) => mockShowSuccess(...a) };
});

const filter = (lengthIn: number, quantity: number, equipmentName = 'RTU-1') => ({
  lengthIn,
  widthIn: 20,
  thicknessIn: 1,
  quantity,
  equipmentName,
});

function stop(id: string, startHour: number, filters: ReturnType<typeof filter>[], day = '2026-10-09') {
  return {
    dispatchId: id,
    workOrderId: `wo-${id}`,
    workOrderNumber: `WO-${id}`,
    arrivalWindowStart: `${day}T${String(startHour).padStart(2, '0')}:00:00Z`,
    arrivalWindowEnd: `${day}T${String(startHour + 2).padStart(2, '0')}:00:00Z`,
    customerName: `Customer ${id}`,
    locationName: null,
    streetAddress: '100 MAIN ST',
    city: 'SPRINGFIELD',
    filters,
  };
}

function pullList(over: Record<string, unknown> = {}) {
  return {
    date: '2026-10-09',
    dateTo: '2026-10-09',
    techs: [
      {
        userId: 'u1',
        name: 'Alice Adams',
        stops: [stop('1', 8, [filter(16, 2)]), stop('2', 13, [])],
        totals: [{ lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2 }],
      },
      {
        userId: 'u2',
        name: null,
        stops: [stop('3', 9, [filter(16, 1, 'AHU'), filter(20, 4, 'AHU')])],
        totals: [
          { lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 1 },
          { lengthIn: 20, widthIn: 20, thicknessIn: 1, quantity: 4 },
        ],
      },
    ],
    totals: [
      { lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 3, equipmentCount: 2 },
      { lengthIn: 20, widthIn: 20, thicknessIn: 1, quantity: 4, equipmentCount: 1 },
    ],
    regionIds: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  mockPullList.mockResolvedValue(pullList());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FilterPullListReport', () => {
  it('opens on tomorrow: a card per tech with what to pull and the stops in board order', async () => {
    renderWithProviders(<FilterPullListReport />, { initialPath: '/reports/filter-pull-list' });

    await waitFor(() =>
      expect(mockPullList).toHaveBeenLastCalledWith({
        date: '2026-10-09',
        dateTo: undefined,
        regionIds: undefined,
        workOrderTypeId: undefined,
        divisionId: undefined,
      }),
    );
    const techs = await screen.findAllByTestId('pull-tech');
    expect(techs).toHaveLength(2);
    expect(within(techs[0]).getByText('Alice Adams')).toBeInTheDocument();
    // Unnamed techs still get a card.
    expect(within(techs[1]).getByText('reports.pullList.unnamed')).toBeInTheDocument();

    const stops = within(techs[0]).getAllByTestId('pull-stop');
    expect(stops).toHaveLength(2);
    expect(stops[0]).toHaveTextContent('8a–10a');
    expect(within(stops[0]).getByRole('link', { name: 'WO-1' })).toHaveAttribute('href', '/work-orders/wo-1');
    expect(stops[0]).toHaveTextContent('100 Main St, Springfield');
    expect(stops[1]).toHaveTextContent('reports.pullList.noFiltersStop');

    const pull = within(techs[0]).getAllByTestId('pull-size');
    expect(pull).toHaveLength(1);
    expect(pull[0]).toHaveTextContent('16×20×1');
    expect(pull[0]).toHaveTextContent('2');

    // The company total counts each job once, with the units carrying each size.
    const totals = screen.getByTestId('pull-totals');
    expect(within(totals).getAllByTestId('pull-size')).toHaveLength(2);
    expect(within(totals).getByText('reports.pullList.companyTotal')).toBeInTheDocument();
  });

  it('asks for picked dates, the scope and the filters in the URL, and dates each stop', async () => {
    mockPullList.mockResolvedValue(
      pullList({
        dateTo: '2026-10-12',
        techs: [
          {
            userId: 'u1',
            name: 'Alice Adams',
            stops: [stop('1', 8, [filter(16, 2)], '2026-10-12')],
            totals: [{ lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2 }],
          },
        ],
        regionIds: ['r2'],
      }),
    );
    renderWithProviders(<FilterPullListReport />, {
      initialPath: '/reports/filter-pull-list?days=2026-10-09..2026-10-12&region=r2&type=t1&division=d1',
    });

    await waitFor(() =>
      expect(mockPullList).toHaveBeenLastCalledWith({
        date: '2026-10-09',
        dateTo: '2026-10-12',
        regionIds: ['r2'],
        workOrderTypeId: 't1',
        divisionId: 'd1',
      }),
    );
    const [s] = await screen.findAllByTestId('pull-stop');
    expect(s).toHaveTextContent('Mon 12');
    expect(await screen.findByText('reports.pullList.regionTotal')).toBeInTheDocument();
  });

  it('says so when nothing is on the board, with nothing to print', async () => {
    mockPullList.mockResolvedValue(pullList({ techs: [], totals: [] }));
    renderWithProviders(<FilterPullListReport />, { initialPath: '/reports/filter-pull-list?days=today' });

    expect(await screen.findByText('reports.pullList.empty.title')).toBeInTheDocument();
    expect(mockPullList).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-10-08' }));
    expect(screen.getByRole('button', { name: 'reports.pullList.print' })).toBeDisabled();
  });

  it('prints, and exports the list', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const user = userEvent.setup();
    renderWithProviders(<FilterPullListReport />, { initialPath: '/reports/filter-pull-list' });

    await screen.findAllByTestId('pull-tech');
    await user.click(screen.getByRole('button', { name: 'reports.pullList.print' }));
    expect(print).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'reports.pullList.export' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockShowSuccess).toHaveBeenCalledWith('reports.pullList.exported');
  });
});
