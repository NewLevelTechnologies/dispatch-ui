import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderFormDialog from './WorkOrderFormDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockServiceLocations = {
  content: [
    {
      id: 'location-1',
      customerId: 'customer-1',
      customerName: 'John Doe',
      locationName: "John's House",
      address: {
        streetAddress: '123 Main St',
        city: 'Atlanta',
        state: 'GA',
        zipCode: '30301',
      },
      status: 'ACTIVE' as const,
    },
  ],
  totalElements: 1,
  totalPages: 1,
  size: 50,
  number: 0,
};

describe('WorkOrderFormDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders create dialog with service location picker', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Create Work Order')).toBeInTheDocument();
      expect(screen.getByText('Create a new work order record.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/service location/i)).toBeInTheDocument();
    });

    it('shows service location search input', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toBeRequired();
    });

    it('has required service location field', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      expect(searchInput).toBeRequired();
    });
  });

  describe('Edit mode', () => {
    const existingWorkOrder = {
      id: '1',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      status: 'SCHEDULED' as const,
      scheduledDate: '2024-03-15',
      description: 'Fix leaking pipe',
      notes: 'Customer prefers morning',
      createdAt: '2024-03-10T10:00:00Z',
      updatedAt: '2024-03-10T10:00:00Z',
    };

    it('renders edit dialog with populated form', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      expect(screen.getByText('Edit Work Order')).toBeInTheDocument();
      expect(screen.getByText('Update work order information.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with work order data', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        const descriptionTextarea = screen.getByLabelText(/description/i);
        expect(descriptionTextarea).toHaveValue('Fix leaking pipe');
      });

      const notesTextarea = screen.getByLabelText(/notes/i);
      expect(notesTextarea).toHaveValue('Customer prefers morning');
    });

    it('shows status dropdown in edit mode', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      });

      // Check some status options
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Scheduled')).toBeInTheDocument();
    });
  });

  describe('Dialog behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByText('Create Work Order')).not.toBeInTheDocument();
    });

    it('resets form when dialog opens in create mode', async () => {
      const { rerender } = renderWithProviders(<WorkOrderFormDialog isOpen={false} onClose={mockOnClose} />);

      // Open dialog
      rerender(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        const descriptionTextarea = screen.getByLabelText(/description/i);
        expect(descriptionTextarea).toHaveValue('');
      });
    });

    it('shows all form fields in create mode', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByLabelText(/service location/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/scheduled date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });
  });
});
