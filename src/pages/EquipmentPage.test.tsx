import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentPage from './EquipmentPage';
import apiClient from '../api/client';

const mockEquipmentGetAll = vi.fn();
const mockEquipmentCreate = vi.fn();
const mockEquipmentUpdate = vi.fn();
const mockEquipmentDelete = vi.fn();

vi.mock('../api/equipmentApi', () => ({
  equipmentApi: {
    getAll: (...args: unknown[]) => mockEquipmentGetAll(...args),
    create: (...args: unknown[]) => mockEquipmentCreate(...args),
    update: (...args: unknown[]) => mockEquipmentUpdate(...args),
    delete: (...args: unknown[]) => mockEquipmentDelete(...args),
  },
}));
vi.mock('../api/client');

const mockEquipment = [
  {
    id: '1',
    customerId: 'c1',
    customerName: 'John Doe',
    equipmentType: 'HVAC',
    modelNumber: 'AC-100',
    serialNumber: 'SN123',
    status: 'ACTIVE',
  },
  {
    id: '2',
    customerId: 'c2',
    customerName: 'Jane Smith',
    equipmentType: 'Refrigerator',
    modelNumber: 'RF-200',
    serialNumber: 'SN456',
    status: 'MAINTENANCE',
  },
];

const mockCustomers = [
  { id: 'c1', name: 'John Doe' },
  { id: 'c2', name: 'Jane Smith' },
];

describe('EquipmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
  });

  it('renders the page title and add button', async () => {
    mockEquipmentGetAll.mockResolvedValue([]);

    renderWithProviders(<EquipmentPage />);

    expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockEquipmentGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<EquipmentPage />);

    expect(screen.getByText('Loading equipment...')).toBeInTheDocument();
  });

  it('displays equipment in a table', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
    });

    expect(screen.getByText('HVAC')).toBeInTheDocument();
    expect(screen.getByText('SN123')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockEquipmentGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading equipment/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockEquipmentGetAll.mockResolvedValue([]);

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('No equipment found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockEquipmentGetAll.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('No equipment found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add equipment/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls delete when confirmed', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    mockEquipmentDelete.mockResolvedValue();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockEquipmentDelete).toHaveBeenCalledWith('1');
    });

    confirmSpy.mockRestore();
  });
});
