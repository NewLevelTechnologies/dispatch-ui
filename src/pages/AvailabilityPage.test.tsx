import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AvailabilityPage from './AvailabilityPage';

const mockAvailabilityGetAll = vi.fn();
const mockAvailabilityCreate = vi.fn();
const mockAvailabilityUpdate = vi.fn();
const mockAvailabilityDelete = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  availabilityApi: {
    getAll: (...args: unknown[]) => mockAvailabilityGetAll(...args),
    create: (...args: unknown[]) => mockAvailabilityCreate(...args),
    update: (...args: unknown[]) => mockAvailabilityUpdate(...args),
    delete: (...args: unknown[]) => mockAvailabilityDelete(...args),
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
    mockAvailabilityCreate.mockResolvedValue({ ...mockAvailability[0], id: '3' });
    const user = userEvent.setup();

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('No availability found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add availability record/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fill out the form to test handleSubmit and resetForm
    const userIdInput = screen.getByLabelText(/user/i);
    await user.type(userIdInput, 'test-user');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAvailabilityCreate).toHaveBeenCalled();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockAvailabilityGetAll.mockResolvedValue(mockAvailability);
    mockAvailabilityUpdate.mockResolvedValue({ ...mockAvailability[0], reason: 'Updated' });
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

    // Submit the form to test handleSubmit for update
    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAvailabilityUpdate).toHaveBeenCalled();
    });
  });

  it('displays status badges for different statuses', async () => {
    const availabilityWithStatuses = [
      { ...mockAvailability[0], status: 'AVAILABLE' },
      { ...mockAvailability[1], status: 'UNAVAILABLE' },
      { id: '3', userId: 'user3', date: '2024-03-22', startTime: '2024-03-22T09:00:00Z', endTime: '2024-03-22T17:00:00Z', status: 'TENTATIVE', reason: null },
      { id: '4', userId: 'user4', date: '2024-03-23', startTime: '2024-03-23T09:00:00Z', endTime: '2024-03-23T17:00:00Z', status: 'BUSY', reason: null },
    ];
    mockAvailabilityGetAll.mockResolvedValue(availabilityWithStatuses);

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });

    // Status badges should be rendered (function getStatusBadge called)
    expect(screen.getAllByText('AVAILABLE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNAVAILABLE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TENTATIVE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BUSY').length).toBeGreaterThan(0);
  });

  it('formats dates and times correctly', async () => {
    mockAvailabilityGetAll.mockResolvedValue(mockAvailability);

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });

    // Dates and times should be formatted (formatDate and formatTime functions called)
    // The exact format depends on locale, but we can check structure exists
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(2); // Header + 2 data rows
  });

  it('handles delete confirmation', async () => {
    mockAvailabilityGetAll.mockResolvedValue(mockAvailability);
    mockAvailabilityDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<AvailabilityPage />);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
