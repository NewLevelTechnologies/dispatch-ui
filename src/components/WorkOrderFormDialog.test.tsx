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
      lifecycleState: 'ACTIVE' as const,
      progressCategory: 'NOT_STARTED' as const,
      priority: 'NORMAL' as const,
      scheduledDate: '2024-03-15',
      description: 'Fix leaking pipe',
      internalNotes: 'Customer prefers morning',
      createdAt: '2024-03-10T10:00:00Z',
      updatedAt: '2024-03-10T10:00:00Z',
    };

    it('renders edit dialog with populated form', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      expect(screen.getByText('Edit Work Order')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with work order data', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      // Description and internalNotes are no longer on the WO; work item edits
      // happen via WorkItemFormDialog and notes via the activity rail composer.
      // Edit-mode pre-fill should populate the still-editable fields.
      await waitFor(() => {
        const dateInput = screen.getByLabelText(/scheduled date/i);
        expect(dateInput).toHaveValue('2024-03-15');
      });
      // The first-work-item description field is create-only, never present in edit mode.
      expect(screen.queryByLabelText(/first.*description/i)).not.toBeInTheDocument();
    });

    it('shows progress badge in dialog header in edit mode', async () => {
      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      // Progress badge appears in the dialog header next to the title
      await waitFor(() => {
        expect(screen.getByText('Not Started')).toBeInTheDocument();
      });
      // No status select in edit mode anymore
      expect(screen.queryByLabelText(/^status$/i)).not.toBeInTheDocument();
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
        const firstWorkItem = screen.getByLabelText(/first.*description/i);
        expect(firstWorkItem).toHaveValue('');
      });
    });

    it('shows all form fields in create mode', async () => {
      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByLabelText(/service location/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/scheduled date/i)).toBeInTheDocument();
      // First work item description replaces the old WO description + internalNotes
      expect(screen.getByLabelText(/first.*description/i)).toBeInTheDocument();
      // Old fields should be gone
      expect(screen.queryByLabelText(/internal notes/i)).not.toBeInTheDocument();
    });
  });

  describe('Form validation', () => {
    it('alerts when submitting without service location', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<WorkOrderFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in first work item description but not service location
      const firstWorkItem = screen.getByLabelText(/first.*description/i);
      await user.type(firstWorkItem, 'Test description');

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
          lifecycleState: 'ACTIVE',
          progressCategory: 'NOT_STARTED',
          priority: 'NORMAL',
          description: 'Test work order',
          internalNotes: 'Test notes',
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

      // Fill in first work item description (required by atomic create)
      const firstWorkItem = screen.getByLabelText(/first.*description/i);
      await user.type(firstWorkItem, 'Test work order');

      // Submit form
      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      // Atomic create — workItems[0].description carries the description.
      // No more status/internalNotes/description fields on the WO payload.
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
          customerId: 'customer-1',
          serviceLocationId: 'location-1',
          workItems: [{ description: 'Test work order' }],
        }));
      });
      const postCall = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
      expect(postCall).not.toHaveProperty('status');
      expect(postCall).not.toHaveProperty('description');
      expect(postCall).not.toHaveProperty('internalNotes');

      // Dialog should close
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('successfully updates work order in edit mode', async () => {
      const existingWorkOrder = {
        id: '1',
        customerId: 'customer-1',
        serviceLocationId: 'location-1',
        lifecycleState: 'ACTIVE' as const,
        progressCategory: 'NOT_STARTED' as const,
        priority: 'NORMAL' as const,
        scheduledDate: '2024-03-15',
        description: 'Fix leaking pipe',
        internalNotes: 'Customer prefers morning',
        createdAt: '2024-03-10T10:00:00Z',
        updatedAt: '2024-03-10T10:00:00Z',
      };

      // Dialog now fetches detail via getById on open, so mock that URL distinctly
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (typeof url === 'string' && url === `/work-orders/${existingWorkOrder.id}`) {
          return Promise.resolve({ data: existingWorkOrder });
        }
        return Promise.resolve({ data: mockServiceLocations });
      });
      vi.mocked(apiClient.patch).mockResolvedValue({
        data: { ...existingWorkOrder, description: 'Updated description' },
      });

      const user = userEvent.setup();

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={existingWorkOrder} />
      );

      await waitFor(() => {
        expect(screen.getByText('Not Started')).toBeInTheDocument();
      });

      // Select a service location first (required even in edit mode)
      const searchInput = screen.getByPlaceholderText('Search by customer, address, or phone...');
      await user.type(searchInput, 'john');

      await waitFor(() => {
        expect(screen.getByText("John's House")).toBeInTheDocument();
      });

      const firstResult = screen.getByText("John's House").closest('button');
      await user.click(firstResult!);

      // Update an editable WO field — priority is a segmented button group;
      // click "High" to flip from the default "Normal".
      const highButton = screen.getByRole('button', { name: 'High' });
      await user.click(highButton);

      // Submit form
      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      // Update payload contains only editable fields.
      // status / description / internalNotes are NOT part of the contract anymore.
      await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/1', expect.objectContaining({
          priority: 'HIGH',
        }));
      });
      const patchCall = vi.mocked(apiClient.patch).mock.calls[0][1] as Record<string, unknown>;
      expect(patchCall).not.toHaveProperty('status');
      expect(patchCall).not.toHaveProperty('description');
      expect(patchCall).not.toHaveProperty('internalNotes');

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

      // Fill in first work item description
      const firstWorkItem = screen.getByLabelText(/first.*description/i);
      await user.type(firstWorkItem, 'Test work order');

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

      const firstWorkItem = screen.getByLabelText(/first.*description/i);
      await user.type(firstWorkItem, 'Test description');
      expect(firstWorkItem).toHaveValue('Test description');

      const dateInput = screen.getByLabelText(/scheduled date/i);
      await user.type(dateInput, '2024-03-20');
      expect(dateInput).toHaveValue('2024-03-20');
    });

    it('shows cancellation banner and disables submit when work order is cancelled', async () => {
      const cancelledWorkOrder = {
        id: '1',
        customerId: 'customer-1',
        serviceLocationId: 'location-1',
        lifecycleState: 'CANCELLED' as const,
        progressCategory: 'CANCELLED' as const,
        priority: 'NORMAL' as const,
        scheduledDate: '2024-03-15',
        description: 'Fix leaking pipe',
        internalNotes: 'Customer prefers morning',
        cancellationReason: 'Customer requested cancellation',
        cancelledAt: '2024-03-12T10:00:00Z',
        createdAt: '2024-03-10T10:00:00Z',
        updatedAt: '2024-03-12T10:00:00Z',
      };

      // Dialog fetches detail via getById; mock that URL to return the cancelled order
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (typeof url === 'string' && url === `/work-orders/${cancelledWorkOrder.id}`) {
          return Promise.resolve({ data: cancelledWorkOrder });
        }
        return Promise.resolve({ data: [] });
      });

      renderWithProviders(
        <WorkOrderFormDialog isOpen={true} onClose={mockOnClose} workOrder={cancelledWorkOrder} />
      );

      // Cancellation banner shows
      expect(screen.getByText(/can no longer be edited/i)).toBeInTheDocument();
      // Reason is rendered (comes from the detail fetch)
      await waitFor(() => {
        expect(screen.getByText(/customer requested cancellation/i)).toBeInTheDocument();
      });
      // No update button
      expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument();
      // Close button is shown instead of Cancel
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
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
        lifecycleState: 'ACTIVE' as const,
        progressCategory: 'NOT_STARTED' as const,
        priority: 'NORMAL' as const,
        scheduledDate: '2024-03-15',
        description: 'Fix leaking pipe',
        internalNotes: 'Customer prefers morning',
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
