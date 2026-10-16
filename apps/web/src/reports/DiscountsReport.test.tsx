import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DiscountsReport from './DiscountsReport';

const mockGet = vi.fn();
const mockRows = vi.fn();
const mockExport = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    discountReportApi: {
      get: (...a: unknown[]) => mockGet(...a),
      rows: (...a: unknown[]) => mockRows(...a),
      exportCsv: (...a: unknown[]) => mockExport(...a),
    },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

function row(over: Record<string, unknown> = {}) {
  return {
    adjustmentId: 'a1',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-1042',
    invoiceDate: '2026-09-10',
    billToCustomerId: 'c1',
    billToName: 'Acme Property Mgmt',
    customerId: 'c2',
    customerName: 'Jane Homeowner',
    lineId: 'l1',
    lineDescription: 'Trip fee',
    lineType: 'FEE',
    reasonCode: 'REPAIR_APPROVED',
    reasonNote: null,
    kind: 'WAIVE',
    value: null,
    amount: 89,
    source: 'MANUAL',
    sourceLabel: null,
    givenByUserId: 'u1',
    givenByName: 'Alice Ames',
    automatic: false,
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    member: 'include',
    groupBy: 'reason',
    summary: {
      totalReduced: 200,
      adjustmentCount: 6,
      listPrice: 1000,
      shareOfList: 0.2,
      staff: 96,
      feesWaived: 89,
      memberSavings: 15,
    },
    groups: [
      {
        key: 'FEE_WAIVED',
        label: null,
        automatic: false,
        count: 5,
        amount: 185,
        share: 0.925,
        average: 37,
        sample: [row(), row({ adjustmentId: 'a2', lineDescription: null, lineType: null, amount: 40 })],
      },
      {
        key: 'MEMBER:Silver',
        label: 'Silver',
        automatic: true,
        count: 1,
        amount: 15,
        share: 0.075,
        average: 15,
        sample: [row({ adjustmentId: 'a3', source: 'AGREEMENT', sourceLabel: 'Silver', automatic: true, givenByName: null })],
      },
    ],
    total: { count: 6, amount: 200 },
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

describe('DiscountsReport', () => {
  it('opens on last month by reason: the strip from every source and a row per reason', async () => {
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      member: 'include',
      groupBy: 'reason',
      regionIds: undefined,
    });
    expect(within(summary).getByText('$200')).toBeInTheDocument();
    expect(within(summary).getByText(/^20\.0% of list price/)).toBeInTheDocument();
    expect(within(summary).getByText('$96')).toBeInTheDocument();
    expect(within(summary).getByText('$89')).toBeInTheDocument();
    expect(within(summary).getByText('$15')).toBeInTheDocument();
    // No comparison period on this report.
    expect(screen.queryByText(/reports\.range\.compare\./)).not.toBeInTheDocument();

    const groups = screen.getAllByTestId('report-group');
    expect(groups[0]).toHaveTextContent('Fee waived');
    expect(groups[0]).toHaveTextContent('$185.00');
    expect(groups[0]).toHaveTextContent('93%');
    expect(groups[1]).toHaveTextContent('Member · Silver');
    expect(within(groups[1]).getByText('reports.discounts.automatic')).toBeInTheDocument();
  });

  it('expands a group to its largest adjustments, giver shown when grouped by reason', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts' });

    const [first] = await screen.findAllByTestId('report-group');
    await user.click(first);
    const rows = screen.getAllByTestId('report-group-adjustment');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'INV-1042' })).toHaveAttribute('href', '/invoices/inv-1');
    expect(rows[0]).toHaveTextContent('Acme Property Mgmt');
    expect(rows[0]).toHaveTextContent('Alice Ames');
    expect(rows[0]).toHaveTextContent('−$89.00');
    // A whole-invoice discount has no line.
    expect(rows[1]).toHaveTextContent('Whole invoice');
    // Same columns as the header, cell for cell.
    expect(rows[0].querySelectorAll('td')).toHaveLength(5);
  });

  it('opens every adjustment in a group below the table', async () => {
    mockRows.mockResolvedValue({
      content: [row()],
      page: 0,
      size: 25,
      totalElements: 5,
      totalPages: 1,
      first: true,
      last: true,
    });
    const user = userEvent.setup();
    const { router } = renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts?region=r1' });

    const [first] = await screen.findAllByTestId('report-group');
    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'reports.discounts.table.viewAll' }));

    await waitFor(() => expect(router.state.location.search).toBe('?region=r1&key=FEE_WAIVED'));
    expect(await screen.findAllByTestId('report-adjustment')).toHaveLength(1);
    expect(mockRows).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      member: 'include',
      groupBy: 'reason',
      regionIds: ['r1'],
      groupKey: 'FEE_WAIVED',
      page: 0,
      size: 25,
    });
  });

  it('names the reason when grouped by who gave it', async () => {
    mockGet.mockResolvedValue(
      report({
        groupBy: 'givenBy',
        groups: [
          { key: 'u1', label: 'Alice Ames', automatic: false, count: 1, amount: 89, share: 1, average: 89, sample: [row()] },
          { key: 'AUTOMATIC', label: null, automatic: true, count: 1, amount: 15, share: 0, average: 15, sample: [] },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts?group=givenBy' });

    const groups = await screen.findAllByTestId('report-group');
    expect(groups[0]).toHaveTextContent('Alice Ames');
    expect(groups[1]).toHaveTextContent('Automatic');
    await user.click(groups[0]);
    // A waive on a fee line reads as a fee waive, whatever its reason code.
    expect(screen.getByTestId('report-group-adjustment')).toHaveTextContent('Fee waived');
  });

  it('asks without member savings when excluded', async () => {
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts?member=exclude' });

    await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ member: 'exclude' }));
  });

  it('downloads the server’s CSV for the range', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    mockExport.mockResolvedValue(new Blob(['invoice\r\n'], { type: 'text/csv' }));
    const user = userEvent.setup();
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: /reports\.revenue\.export/ }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(mockExport).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30', member: 'include', regionIds: undefined });
  });

  it('says so when nothing was discounted', async () => {
    mockGet.mockResolvedValue(
      report({
        summary: { totalReduced: 0, adjustmentCount: 0, listPrice: 0, shareOfList: null, staff: 0, feesWaived: 0, memberSavings: 0 },
        groups: [],
        total: { count: 0, amount: 0 },
      }),
    );
    renderWithProviders(<DiscountsReport />, { initialPath: '/reports/discounts' });

    expect(await screen.findByText('reports.discounts.empty.title')).toBeInTheDocument();
    expect(screen.queryByTestId('report-group')).not.toBeInTheDocument();
  });
});
