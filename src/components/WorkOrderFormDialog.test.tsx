import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderFormDialog from './WorkOrderFormDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockCustomers = [
  { id: 'customer-1', name: 'John Doe', email: 'john@example.com' },
  { id: 'customer-2', name: 'Jane Smith', email: 'jane@example.com' },
];

describe('WorkOrderFormDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders create dialog with empty form', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Create Work Order')).toBeInTheDocument();
      expect(screen.getByText('Create a new work order for a customer.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });
    });

    it('loads customers when dialog opens', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Check customer select has options
      const customerSelect = screen.getByLabelText(/customer/i);
      expect(customerSelect).toBeInTheDocument();
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1); // More than just "Select a customer..."
      });
    });

    it('validates required customer field', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: '1' } });
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Wait for customer options to load
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
      });

      // Try to submit without selecting a customer
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      expect(alertSpy).toHaveBeenCalledWith('Please select a customer');
      expect(apiClient.post).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('submits form with valid data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: '1' } });
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Wait for customer options to load
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
      });

      // Select customer
      const customerSelect = screen.getByLabelText(/customer/i);
      await user.selectOptions(customerSelect, 'customer-1');

      // Fill in optional fields
      const scheduledDateInput = screen.getByLabelText(/scheduled date/i);
      await user.type(scheduledDateInput, '2024-03-15');

      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Fix leaking pipe');

      const notesTextarea = screen.getByLabelText(/notes/i);
      await user.type(notesTextarea, 'Customer prefers morning');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/work-orders', {
          customerId: 'customer-1',
          status: 'PENDING',
          scheduledDate: '2024-03-15',
          description: 'Fix leaking pipe',
          notes: 'Customer prefers morning',
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('displays saving state during submission', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Wait for customer options to load
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
      });

      const customerSelect = screen.getByLabelText(/customer/i);
      await user.selectOptions(customerSelect, 'customer-1');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
    });

    it('handles create error with custom message', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      const error = new Error('Request failed');
      Object.assign(error, {
        response: { data: { message: 'Customer not found' } },
      });
      vi.mocked(apiClient.post).mockRejectedValue(error);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Wait for customer options to load
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
      });

      const customerSelect = screen.getByLabelText(/customer/i);
      await user.selectOptions(customerSelect, 'customer-1');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Customer not found');
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('handles create error with default message', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Wait for customers to load
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/customers');
      });

      // Wait for customer options to load
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
      });

      const customerSelect = screen.getByLabelText(/customer/i);
      await user.selectOptions(customerSelect, 'customer-1');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to create work order');
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe('Edit mode', () => {
    const existingWorkOrder = {
      id: '1',
      customerId: 'customer-1',
      status: 'SCHEDULED' as const,
      scheduledDate: '2024-03-15',
      description: 'Fix leaking pipe',
      notes: 'Customer prefers morning',
    };

    it('renders edit dialog with populated form', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      expect(screen.getByText('Edit Work Order')).toBeInTheDocument();
      expect(screen.getByText('Update work order information.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });
    });

    it('pre-fills form with work order data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      expect(screen.getByDisplayValue('2024-03-15')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Fix leaking pipe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Customer prefers morning')).toBeInTheDocument();
    });

    it('shows status dropdown in edit mode', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      // Status dropdown should be present in edit mode
      await waitFor(() => {
        const statusSelect = screen.getByLabelText(/status/i);
        expect(statusSelect).toBeInTheDocument();
      });
    });

    it('disables customer field in edit mode', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        const customerSelect = screen.getByLabelText(/customer/i);
        expect(customerSelect).toBeDisabled();
      });
    });

    it('submits updated data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.patch).mockResolvedValue({ data: existingWorkOrder });
      const user = userEvent.setup();

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      // Change status
      const statusSelect = screen.getByLabelText(/status/i);
      await user.selectOptions(statusSelect, 'IN_PROGRESS');

      // Update description
      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.clear(descriptionTextarea);
      await user.type(descriptionTextarea, 'Fixed the leak');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/1', {
          status: 'IN_PROGRESS',
          scheduledDate: '2024-03-15',
          description: 'Fixed the leak',
          notes: 'Customer prefers morning',
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('handles update error with custom message', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      const error = new Error('Request failed');
      Object.assign(error, {
        response: { data: { message: 'Work order not found' } },
      });
      vi.mocked(apiClient.patch).mockRejectedValue(error);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Work order not found');
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('handles update error with default message', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      vi.mocked(apiClient.patch).mockRejectedValue(new Error('Network error'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to update work order');
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe('Dialog behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalled();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(<WorkOrderFormDialog isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not fetch customers when dialog is closed', () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

      renderWithProviders(<WorkOrderFormDialog isOpen={false} onClose={mockOnClose} />);

      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });
});
