import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import SalesTaxReport from './SalesTaxReport';

const mockGet = vi.fn();
const mockExport = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    salesTaxReportApi: {
      get: (...a: unknown[]) => mockGet(...a),
      exportCsv: (...a: unknown[]) => mockExport(...a),
    },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: () => Promise.resolve([{ id: 'r1', name: 'East Valley', isActive: true }]),
    },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ timezone: 'UTC' }) },
  };
});

const travis = {
  key: 'j1',
  jurisdictionId: 'j1',
  name: 'Travis County',
  rates: [0.0825],
  currentRate: 0.0825,
  gross: 590,
  taxable: 200,
  nonTaxable: 300,
  exempt: 90,
  tax: 16.5,
  classes: [
    { taxClass: 'MATERIALS', taxedHere: true, gross: 200, taxable: 200, nonTaxable: 0, tax: 16.5 },
    { taxClass: 'LABOR', taxedHere: false, gross: 300, taxable: 0, nonTaxable: 300, tax: 0 },
  ],
  exemptAccounts: { gross: 90, tax: 0 },
};

function report(over: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    basis: 'sent',
    total: { gross: 790, taxable: 200, nonTaxable: 500, exempt: 90, tax: 16.5 },
    jurisdictionCount: 2,
    jurisdictions: [
      travis,
      {
        key: 'j2',
        jurisdictionId: 'j2',
        name: 'Hays County',
        rates: [null, 0.08],
        currentRate: 0.08,
        gross: 100,
        taxable: 0,
        nonTaxable: 100,
        exempt: 0,
        tax: 0,
        classes: [],
        exemptAccounts: null,
      },
      {
        key: 'LEGACY',
        jurisdictionId: null,
        name: null,
        rates: [],
        currentRate: null,
        gross: 100,
        taxable: 0,
        nonTaxable: 100,
        exempt: 0,
        tax: 0,
        classes: [],
        exemptAccounts: null,
      },
    ],
    invoiceTaxTotal: 16.5,
    warnings: [],
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

describe('SalesTaxReport', () => {
  it('opens on last month on the invoice-date basis: the strip and a row per jurisdiction', async () => {
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax' });

    const summary = await screen.findByTestId('report-summary');
    expect(mockGet).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30', basis: 'sent', regionIds: undefined });
    expect(within(summary).getByText('$790.00')).toBeInTheDocument();
    expect(within(summary).getByText('$590.00')).toBeInTheDocument();
    expect(within(summary).getByText('$16.50')).toBeInTheDocument();

    const rows = screen.getAllByTestId('report-jurisdiction');
    expect(rows[0]).toHaveTextContent('Travis County');
    expect(rows[0]).toHaveTextContent('8.25%');
    expect(rows[0]).toHaveTextContent('$16.50');
    // The rate changed in range: both, the unset one flagged.
    expect(rows[1]).toHaveTextContent('Not set / 8%');
    expect(within(rows[1]).getByText('Not set')).toHaveClass('text-warning-fg');
    expect(rows[2]).toHaveTextContent('Before tax setup');
  });

  it('splits a jurisdiction by tax class, in class order, then its exempt accounts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax' });

    const [travisRow, , legacy] = await screen.findAllByTestId('report-jurisdiction');
    await user.click(travisRow);
    const classes = screen.getAllByTestId('report-tax-class');
    expect(classes).toHaveLength(3);
    expect(classes[0]).toHaveTextContent('Labor');
    expect(classes[0]).toHaveTextContent('not taxed here');
    expect(classes[1]).toHaveTextContent('Materials');
    expect(classes[1]).not.toHaveTextContent('not taxed here');
    expect(classes[2]).toHaveTextContent('reports.salesTax.exemptAccounts');
    // Same cells as the header.
    expect(classes[0].querySelectorAll('td')).toHaveLength(8);

    // LEGACY has no class split to open.
    await user.click(legacy);
    expect(screen.getAllByTestId('report-tax-class')).toHaveLength(3);
  });

  it('warns about a jurisdiction with no rate, with a link to set it', async () => {
    mockGet.mockResolvedValue(
      report({
        warnings: [{ code: 'NO_RATE', jurisdictionId: 'j3', jurisdictionName: 'Bastrop', amount: 420 }],
      }),
    );
    vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('MANAGE_PRICING'));
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax' });

    expect(
      await screen.findByText('Bastrop has no rate set, so $420.00 of taxable sales collected no tax.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set rate' })).toHaveAttribute('href', '/settings/tax');
  });

  it('says a rate set since, and hides the link without pricing access', async () => {
    mockGet.mockResolvedValue(
      report({
        warnings: [{ code: 'NO_RATE', jurisdictionId: 'j2', jurisdictionName: 'Hays County', amount: 50 }],
      }),
    );
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax' });

    expect(await screen.findByText(/It’s now set to 8%\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Set rate' })).not.toBeInTheDocument();
  });

  it('downloads the server’s CSV for the range', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    mockExport.mockResolvedValue(new Blob(['invoice\r\n'], { type: 'text/csv' }));
    const user = userEvent.setup();
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax?region=r1' });

    await screen.findByTestId('report-summary');
    await user.click(screen.getByRole('button', { name: /reports\.revenue\.export/ }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(mockExport).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30', basis: 'sent', regionIds: ['r1'] });
  });

  it('says so when nothing was billed', async () => {
    mockGet.mockResolvedValue(
      report({
        total: { gross: 0, taxable: 0, nonTaxable: 0, exempt: 0, tax: 0 },
        jurisdictionCount: 0,
        jurisdictions: [],
        invoiceTaxTotal: 0,
      }),
    );
    renderWithProviders(<SalesTaxReport />, { initialPath: '/reports/sales-tax' });

    expect(await screen.findByText('reports.salesTax.empty.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reports\.revenue\.export/ })).toBeDisabled();
  });
});
