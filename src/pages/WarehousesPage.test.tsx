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

    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('displays warehouses in a table', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

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
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    expect(screen.getByText('East Warehouse')).toBeInTheDocument();
  });

  it('handles delete confirmation', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
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
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
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

  it('filters warehouses by city', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Boston');

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.queryByText('East Warehouse')).not.toBeInTheDocument();
    });
  });

  it('filters warehouses by state', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'MA');

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.getByText('East Warehouse')).toBeInTheDocument();
    });
  });

  it('filters warehouses by address', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Storage');

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.queryByText('East Warehouse')).not.toBeInTheDocument();
    });
  });

  it('filters warehouses by manager name', async () => {
    const warehousesWithManager = [
      { ...mockWarehouses[0], managerName: 'John Manager' },
      { ...mockWarehouses[1], managerName: 'Jane Supervisor' },
    ];
    mockGetAll.mockResolvedValue(warehousesWithManager);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'John');

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.queryByText('East Warehouse')).not.toBeInTheDocument();
    });
  });

  it('displays count when search filters results', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    // Should show total count initially
    expect(screen.getByText(/2 warehouses/i)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Main');

    // Should show filtered count
    await waitFor(() => {
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });
  });

  it('shows "no match" message when search returns no results', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'NonExistent');

    await waitFor(() => {
      expect(screen.getByText(/no warehouses match your search/i)).toBeInTheDocument();
    });
  });

  it('cancels delete when user clicks cancel', async () => {
    mockGetAll.mockResolvedValue(mockWarehouses);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('closes dialog when cancel is clicked', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('No warehouses found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add warehouse/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays active status badge', async () => {
    const warehousesWithStatus = [
      { ...mockWarehouses[0], status: 'ACTIVE' },
    ];
    mockGetAll.mockResolvedValue(warehousesWithStatus);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('displays inactive status badge', async () => {
    const warehousesWithStatus = [
      { ...mockWarehouses[0], status: 'INACTIVE' },
    ];
    mockGetAll.mockResolvedValue(warehousesWithStatus);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    expect(screen.getByText('INACTIVE')).toBeInTheDocument();
  });

  it('displays dash for missing optional fields', async () => {
    const warehousesWithMissing = [
      {
        ...mockWarehouses[0],
        city: '',
        state: '',
        managerName: '',
        phone: '',
      },
    ];
    mockGetAll.mockResolvedValue(warehousesWithMissing);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    // Should show dashes for missing fields
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('displays singular "warehouse" when count is 1', async () => {
    mockGetAll.mockResolvedValue([mockWarehouses[0]]);

    renderWithProviders(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    expect(screen.getByText(/1 warehouse$/i)).toBeInTheDocument();
  });
});
