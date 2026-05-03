import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import FilterPullListReport from './FilterPullListReport';

const mockFilterPullList = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    reportsApi: {
      filterPullList: (...args: unknown[]) => mockFilterPullList(...args),
    },
  };
});

vi.mock('../api/client');

describe('FilterPullListReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterPullList.mockResolvedValue([]);
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
});
