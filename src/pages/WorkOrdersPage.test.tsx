import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrdersPage from './WorkOrdersPage';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockWorkOrders = [
  {
    id: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
    workOrderNumber: 'WO-00001',
    customerId: 'cccccccc-dddd-eeee-ffff-222222222222',
    serviceLocationId: 'location-1',
    status: 'PENDING' as const,
    scheduledDate: '2024-03-15T10:00:00Z',
    description: 'Fix leaking pipe',
    notes: 'Customer prefers morning appointments',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
    customer: {
      id: 'cccccccc-dddd-eeee-ffff-222222222222',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '5551234567',
    },
    serviceLocation: {
      id: 'location-1',
      locationName: "John's House",
      address: {
        streetAddress: '123 Main St',
        city: 'Atlanta',
        state: 'GA',
        zipCode: '30301',
      },
      siteContactName: 'John Doe',
      siteContactPhone: '5551234567',
    },
  },
  {
    id: 'bbbbbbbb-cccc-dddd-eeee-333333333333',
    workOrderNumber: 'WO-00002',
    customerId: 'dddddddd-eeee-ffff-0000-444444444444',
    serviceLocationId: 'location-2',
    status: 'IN_PROGRESS' as const,
    scheduledDate: '2024-03-14T10:00:00Z',
    description: 'Install new HVAC system',
    notes: '',
    createdAt: '2024-03-02T11:00:00Z',
    updatedAt: '2024-03-02T11:00:00Z',
    customer: {
      id: 'dddddddd-eeee-ffff-0000-444444444444',
      name: 'Jane Smith',
      email: 'jane@example.com',
    },
    serviceLocation: {
      id: 'location-2',
      locationName: null,
      address: {
        streetAddress: '456 Oak Ave',
        city: 'Marietta',
        state: 'GA',
        zipCode: '30060',
      },
    },
  },
];

describe('WorkOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and create button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<WorkOrdersPage />);

    expect(screen.getByRole('heading', { name: 'Work Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create work order/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching work orders', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<WorkOrdersPage />);

    expect(screen.getByText('Loading work orders...')).toBeInTheDocument();
  });

  it('displays work orders in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Fix leaking pipe')).toBeInTheDocument();
    });

    expect(screen.getByText('Install new HVAC system')).toBeInTheDocument();
    expect(screen.getByText('WO-00001')).toBeInTheDocument();
    expect(screen.getByText('WO-00002')).toBeInTheDocument();
  });

  it('displays status badges with correct styling', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading work orders/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no work orders exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No work orders found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when create button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('No work orders found')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create work order/i });
    await user.click(createButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Create Work Order').length).toBeGreaterThan(0);
  });

  it('formats scheduled dates correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Mar 15, 2024')).toBeInTheDocument();
    });

    expect(screen.getByText('Mar 14, 2024')).toBeInTheDocument();
  });

  it('displays work order numbers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockWorkOrders[0]] });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });
  });

  it('falls back to truncated UUID when workOrderNumber is not available', async () => {
    const workOrderWithoutNumber = {
      ...mockWorkOrders[0],
      workOrderNumber: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [workOrderWithoutNumber] });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('#aaaaaaaa')).toBeInTheDocument();
    });
  });

  it('handles work orders without scheduled dates', async () => {
    const workOrderWithoutDate = {
      ...mockWorkOrders[0],
      scheduledDate: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [workOrderWithoutDate] });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Fix leaking pipe')).toBeInTheDocument();
    });

    // Should display dash for missing date
    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('displays service location information', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("John's House")).toBeInTheDocument();
    });

    // Check for parts of the address (text is split across elements)
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
    expect(screen.getByText(/Atlanta/)).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
    expect(screen.getByText(/Marietta/)).toBeInTheDocument();
  });


  it('opens edit dialog when edit button is clicked', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Fix leaking pipe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open with Edit Work Order title
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Edit Work Order').length).toBeGreaterThan(0);
  });

  it('calls delete mutation when delete is confirmed', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Fix leaking pipe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this work order?');
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/aaaaaaaa-bbbb-cccc-dddd-111111111111');
    });

    confirmSpy.mockRestore();
  });

  it('does not delete when deletion is cancelled', { timeout: 10000 }, async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockWorkOrders });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('Fix leaking pipe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
