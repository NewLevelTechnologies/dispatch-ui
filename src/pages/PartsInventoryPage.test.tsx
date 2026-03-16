import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PartsInventoryPage from './PartsInventoryPage';

const mockPartsGetAll = vi.fn();
const mockWarehousesGetAll = vi.fn();

vi.mock('../api/equipmentApi', () => ({
  partsInventoryApi: {
    getAll: (...args: unknown[]) => mockPartsGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
    unitCost: 150.0,
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
    unitCost: 15.0,
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
    const user = userEvent.setup();

    renderWithProviders(<PartsInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('No parts found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add part/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockPartsGetAll.mockResolvedValue(mockParts);
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
  });
});
