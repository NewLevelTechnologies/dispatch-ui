import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RoleFormDialog from './RoleFormDialog';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockCapabilitiesData = {
  groups: [
    {
      featureArea: 'CUSTOMERS',
      displayName: 'Customers',
      capabilities: [
        { name: 'customers:read', displayName: 'View Customers', description: 'View customer list' },
        { name: 'customers:write', displayName: 'Edit Customers', description: 'Create and edit customers' },
      ],
    },
  ],
};

describe('RoleFormDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock capabilities fetch for CapabilitySelector
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
  });

  describe('Create mode', () => {
    it('renders create dialog with empty form', () => {
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Add Role')).toBeInTheDocument();
      expect(screen.getByText(/create a new role/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });

    it('validates required name field', async () => {
      const user = userEvent.setup();
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      // Form should prevent submission with empty name
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('requires at least one capability to be selected', async () => {
      const user = userEvent.setup();
      // Mock window.alert
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in name but don't select any capabilities
      await user.type(screen.getByLabelText(/name/i), 'Test Role');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      expect(alertSpy).toHaveBeenCalledWith('Please select at least one capability for this role.');
      expect(apiClient.post).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('submits form with valid data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: '1' } });

      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      // Fill in name
      await user.type(screen.getByLabelText(/name/i), 'Field Technician');

      // Fill in description
      await user.type(screen.getByLabelText(/description/i), 'Handles field work');

      // Wait for capabilities to load and select one
      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox', { name: /view customers/i });
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users/roles', {
          name: 'Field Technician',
          description: 'Handles field work',
          capabilities: ['customers:read'],
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('displays saving state during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      await user.type(screen.getByLabelText(/name/i), 'Test Role');

      // Wait for capabilities and select one
      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('checkbox', { name: /view customers/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
    });
  });

  describe('Edit mode', () => {
    const existingRole = {
      id: '1',
      name: 'Field Technician',
      description: 'Handles field work',
      capabilities: ['customers:read'],
    };

    it('renders edit dialog with populated form', () => {
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} role={existingRole} />);

      expect(screen.getByText('Edit Role')).toBeInTheDocument();
      expect(screen.getByText(/update role name/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with role data', () => {
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} role={existingRole} />);

      expect(screen.getByDisplayValue('Field Technician')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Handles field work')).toBeInTheDocument();
    });

    it('pre-selects existing capabilities', async () => {
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} role={existingRole} />);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeChecked();
      });
    });

    it('submits updated data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: existingRole });

      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} role={existingRole} />);

      // Update name
      const nameInput = screen.getByDisplayValue('Field Technician');
      await user.clear(nameInput);
      await user.type(nameInput, 'Senior Technician');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/users/roles/1', {
          name: 'Senior Technician',
          description: 'Handles field work',
          capabilities: ['customers:read'],
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Dialog behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(<RoleFormDialog isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('resets form when dialog is closed and reopened', () => {
      const { rerender } = renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      // Dialog is open, should show form
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Close dialog
      rerender(<RoleFormDialog isOpen={false} onClose={mockOnClose} />);

      // Reopen with role data
      const role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        capabilities: ['customers:read'],
      };
      rerender(<RoleFormDialog isOpen={true} onClose={mockOnClose} role={role} />);

      // Should show role data
      expect(screen.getByDisplayValue('Test Role')).toBeInTheDocument();
    });
  });

  describe('Capability selection integration', () => {
    it('displays CapabilitySelector component', async () => {
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });
    });

    it('updates selection count when capabilities are toggled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<RoleFormDialog isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText(/0.*capabilities.*selected/i)).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox', { name: /view customers/i });
      await user.click(checkbox);

      expect(screen.getByText(/1.*capabilities.*selected/i)).toBeInTheDocument();
    });
  });
});
