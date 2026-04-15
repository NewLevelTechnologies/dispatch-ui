import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UserFormDialog from './UserFormDialog';
import apiClient from '../api/client';
import type { User } from '../api';

// Mock the API client
vi.mock('../api/client');

const mockRoles = [
  {
    id: 'role-1',
    name: 'Admin',
    description: 'Administrator role',
    capabilities: ['*:*'],
  },
  {
    id: 'role-2',
    name: 'Technician',
    description: 'Field technician role',
    capabilities: ['customers:read', 'work_orders:read'],
  },
  {
    id: 'role-3',
    name: 'Manager',
    description: 'Management role',
    capabilities: ['customers:read', 'users:read'],
  },
];

describe('UserFormDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders create dialog with empty form', () => {
      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      expect(screen.getByText('Add User')).toBeInTheDocument();
      expect(screen.getByText('Create a new user record.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });

    it('displays all available roles as checkboxes', () => {
      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      expect(screen.getByRole('checkbox', { name: /admin/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /technician/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /manager/i })).toBeInTheDocument();
    });

    it('displays send invite checkbox by default', () => {
      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      const sendInviteCheckbox = screen.getByRole('checkbox', { name: /send invitation email/i });
      expect(sendInviteCheckbox).toBeInTheDocument();
      expect(sendInviteCheckbox).toBeChecked();
    });

    it('validates required fields - shows alert when no role selected', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('role'));
      });

      expect(apiClient.post).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('submits form with valid data', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'user-123' } });

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users', {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          roleIds: ['role-2'],
          dispatchRegionIds: [],
          phoneNumber: null,
          sendInvite: true,
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('includes sendInvite flag in submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'user-123' } });

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      // Uncheck send invite
      await user.click(screen.getByRole('checkbox', { name: /send invitation email/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({
          sendInvite: false,
        }));
      });
    });

    it('allows multiple role selection', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'user-123' } });

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));
      await user.click(screen.getByRole('checkbox', { name: /manager/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({
          roleIds: expect.arrayContaining(['role-2', 'role-3']),
        }));
      });
    });

    it('displays admin role info message when admin is selected', async () => {
      const user = userEvent.setup();

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.click(screen.getByRole('checkbox', { name: /admin/i }));

      await waitFor(() => {
        expect(screen.getByText(/admin role includes all permissions/i)).toBeInTheDocument();
      });
    });

    it('disables other roles when admin is selected', async () => {
      const user = userEvent.setup();

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.click(screen.getByRole('checkbox', { name: /admin/i }));

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /technician/i })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('checkbox', { name: /manager/i })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('checkbox', { name: /admin/i })).not.toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('displays saving state during submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
    });

    it('displays error message when creation fails', async () => {
      const user = userEvent.setup();
      const error = new Error('Email already exists');
      // @ts-expect-error - Adding response property to Error for test
      error.response = { data: { message: 'Email already exists' } };
      vi.mocked(apiClient.post).mockRejectedValue(error);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Email already exists');
      });

      alertSpy.mockRestore();
    });

    it('displays generic error message when creation fails without specific error', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create'));
      });

      alertSpy.mockRestore();
    });
  });

  describe('Edit mode', () => {
    const existingUser = {
      id: 'user-123',
      tenantId: 'tenant-1',
      cognitoSub: 'cognito-abc',
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      enabled: true,
      roles: [mockRoles[1]], // Technician
      capabilities: ['customers:read', 'work_orders:read'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('renders edit dialog with populated form', () => {
      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      expect(screen.getByText('Edit User')).toBeInTheDocument();
      expect(screen.getByText('Update user information.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('pre-fills form with user data', () => {
      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /technician/i })).toBeChecked();
    });

    it('disables email field in edit mode', () => {
      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      const emailInput = screen.getByDisplayValue('john@example.com');
      expect(emailInput).toBeDisabled();
    });

    it('does not show send invite checkbox in edit mode', () => {
      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      expect(screen.queryByRole('checkbox', { name: /send invitation email/i })).not.toBeInTheDocument();
    });

    it('submits updated profile and roles', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockResolvedValue({ data: existingUser });

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      // Update first name
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      // Change role
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));
      await user.click(screen.getByRole('checkbox', { name: /manager/i }));

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        // Should update profile first
        expect(apiClient.put).toHaveBeenCalledWith('/users/user-123', {
          firstName: 'Johnny',
          lastName: 'Doe',
          phoneNumber: null,
        });

        // Then update roles
        expect(apiClient.put).toHaveBeenCalledWith('/users/user-123/roles', {
          roleIds: ['role-3'],
        });
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('displays saving state during update', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.put).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
    });

    it('displays error message when profile update fails', async () => {
      const user = userEvent.setup();
      const error = new Error('Update failed');
      // @ts-expect-error - Adding response property to Error for test
      error.response = { data: { message: 'Update failed' } };
      vi.mocked(apiClient.put).mockRejectedValue(error);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Johnny');

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Update failed');
      });

      alertSpy.mockRestore();
    });

    it('handles role update failure', async () => {
      const user = userEvent.setup();
      // Profile update succeeds but role update fails
      vi.mocked(apiClient.put)
        .mockResolvedValueOnce({ data: existingUser })
        .mockRejectedValueOnce(new Error('Role update failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      // Change role only
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));
      await user.click(screen.getByRole('checkbox', { name: /manager/i }));

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to update user roles'));
      });

      // Dialog should not close on error
      expect(mockOnClose).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('validates role selection in edit mode', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      // Uncheck the only selected role
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('role'));
      });

      expect(apiClient.put).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe('Dialog behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(<UserFormDialog isOpen={false} onClose={mockOnClose} roles={mockRoles} />);

      expect(screen.queryByText('Add User')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });

    it('resets form when dialog closes and reopens in create mode', async () => {
      const { rerender } = renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />
      );

      const user = userEvent.setup();

      // Fill form
      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');

      // Close dialog
      rerender(<UserFormDialog isOpen={false} onClose={mockOnClose} roles={mockRoles} />);

      // Reopen dialog
      rerender(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      // Form should be empty
      expect(screen.getByLabelText('First Name *')).toHaveValue('');
      expect(screen.getByLabelText('Last Name *')).toHaveValue('');
    });

    it('updates form when switching from create to edit mode', () => {
      const existingUser = {
        id: 'user-123',
        tenantId: 'tenant-1',
        cognitoSub: 'cognito-abc',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        enabled: true,
        roles: [mockRoles[1]],
        capabilities: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { rerender } = renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />
      );

      // Should show create mode
      expect(screen.getByText('Add User')).toBeInTheDocument();

      // Switch to edit mode
      rerender(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      // Should show edit mode with user data
      expect(screen.getByText('Edit User')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    });

    it('clears sendInvite flag when switching to edit mode', () => {
      const existingUser = {
        id: 'user-123',
        tenantId: 'tenant-1',
        cognitoSub: 'cognito-abc',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        enabled: true,
        roles: [mockRoles[1]],
        capabilities: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { rerender } = renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />
      );

      // SendInvite should be visible in create mode
      expect(screen.getByRole('checkbox', { name: /send invitation email/i })).toBeInTheDocument();

      // Switch to edit mode
      rerender(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      // SendInvite should not be visible in edit mode
      expect(screen.queryByRole('checkbox', { name: /send invitation email/i })).not.toBeInTheDocument();
    });
  });

  describe('Dispatch Regions', () => {
    const mockDispatchRegions = [
      { id: 'region-1', name: 'North', abbreviation: 'N', isActive: true, sortOrder: 0, createdAt: '', updatedAt: '', version: 0 },
      { id: 'region-2', name: 'South', abbreviation: 'S', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '', version: 0 },
    ];

    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockDispatchRegions });
    });

    it('displays dispatch region checkboxes when regions exist', async () => {
      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /north/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /south/i })).toBeInTheDocument();
      });
    });

    it('includes selected dispatch regions in create submission', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'user-123' } });

      renderWithProviders(<UserFormDialog isOpen={true} onClose={mockOnClose} roles={mockRoles} />);

      await user.type(screen.getByLabelText('First Name *'), 'John');
      await user.type(screen.getByLabelText('Last Name *'), 'Doe');
      await user.type(screen.getByLabelText('Email *'), 'john@example.com');
      await user.click(screen.getByRole('checkbox', { name: /technician/i }));

      // Wait for regions to load and select one
      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /north/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('checkbox', { name: /north/i }));

      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users', expect.objectContaining({
          dispatchRegionIds: ['region-1'],
        }));
      });
    });

    it('pre-selects dispatch regions in edit mode', async () => {
      const existingUser: User = {
        id: 'user-123',
        tenantId: 'tenant-1',
        cognitoSub: 'cognito-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        enabled: true,
        roles: [mockRoles[1]],
        dispatchRegionIds: ['region-1', 'region-2'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      await waitFor(() => {
        const northCheckbox = screen.getByRole('checkbox', { name: /north/i });
        const southCheckbox = screen.getByRole('checkbox', { name: /south/i });
        expect(northCheckbox).toBeChecked();
        expect(southCheckbox).toBeChecked();
      });
    });

    it('updates dispatch regions in edit mode', async () => {
      const user = userEvent.setup();
      const existingUser: User = {
        id: 'user-123',
        tenantId: 'tenant-1',
        cognitoSub: 'cognito-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        enabled: true,
        roles: [mockRoles[1]],
        dispatchRegionIds: ['region-1'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(apiClient.put).mockResolvedValue({ data: existingUser });

      renderWithProviders(
        <UserFormDialog isOpen={true} onClose={mockOnClose} user={existingUser} roles={mockRoles} />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /north/i })).toBeChecked();
      });

      // Add south region
      await user.click(screen.getByRole('checkbox', { name: /south/i }));

      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/users/user-123/dispatch-regions',
          expect.objectContaining({
            dispatchRegionIds: ['region-1', 'region-2'],
          })
        );
      });
    });
  });
});
