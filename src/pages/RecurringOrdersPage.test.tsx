import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RecurringOrdersPage from './RecurringOrdersPage';
import apiClient from '../api/client';

const mockRecurringOrdersGetAll = vi.fn();
const mockEquipmentGetAll = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  recurringOrdersApi: {
    getAll: (...args: unknown[]) => mockRecurringOrdersGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
    const user = userEvent.setup();

    renderWithProviders(<RecurringOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No recurring orders found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add recurring order/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens edit dialog when edit is clicked', async () => {
    mockRecurringOrdersGetAll.mockResolvedValue(mockRecurringOrders);
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
  });
});
