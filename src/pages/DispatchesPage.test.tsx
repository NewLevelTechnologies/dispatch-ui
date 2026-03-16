import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchesPage from './DispatchesPage';
import apiClient from '../api/client';

const mockDispatchesGetAll = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  dispatchesApi: {
    getAll: (...args: unknown[]) => mockDispatchesGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('../api/client');

const mockDispatches = [
  {
    id: '1',
    workOrderId: 'wo1',
    assignedUserId: 'user1',
    scheduledDate: '2024-03-20T10:00:00Z',
    estimatedDuration: 120,
    status: 'SCHEDULED',
  },
  {
    id: '2',
    workOrderId: 'wo2',
    assignedUserId: 'user2',
    scheduledDate: '2024-03-21T14:00:00Z',
    estimatedDuration: 60,
    status: 'COMPLETED',
  },
];

const mockWorkOrders = [
  { id: 'wo1', customerId: 'c1' },
  { id: 'wo2', customerId: 'c2' },
];

describe('DispatchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });
  });

  it('renders the page title and add button', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);

    renderWithProviders(<DispatchesPage />);

    expect(screen.getByRole('heading', { name: 'Dispatches' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add dispatch/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockDispatchesGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<DispatchesPage />);

    expect(screen.getByText('Loading dispatches...')).toBeInTheDocument();
  });

  it('displays dispatches in a table', async () => {
    mockDispatchesGetAll.mockResolvedValue(mockDispatches);

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('wo1')).toBeInTheDocument();
    });

    expect(screen.getByText('user1')).toBeInTheDocument();
    expect(screen.getByText('wo2')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockDispatchesGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading dispatches/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('No dispatches found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('No dispatches found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add dispatch/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue(mockDispatches);
    const user = userEvent.setup();

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('wo1')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
