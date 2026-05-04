import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import FilterPullListReport from './FilterPullListReport';

const mockFilterPullList = vi.fn();
const mockTypesGetAll = vi.fn();
const mockDivisionsGetAll = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    reportsApi: {
      filterPullList: (...args: unknown[]) => mockFilterPullList(...args),
    },
  };
});

vi.mock('../api/workOrderConfigApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderConfigApi')>();
  return {
    ...actual,
    workOrderTypesApi: { getAll: (...args: unknown[]) => mockTypesGetAll(...args) },
    divisionsApi: { getAll: (...args: unknown[]) => mockDivisionsGetAll(...args) },
  };
});

vi.mock('../api/client');

const mkTaxonomy = (id: string, name: string, isActive = true) => ({
  id,
  tenantId: 't',
  name,
  code: name.toUpperCase(),
  description: null,
  color: null,
  icon: null,
  isActive,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

describe('FilterPullListReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterPullList.mockResolvedValue([]);
    mockTypesGetAll.mockResolvedValue([]);
    mockDivisionsGetAll.mockResolvedValue([]);
  });

  it('defaults to single-day mode for today and queries the backend', async () => {
    renderWithProviders(<FilterPullListReport />);

    await waitFor(() => {
      expect(mockFilterPullList).toHaveBeenCalled();
    });
    const params = mockFilterPullList.mock.calls[0][0];
    expect(params.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params).not.toHaveProperty('scheduledDateFrom');
  });

  it('renders the empty state when the backend returns no entries', async () => {
    mockFilterPullList.mockResolvedValue([]);
    renderWithProviders(<FilterPullListReport />);
    await waitFor(() => {
      expect(screen.getByText(/no filters needed for/i)).toBeInTheDocument();
    });
  });

  it('renders aggregated rows with size, quantity, and equipment count', async () => {
    mockFilterPullList.mockResolvedValue([
      { lengthIn: 16, widthIn: 20, thicknessIn: 1, totalQuantity: 12, equipmentCount: 4 },
      { lengthIn: 20, widthIn: 25, thicknessIn: 1, totalQuantity: 8, equipmentCount: 3 },
    ]);
    renderWithProviders(<FilterPullListReport />);

    await waitFor(() => {
      expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument();
    });
    expect(screen.getByText('20 × 25 × 1')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    // Total filters footer (12 + 8 = 20)
    expect(screen.getByText(/total filters: 20/i)).toBeInTheDocument();
  });

  it('switches to range mode and sends From/To params', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FilterPullListReport />);

    await waitFor(() => expect(mockFilterPullList).toHaveBeenCalled());
    mockFilterPullList.mockClear();

    await user.click(screen.getByRole('button', { name: /^range$/i }));

    await waitFor(() => {
      expect(mockFilterPullList).toHaveBeenCalled();
    });
    const lastCall = mockFilterPullList.mock.calls[mockFilterPullList.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty('scheduledDateFrom');
    expect(lastCall).toHaveProperty('scheduledDateTo');
    expect(lastCall).not.toHaveProperty('scheduledDate');
  });

  it('shows an error banner when the fetch fails', async () => {
    mockFilterPullList.mockRejectedValue(new Error('Backend down'));
    renderWithProviders(<FilterPullListReport />);

    await waitFor(() => {
      expect(screen.getByText(/error loading report/i)).toBeInTheDocument();
    });
  });

  it('omits work order type and division dropdowns when no taxonomy items exist', async () => {
    renderWithProviders(<FilterPullListReport />);
    await waitFor(() => expect(mockFilterPullList).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: /^type$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^division$/i })).not.toBeInTheDocument();
    // The first request should not include the optional filters.
    const params = mockFilterPullList.mock.calls[0][0];
    expect(params).not.toHaveProperty('workOrderTypeId');
    expect(params).not.toHaveProperty('divisionId');
  });

  it('sends workOrderTypeId when a type is picked', async () => {
    mockTypesGetAll.mockResolvedValue([
      mkTaxonomy('t-install', 'Install'),
      mkTaxonomy('t-service', 'Service'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<FilterPullListReport />);

    const typeSelect = await screen.findByRole('combobox', { name: /^type$/i });
    mockFilterPullList.mockClear();
    await user.selectOptions(typeSelect, 't-install');

    await waitFor(() => expect(mockFilterPullList).toHaveBeenCalled());
    const lastCall = mockFilterPullList.mock.calls[mockFilterPullList.mock.calls.length - 1][0];
    expect(lastCall.workOrderTypeId).toBe('t-install');
  });

  it('sends divisionId when a division is picked', async () => {
    mockDivisionsGetAll.mockResolvedValue([
      mkTaxonomy('d-hvac', 'HVAC'),
      mkTaxonomy('d-plumbing', 'Plumbing'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<FilterPullListReport />);

    const divSelect = await screen.findByRole('combobox', { name: /^division$/i });
    mockFilterPullList.mockClear();
    await user.selectOptions(divSelect, 'd-hvac');

    await waitFor(() => expect(mockFilterPullList).toHaveBeenCalled());
    const lastCall = mockFilterPullList.mock.calls[mockFilterPullList.mock.calls.length - 1][0];
    expect(lastCall.divisionId).toBe('d-hvac');
  });

  it('hides retired (inactive) taxonomy entries from the dropdowns', async () => {
    mockTypesGetAll.mockResolvedValue([
      mkTaxonomy('t-install', 'Install', true),
      mkTaxonomy('t-old', 'Retired Type', false),
    ]);
    renderWithProviders(<FilterPullListReport />);

    const typeSelect = await screen.findByRole('combobox', { name: /^type$/i });
    expect(typeSelect).toHaveTextContent('Install');
    expect(typeSelect).not.toHaveTextContent('Retired Type');
  });

  it('clears the type filter when "Any type" is reselected', async () => {
    mockTypesGetAll.mockResolvedValue([mkTaxonomy('t-install', 'Install')]);
    const user = userEvent.setup();
    renderWithProviders(<FilterPullListReport />);

    const typeSelect = await screen.findByRole('combobox', { name: /^type$/i });
    await user.selectOptions(typeSelect, 't-install');
    await waitFor(() => {
      const last = mockFilterPullList.mock.calls[mockFilterPullList.mock.calls.length - 1][0];
      expect(last.workOrderTypeId).toBe('t-install');
    });

    mockFilterPullList.mockClear();
    await user.selectOptions(typeSelect, '');

    await waitFor(() => expect(mockFilterPullList).toHaveBeenCalled());
    const lastCall = mockFilterPullList.mock.calls[mockFilterPullList.mock.calls.length - 1][0];
    expect(lastCall).not.toHaveProperty('workOrderTypeId');
  });
});
