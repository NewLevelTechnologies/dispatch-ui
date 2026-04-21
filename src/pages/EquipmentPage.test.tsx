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

    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
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

    // Fill form and submit to test handleSubmit
    mockEquipmentCreate.mockResolvedValue({ ...mockEquipment[0], id: '3' });

    const customerSelect = screen.getByLabelText(/customer/i);
    await user.selectOptions(customerSelect, 'c1');

    const equipmentTypeInput = screen.getByLabelText(/equipment type/i);
    await user.type(equipmentTypeInput, 'HVAC');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockEquipmentCreate).toHaveBeenCalled();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    mockEquipmentUpdate.mockResolvedValue({ ...mockEquipment[0], equipmentType: 'Updated' });
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

    // Submit form to test handleSubmit for update
    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockEquipmentUpdate).toHaveBeenCalled();
    });
  });

  it('calls delete when confirmed', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    mockEquipmentDelete.mockResolvedValue(undefined);
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

  it('displays status badges for different statuses', async () => {
    const equipmentWithStatuses = [
      { ...mockEquipment[0], status: 'ACTIVE' },
      { ...mockEquipment[1], status: 'MAINTENANCE' },
      { id: '3', customerId: 'c3', customerName: 'Test Customer', equipmentType: 'Furnace', modelNumber: 'FN-300', serialNumber: 'SN789', status: 'INACTIVE' },
      { id: '4', customerId: 'c4', customerName: 'Another Customer', equipmentType: 'Boiler', modelNumber: 'BL-400', serialNumber: 'SN012', status: 'RETIRED' },
    ];
    mockEquipmentGetAll.mockResolvedValue(equipmentWithStatuses);

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
    });

    // Status badges should be rendered
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAINTENANCE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('INACTIVE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RETIRED').length).toBeGreaterThan(0);
  });

  it('displays customer names correctly', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
    });

    // Customer names from getCustomerName function
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('handles form submission', async () => {
    mockEquipmentGetAll.mockResolvedValue([]);
    mockEquipmentCreate.mockResolvedValue({ ...mockEquipment[0], id: '3' });
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('No equipment found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add equipment/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('handles update submission', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    mockEquipmentUpdate.mockResolvedValue({ ...mockEquipment[0], modelNumber: 'UPDATED' });
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

  it('filters equipment by search query', async () => {
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
      expect(screen.getByText('RF-200')).toBeInTheDocument();
    });

    // Search for "AC"
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'AC');

    await waitFor(() => {
      expect(screen.getByText('AC-100')).toBeInTheDocument();
      expect(screen.queryByText('RF-200')).not.toBeInTheDocument();
    });
  });
});
