import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PartsInventoryPage from './PartsInventoryPage';

const mockPartsGetAll = vi.fn();
const mockPartsCreate = vi.fn();
const mockPartsUpdate = vi.fn();
const mockPartsDelete = vi.fn();
const mockWarehousesGetAll = vi.fn();

vi.mock('../api/equipmentApi', () => ({
  partsInventoryApi: {
    getAll: (...args: unknown[]) => mockPartsGetAll(...args),
    create: (...args: unknown[]) => mockPartsCreate(...args),
    update: (...args: unknown[]) => mockPartsUpdate(...args),
    delete: (...args: unknown[]) => mockPartsDelete(...args),
  },
  warehousesApi: {
    getAll: (...args: unknown[]) => mockWarehousesGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockParts = [
  {
    id: '1',
    partNumber: 'P-001',
    partName: 'Compressor',
    warehouseId: 'w1',
    warehouseName: 'Main Warehouse',
    quantityOnHand: 5,
    reorderPoint: 10,
    reorderQuantity: 5,
    unitCost: 150.0,
    locationBin: 'A1',
    notes: 'Test notes',
    needsReorder: true,
  },
  {
    id: '2',
    partNumber: 'P-002',
    partName: 'Filter',
    warehouseId: 'w2',
    warehouseName: 'East Warehouse',
    quantityOnHand: 50,
    reorderPoint: 20,
    reorderQuantity: 10,
    unitCost: 15.0,
    locationBin: 'B2',
    notes: '',
    needsReorder: false,
  },
];

const mockWarehouses = [
  { id: 'w1', name: 'Main Warehouse' },
  { id: 'w2', name: 'East Warehouse' },
];

describe('PartsInventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWarehousesGetAll.mockResolvedValue(mockWarehouses);
  });

  it('renders the page title and add button', async () => {
    mockPartsGetAll.mockResolvedValue([]);

    renderWithProviders(<PartsInventoryPage />);

    expect(screen.getByRole('heading', { name: 'Parts' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add part/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockPartsGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<PartsInventoryPage />);

    expect(screen.getByText('Loading parts...')).toBeInTheDocument();
  });

  it('displays parts in a table', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    expect(screen.getByText('Compressor')).toBeInTheDocument();
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockPartsGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading parts/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockPartsGetAll.mockResolvedValue([]);

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('No parts found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockPartsGetAll.mockResolvedValue([]);
    mockPartsCreate.mockResolvedValue({ id: '1', ...mockParts[0] });
    const user = userEvent.setup();

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('No parts found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add part/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Fill and submit form to test handleSubmit and resetForm
    await waitFor(() => {
      expect(screen.getByLabelText(/warehouse/i)).toBeInTheDocument();
    });

    const warehouseSelect = screen.getByLabelText(/warehouse/i);
    await user.selectOptions(warehouseSelect, 'w1');

    const partNumberInput = screen.getByLabelText(/part number/i);
    await user.type(partNumberInput, 'P-TEST');

    const partNameInput = screen.getByLabelText(/part name/i);
    await user.type(partNameInput, 'Test Part');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockPartsCreate).toHaveBeenCalled();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);
    mockPartsUpdate.mockResolvedValue({ ...mockParts[0], partName: 'Updated Part' });
    const user = userEvent.setup();

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
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
      expect(mockPartsUpdate).toHaveBeenCalled();
    });
  });

  it('displays low stock badge when part needs reorder', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    // Low Stock badge should appear for parts that need reorder
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });

  it('formats currency correctly', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    // formatCurrency function should format unit costs
    expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
  });

  it('displays warehouse names correctly', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    });

    expect(screen.getByText('East Warehouse')).toBeInTheDocument();
  });

  it('handles delete confirmation', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);
    mockPartsDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
