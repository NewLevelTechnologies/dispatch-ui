import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchesPage from './DispatchesPage';
import apiClient from '../api/client';

const mockDispatchesGetAll = vi.fn();
const mockDispatchesCreate = vi.fn();
const mockDispatchesUpdate = vi.fn();
const mockDispatchesDelete = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  dispatchesApi: {
    getAll: (...args: unknown[]) => mockDispatchesGetAll(...args),
    create: (...args: unknown[]) => mockDispatchesCreate(...args),
    update: (...args: unknown[]) => mockDispatchesUpdate(...args),
    delete: (...args: unknown[]) => mockDispatchesDelete(...args),
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
    mockDispatchesCreate.mockResolvedValue({ id: '1', ...mockDispatches[0] });
    const user = userEvent.setup();

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('No dispatches found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add dispatch/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Fill form and submit to test handleSubmit
    const workOrderSelect = screen.getByLabelText(/work order/i);
    await user.selectOptions(workOrderSelect, 'wo1');

    const assignedUserInput = screen.getByLabelText(/assigned user/i);
    await user.type(assignedUserInput, 'user1');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockDispatchesCreate).toHaveBeenCalled();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue(mockDispatches);
    mockDispatchesUpdate.mockResolvedValue({ ...mockDispatches[0], status: 'IN_PROGRESS' });
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

    // Submit form to test handleSubmit for update
    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalled();
    });
  });

  it('displays status badges', async () => {
    const dispatchesWithStatuses = [
      { ...mockDispatches[0], status: 'SCHEDULED' },
      { ...mockDispatches[1], status: 'COMPLETED' },
      { id: '3', workOrderId: 'wo3', assignedUserId: 'user3', scheduledDate: '2024-03-22T10:00:00Z', estimatedDuration: 90, status: 'IN_PROGRESS' },
      { id: '4', workOrderId: 'wo4', assignedUserId: 'user4', scheduledDate: '2024-03-23T10:00:00Z', estimatedDuration: 60, status: 'CANCELLED' },
    ];
    mockDispatchesGetAll.mockResolvedValue(dispatchesWithStatuses);

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('wo1')).toBeInTheDocument();
    });

    // Status badges should be rendered
    expect(screen.getAllByText('SCHEDULED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0);
  });

  it('formats date and duration correctly', async () => {
    mockDispatchesGetAll.mockResolvedValue(mockDispatches);

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('wo1')).toBeInTheDocument();
    });

    // Duration should be formatted with "min" suffix
    expect(screen.getByText('120 min')).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
  });

  it('handles delete confirmation', async () => {
    mockDispatchesGetAll.mockResolvedValue(mockDispatches);
    mockDispatchesDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<DispatchesPage />);

    await waitFor(() => {
      expect(screen.getByText('wo1')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
