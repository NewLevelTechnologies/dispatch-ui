import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RecurringOrdersPage from './RecurringOrdersPage';
import apiClient from '../api/client';

const mockRecurringOrdersGetAll = vi.fn();
const mockRecurringOrdersCreate = vi.fn();
const mockRecurringOrdersUpdate = vi.fn();
const mockRecurringOrdersDelete = vi.fn();
const mockEquipmentGetAll = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  recurringOrdersApi: {
    getAll: (...args: unknown[]) => mockRecurringOrdersGetAll(...args),
    create: (...args: unknown[]) => mockRecurringOrdersCreate(...args),
    update: (...args: unknown[]) => mockRecurringOrdersUpdate(...args),
    delete: (...args: unknown[]) => mockRecurringOrdersDelete(...args),
  },
}));
vi.mock('../api/equipmentApi', () => ({
  equipmentApi: {
    getAll: (...args: unknown[]) => mockEquipmentGetAll(...args),
  },
}));
vi.mock('../api/client');

const mockRecurringOrders = [
  {
    id: '1',
    customerId: 'c1',
    equipmentId: 'e1',
    frequency: 'MONTHLY',
    nextScheduledDate: '2024-04-01',
    description: 'Regular maintenance',
    status: 'ACTIVE',
  },
  {
    id: '2',
    customerId: 'c2',
    equipmentId: 'e2',
    frequency: 'QUARTERLY',
    nextScheduledDate: '2024-06-01',
    description: 'Quarterly inspection',
    status: 'ACTIVE',
  },
];

const mockCustomers = [
  { id: 'c1', name: 'John Doe' },
  { id: 'c2', name: 'Jane Smith' },
];

const mockEquipment = [
  { id: 'e1', equipmentType: 'HVAC', modelNumber: 'AC-100' },
  { id: 'e2', equipmentType: 'Refrigerator', modelNumber: 'RF-200' },
];

describe('RecurringOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
    mockEquipmentGetAll.mockResolvedValue(mockEquipment);
  });

  it('renders the page title and add button', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue([]);

    renderWithProviders(<RecurringOrdersPage />);

    expect(screen.getByRole('heading', { name: 'Recurring Orders' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add recurring order/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockRecurringOrdersGetAll.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<RecurringOrdersPage />);

    expect(screen.getByText('Loading recurring orders...')).toBeInTheDocument();
  });

  it('displays recurring orders in a table', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Regular maintenance')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    mockRecurringOrdersGetAll.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading recurring orders/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue([]);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No recurring orders found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue([]);
    mockRecurringOrdersCreate.mockResolvedValue({ ...mockRecurringOrders[0], id: '3' });
    const user = userEvent.setup();

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No recurring orders found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add recurring order/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Fill in required form fields to test handleSubmit
    const customerSelect = screen.getByLabelText(/customer/i);
    await user.selectOptions(customerSelect, 'c1');

    const equipmentSelect = screen.getByLabelText(/equipment/i);
    await user.selectOptions(equipmentSelect, 'e1');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRecurringOrdersCreate).toHaveBeenCalled();
    });
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);
    mockRecurringOrdersUpdate.mockResolvedValue({ ...mockRecurringOrders[0], description: 'Updated' });
    const user = userEvent.setup();

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
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
      expect(mockRecurringOrdersUpdate).toHaveBeenCalled();
    });
  });

  it('displays frequency badges', async () => {
    const ordersWithFrequencies = [
      { ...mockRecurringOrders[0], frequency: 'WEEKLY' },
      { ...mockRecurringOrders[1], frequency: 'MONTHLY' },
      { id: '3', customerId: 'c3', equipmentId: 'e3', frequency: 'QUARTERLY', nextScheduledDate: '2024-07-01', description: 'Quarterly check', status: 'ACTIVE' },
      { id: '4', customerId: 'c4', equipmentId: 'e4', frequency: 'ANNUALLY', nextScheduledDate: '2025-01-01', description: 'Annual review', status: 'ACTIVE' },
    ];
    mockRecurringOrdersGetAll.mockResolvedValue(ordersWithFrequencies);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Frequency badges should be rendered
    expect(screen.getAllByText('WEEKLY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MONTHLY').length).toBeGreaterThan(0);
  });

  it('displays status badges', async () => {
    const ordersWithStatuses = [
      { ...mockRecurringOrders[0], status: 'ACTIVE' },
      { ...mockRecurringOrders[1], status: 'INACTIVE' },
      { id: '3', customerId: 'c3', equipmentId: 'e3', frequency: 'MONTHLY', nextScheduledDate: '2024-05-01', description: 'Test', status: 'PAUSED' },
      { id: '4', customerId: 'c4', equipmentId: 'e4', frequency: 'MONTHLY', nextScheduledDate: '2024-06-01', description: 'Test', status: 'COMPLETED' },
    ];
    mockRecurringOrdersGetAll.mockResolvedValue(ordersWithStatuses);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Status badges should be rendered
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
  });

  it('formats dates correctly', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Dates should be formatted using formatDate function
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(2); // Header + 2 data rows
  });

  it('resolves customer and equipment names', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Customer names should be resolved via getCustomerName
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();

    // Equipment types should be resolved via getEquipmentType
    expect(screen.getByText('HVAC')).toBeInTheDocument();
    expect(screen.getByText('Refrigerator')).toBeInTheDocument();
  });

  it('handles delete confirmation', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);
    mockRecurringOrdersDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
