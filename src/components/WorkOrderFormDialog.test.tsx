import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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

const mockDispatchRegions = [
  {
    id: 'region-1',
    name: 'Atlanta Region',
    abbreviation: 'ATL',
    isActive: true,
    sortOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
  },
];

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

  describe('Inline customer creation', () => {
    it('shows radio toggle for existing vs new customer in create mode', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Customer')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /existing/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /new/i })).toBeInTheDocument();
    });

    it('defaults to existing customer mode', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const existingRadio = screen.getByRole('radio', { name: /existing/i });
      expect(existingRadio).toBeChecked();
    });

    it('shows service location picker when existing customer is selected', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByPlaceholderText('Search by customer, address, or phone...')).toBeInTheDocument();
    });

    it('shows inline customer form when new customer is selected', async () => {
      // Mock dispatch regions API call
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockDispatchRegions });

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Service location picker should be visible initially
      expect(screen.getByPlaceholderText('Search by customer, address, or phone...')).toBeInTheDocument();

      // Use fireEvent to click the actual radio input element
      const newCustomerRadio = screen.getByRole('radio', { name: /new/i });
      fireEvent.click(newCustomerRadio);

      // Service location picker should disappear
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search by customer, address, or phone...')).not.toBeInTheDocument();
      });

      // Inline form should appear - check for "Where do you need service?" heading
      await waitFor(() => {
        expect(screen.getByText(/where do you need service/i)).toBeInTheDocument();
      });
    });

    it('shows address fields in new customer form', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url === '/tenant/dispatch-regions' || url.startsWith('/tenant/dispatch-regions?')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: mockServiceLocations });
      });

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByRole('radio', { name: /new/i }));

      await waitFor(() => {
        expect(screen.getByText(/where do you need service/i)).toBeInTheDocument();
      });

      // Check for address fields
      const streetInputs = screen.getAllByLabelText(/street address.*\*/i);
      expect(streetInputs.length).toBeGreaterThan(0);
      expect(screen.getByLabelText(/city.*\*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/state.*\*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zip code.*\*/i)).toBeInTheDocument();
    });

    it('shows billing address checkbox in new customer form', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url === '/tenant/dispatch-regions' || url.startsWith('/tenant/dispatch-regions?')) {
          return Promise.resolve({ data: mockDispatchRegions });
        }
        return Promise.resolve({ data: mockServiceLocations });
      });

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByRole('radio', { name: /new/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/send invoice to same address/i)).toBeInTheDocument();
      });
    });


    it('does not show radio toggle in edit mode', async () => {
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

      // Should not show customer mode radio buttons in edit mode
      expect(screen.queryByRole('radio', { name: /existing/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /new/i })).not.toBeInTheDocument();
    });

    it('updates scheduled date field', async () => {
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      const dateInput = screen.getByLabelText(/scheduled date/i);
      await user.type(dateInput, '2024-12-25');

      expect(dateInput).toHaveValue('2024-12-25');
    });
  });
});
