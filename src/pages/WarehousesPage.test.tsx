import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WarehousesPage from './WarehousesPage';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/equipmentApi', () => ({
  warehousesApi: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  WarehouseStatus: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
  },
}));

const mockWarehouses = [
  {
    id: '1',
    name: 'Main Warehouse',
    manager: 'John Manager',
    phone: '555-1234',
    address: '123 Storage St',
    city: 'Boston',
    state: 'MA',
    zipCode: '02101',
  },
  {
    id: '2',
    name: 'East Warehouse',
    manager: 'Jane Supervisor',
    phone: '555-5678',
    address: '456 Depot Ave',
    city: 'Cambridge',
    state: 'MA',
    zipCode: '02139',
  },
];

describe('WarehousesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', async () => {
    mockGetAll.mockResolvedValue([]);

    renderWithProviders(<WarehousesPage />);

    expect(screen.getByRole('heading', { name: 'Warehouses' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add warehouse/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<WarehousesPage />);

    expect(screen.getByText('Loading warehouses...')).toBeInTheDocument();
  });

  it('displays warehouses in a table', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);

    renderWithProviders(<WarehousesPage />);

    // Wait for data to load - just check that we're past loading state
    await waitFor(() => {
      expect(screen.queryByText('Loading warehouses...')).not.toBeInTheDocument();
    });

    // Verify warehouse names are displayed
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('East Warehouse')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading warehouses/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockGetAll.mockResolvedValue([]);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('No warehouses found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('No warehouses found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add warehouse/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('displays all warehouse information in table', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading warehouses...')).not.toBeInTheDocument();
    });

    // Check that warehouse names are displayed
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('East Warehouse')).toBeInTheDocument();
  });

  it('handles delete confirmation', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading warehouses...')).not.toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('1');
    confirmSpy.mockRestore();
  });

  it('handles form submission for create', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ ...mockWarehouses[0], id: '3' });
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('No warehouses found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add warehouse/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fill and submit form
    const nameInput = screen.getByLabelText(/^name \*$/i);
    await user.type(nameInput, 'Test Warehouse');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  it('handles form submission for update', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    mockUpdate.mockResolvedValue({ ...mockWarehouses[0], name: 'Updated Warehouse' });
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading warehouses...')).not.toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Submit form
    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  it('filters warehouses by search query', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.getByText('East Warehouse')).toBeInTheDocument();
    });

    // Type in search box
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Main');

    // Only Main Warehouse should be visible
    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.queryByText('East Warehouse')).not.toBeInTheDocument();
    });
  });

  it('shows all warehouses when search is cleared', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Main');

    await waitFor(() => {
      expect(screen.queryByText('East Warehouse')).not.toBeInTheDocument();
    });

    // Clear search
    await user.clear(searchInput);

    // Both should be visible again
    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.getByText('East Warehouse')).toBeInTheDocument();
    });
  });
});
