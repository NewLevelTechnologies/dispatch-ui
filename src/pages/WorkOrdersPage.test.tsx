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
    customerId: 'cccccccc-dddd-eeee-ffff-222222222222',
    status: 'PENDING' as const,
    scheduledDate: '2024-03-15T10:00:00Z',
    description: 'Fix leaking pipe',
    notes: 'Customer prefers morning appointments',
    totalAmount: 150.00,
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
  },
  {
    id: 'bbbbbbbb-cccc-dddd-eeee-333333333333',
    customerId: 'dddddddd-eeee-ffff-0000-444444444444',
    status: 'IN_PROGRESS' as const,
    scheduledDate: '2024-03-14T10:00:00Z',
    description: 'Install new HVAC system',
    notes: '',
    totalAmount: 5000.00,
    createdAt: '2024-03-02T11:00:00Z',
    updatedAt: '2024-03-02T11:00:00Z',
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
    expect(screen.getByText('aaaaaaaa...')).toBeInTheDocument();
    expect(screen.getByText('bbbbbbbb...')).toBeInTheDocument();
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

  it('displays truncated IDs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockWorkOrders[0]] });

    renderWithProviders(<WorkOrdersPage />);

    await waitFor(() => {
      // Both ID and customer ID should be truncated
      const truncatedTexts = screen.getAllByText('aaaaaaaa...');
      expect(truncatedTexts.length).toBeGreaterThan(0);
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
});
