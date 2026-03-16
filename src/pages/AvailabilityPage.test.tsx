import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AvailabilityPage from './AvailabilityPage';

const mockAvailabilityGetAll = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  availabilityApi: {
    getAll: (...args: unknown[]) => mockAvailabilityGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockAvailability = [
  {
    id: '1',
    userId: 'user1',
    date: '2024-03-20',
    startTime: '2024-03-20T09:00:00Z',
    endTime: '2024-03-20T17:00:00Z',
    status: 'AVAILABLE',
    reason: null,
  },
  {
    id: '2',
    userId: 'user2',
    date: '2024-03-21',
    startTime: '2024-03-21T09:00:00Z',
    endTime: '2024-03-21T17:00:00Z',
    status: 'UNAVAILABLE',
    reason: 'Vacation',
  },
];

describe('AvailabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', async () => {
    mockAvailabilityGetAll.mockResolvedValue([]);

    renderWithProviders(<AvailabilityPage />);

    expect(screen.getByRole('heading', { name: 'Availability' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add availability record/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockAvailabilityGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<AvailabilityPage />);

    expect(screen.getByText('Loading availability...')).toBeInTheDocument();
  });

  it('displays availability in a table', async () => {
    mockAvailabilityGetAll.mockResolvedValue(mockAvailability);

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });

    expect(screen.getByText('user2')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockAvailabilityGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading availability/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockAvailabilityGetAll.mockResolvedValue([]);

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('No availability found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockAvailabilityGetAll.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('No availability found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add availability record/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockAvailabilityGetAll.mockResolvedValue(mockAvailability);
    const user = userEvent.setup();

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
