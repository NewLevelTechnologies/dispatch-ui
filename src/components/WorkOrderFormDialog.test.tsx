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

  describe('Form validation', () => {
    it('alerts when submitting without service location', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in description but not service location
      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Test description');

      // Try to submit without selecting location by submitting the form
      const form = document.getElementById('work-order-form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Please select a service location');
      });
      expect(mockOnClose).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  describe('Location selection', () => {
    it('updates form data when location is selected', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocations });
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      await user.type(searchInput, 'john');

      await waitFor(() => {
        expect(screen.getByText("John's House")).toBeInTheDocument();
      });

      const firstResult = screen.getByText("John's House").closest('button');
      await user.click(firstResult!);

      // After selection, search input should be cleared (searchQuery is reset)
      // The dropdown should also close
      await waitFor(() => {
        expect(screen.queryByText("John's House")).not.toBeInTheDocument();
      });
    });
  });

  describe('Form submission', () => {
    it('successfully creates work order with valid data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocations });
      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          id: 'new-work-order-1',
          customerId: 'customer-1',
          serviceLocationId: 'location-1',
          status: 'PENDING',
          description: 'Test work order',
          notes: 'Test notes',
          createdAt: '2024-03-15T10:00:00Z',
          updatedAt: '2024-03-15T10:00:00Z',
        },
      });

      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Select service location
      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      await user.type(searchInput, 'john');

      await waitFor(() => {
        expect(screen.getByText("John's House")).toBeInTheDocument();
      });

      const firstResult = screen.getByText("John's House").closest('button');
      await user.click(firstResult!);

      // Fill in description
      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Test work order');

      // Fill in notes
      const notesTextarea = screen.getByLabelText(/notes/i);
      await user.type(notesTextarea, 'Test notes');

      // Submit form
      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      // Should call API with correct data
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
          customerId: 'customer-1',
          serviceLocationId: 'location-1',
          status: 'PENDING',
          description: 'Test work order',
          notes: 'Test notes',
        }));
      });

      // Dialog should close
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('successfully updates work order in edit mode', async () => {
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocations });
      vi.mocked(apiClient.put).mockResolvedValue({
        data: { ...existingWorkOrder, status: 'COMPLETED' },
      });

      const user = userEvent.setup();

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      });

      // Select a service location first (required even in edit mode)
      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      await user.type(searchInput, 'john');

      await waitFor(() => {
        expect(screen.getByText("John's House")).toBeInTheDocument();
      });

      const firstResult = screen.getByText("John's House").closest('button');
      await user.click(firstResult!);

      // Now change status to completed
      const statusSelect = screen.getByLabelText(/status/i);
      await user.selectOptions(statusSelect, 'COMPLETED');

      // Submit form
      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      // Should call API with update data
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/work-orders/1', expect.objectContaining({
          status: 'COMPLETED',
        }));
      });

      // Dialog should close
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('displays error when create fails', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockServiceLocations });
      vi.mocked(apiClient.post).mockRejectedValue({
        response: { data: { message: 'Failed to create work order' } },
      });

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Select service location
      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      await user.type(searchInput, 'john');

      await waitFor(() => {
        expect(screen.getByText("John's House")).toBeInTheDocument();
      });

      const firstResult = screen.getByText("John's House").closest('button');
      await user.click(firstResult!);

      // Fill in description
      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Test work order');

      // Submit form
      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      // Should show error alert
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to create work order');
      });

      // Dialog should not close
      expect(mockOnClose).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  describe('Form field changes', () => {
    it('updates form fields correctly', async () => {
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Test description');
      expect(descriptionTextarea).toHaveValue('Test description');

      const notesTextarea = screen.getByLabelText(/notes/i);
      await user.type(notesTextarea, 'Test notes');
      expect(notesTextarea).toHaveValue('Test notes');

      const dateInput = screen.getByLabelText(/scheduled date/i);
      await user.type(dateInput, '2024-03-20');
      expect(dateInput).toHaveValue('2024-03-20');
    });

    it('updates status field in edit mode', async () => {
      const user = userEvent.setup();
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

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText(/status/i);
      await user.selectOptions(statusSelect, 'COMPLETED');
      expect(statusSelect).toHaveValue('COMPLETED');
    });
  });
});
