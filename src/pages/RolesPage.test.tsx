import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RolesPage from './RolesPage';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockRoles = [
  {
    id: '1',
    name: 'Field Technician',
    description: 'Handles field work and customer visits',
    capabilities: ['customers:read', 'work_orders:read', 'work_orders:write'],
    isProtected: false,
    isSystemRole: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    name: 'Office Manager',
    description: 'Manages office operations',
    capabilities: ['customers:read', 'customers:write', 'users:read'],
    isProtected: false,
    isSystemRole: false,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-20T14:20:00Z',
  },
  {
    id: '3',
    name: 'Admin',
    description: 'Full system access',
    capabilities: ['*:*'],
    isProtected: true,
    isSystemRole: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockCapabilitiesData = {
  groups: [
    {
      featureArea: 'CUSTOMERS',
      displayName: 'Customers',
      capabilities: [
        { name: 'customers:read', displayName: 'View Customers', description: 'View customer list' },
      ],
    },
  ],
};

describe('RolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('renders the page title and add button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<RolesPage />);

    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
  });

  it('displays page description', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<RolesPage />);

    expect(screen.getByText(/manage roles and their capabilities/i)).toBeInTheDocument();
  });

  it('displays loading state while fetching roles', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<RolesPage />);

    expect(screen.getByText('Loading roles...')).toBeInTheDocument();
  });

  it('displays roles in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    expect(screen.getByText('Handles field work and customer visits')).toBeInTheDocument();
    expect(screen.getByText('Office Manager')).toBeInTheDocument();
    expect(screen.getByText('Manages office operations')).toBeInTheDocument();
  });

  it('displays capability count badges', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      const badges = screen.getAllByText(/3.*capabilities/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('displays dash for missing descriptions', async () => {
    const roleWithoutDescription = {
      ...mockRoles[0],
      description: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [roleWithoutDescription] });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('displays dash when role has no capabilities', async () => {
    const roleWithoutCapabilities = {
      ...mockRoles[0],
      capabilities: [],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [roleWithoutCapabilities] });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('formats dates correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
      expect(screen.getByText('Jan 20, 2024')).toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading roles/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no roles exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('No roles found')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add your first role/i })).toBeInTheDocument();
  });

  it('opens create dialog when add button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/roles') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('No roles found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add role/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Add Role').length).toBeGreaterThan(0);
  });

  it('navigates to detail page when row is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    const nameCell = screen.getByText('Field Technician');
    await user.click(nameCell);

    expect(mockNavigate).toHaveBeenCalledWith('/roles/1');
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open with Edit Role title
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getAllByText('Edit Role').length).toBeGreaterThan(0);
    });
  });

  it('does not navigate when dropdown is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });

    const { router } = renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Should not navigate
    expect(router.state.location.pathname).toBe('/');
  });

  it('opens delete confirmation when delete button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Delete alert should open
    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
      expect(screen.getByText(/users assigned this role will lose associated capabilities/i)).toBeInTheDocument();
    });
  });

  it('calls delete mutation when delete is confirmed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Confirm delete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/users/roles/1');
    });
  });

  it('cancels delete when cancel button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Cancel delete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('displays deleting state during deletion', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    vi.mocked(apiClient.delete).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Confirm delete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });

    expect(confirmButton).toBeDisabled();
  });

  it('closes dialog when form is successfully submitted', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/roles') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: '1' } });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('No roles found')).toBeInTheDocument();
    });

    // Open dialog
    const addButton = screen.getByRole('button', { name: /add role/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Fill form
    await user.type(screen.getByLabelText(/name/i), 'New Role');

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: /view customers/i }));

    // Submit
    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays error message when delete fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    const error = new Error('Cannot delete role in use');
    // @ts-expect-error - Adding response property to Error for test
    error.response = { data: { message: 'Cannot delete role in use' } };
    vi.mocked(apiClient.delete).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Confirm delete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot delete role in use');
    });

    alertSpy.mockRestore();
  });

  it('closes delete alert when cancel is clicked after error', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Network error'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText(/delete field technician/i)).not.toBeInTheDocument();
    });
  });

  it('hides edit button for protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    // Click the dropdown button for Admin role (third role)
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[2]);

    // Edit button should not be present
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument();

    // View button should be present
    expect(screen.getByRole('menuitem', { name: /view/i })).toBeInTheDocument();
  });

  it('hides delete button for protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    // Click the dropdown button for Admin role (third role)
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[2]);

    // Delete button should not be present
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows edit and delete buttons for non-protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
    const user = userEvent.setup();

    renderWithProviders(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('Field Technician')).toBeInTheDocument();
    });

    // Click the dropdown button for Field Technician (non-protected)
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Both edit and delete should be present
    expect(screen.getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  describe('Restore All Defaults', () => {
    it('renders the restore all defaults button', () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

      renderWithProviders(<RolesPage />);

      expect(screen.getByRole('button', { name: /restore all defaults/i })).toBeInTheDocument();
    });

    it('opens confirmation dialog when restore all defaults button is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButton = screen.getByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButton);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      expect(screen.getByText(/reset all.*default system roles/i)).toBeInTheDocument();
      expect(screen.getByText(/modified system roles will be reset/i)).toBeInTheDocument();
      expect(screen.getByText(/deleted system roles will be recreated/i)).toBeInTheDocument();
      expect(screen.getByText(/custom roles.*will be preserved/i)).toBeInTheDocument();
    });

    it('closes confirmation dialog when cancel button is clicked', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButton = screen.getByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButton);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const cancelButton = screen.getAllByRole('button', { name: /cancel/i })[0];
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Restore All Default Roles?')).not.toBeInTheDocument();
      });
    });

    it('calls restore all defaults API when confirmed', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const mockRestoreResponse = {
        restoredRoles: [mockRoles[0]],
        recreatedRoles: [],
        preservedCustomRoles: [mockRoles[1]],
      };
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRestoreResponse });
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users/roles/restore-all-defaults');
      });

      alertSpy.mockRestore();
    });

    it('displays success message with summary after successful restore', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const mockRestoreResponse = {
        restoredRoles: [mockRoles[0], mockRoles[2]],
        recreatedRoles: [{ ...mockRoles[0], id: '4', name: 'Dispatcher' }],
        preservedCustomRoles: [mockRoles[1]],
      };
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRestoreResponse });
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      const alertMessage = alertSpy.mock.calls[0][0] as string;
      expect(alertMessage).toContain('Default roles restored successfully');
      expect(alertMessage).toContain('2 role reset to defaults');
      expect(alertMessage).toContain('1 role recreated');
      expect(alertMessage).toContain('1 custom role preserved');
      expect(alertMessage).toContain('All user assignments have been preserved');

      alertSpy.mockRestore();
    });

    it('displays error message when restore fails', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const error = new Error('Restore failed');
      // @ts-expect-error - Adding response property to Error for test
      error.response = { data: { message: 'Insufficient permissions' } };
      vi.mocked(apiClient.post).mockRejectedValue(error);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Insufficient permissions');
      });

      alertSpy.mockRestore();
    });

    it('displays restoring state during restore operation', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      vi.mocked(apiClient.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /restoring/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /restoring/i })).toBeDisabled();
    });

    it('closes confirmation dialog after successful restore', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const mockRestoreResponse = {
        restoredRoles: [mockRoles[0]],
        recreatedRoles: [],
        preservedCustomRoles: [mockRoles[1]],
      };
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockRestoreResponse });
      vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /restore all defaults/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('Restore All Default Roles?')).not.toBeInTheDocument();
      });
    });

    it('shows system role count in confirmation dialog', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockRoles });
      const user = userEvent.setup();

      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Field Technician')).toBeInTheDocument();
      });

      const restoreButton = screen.getByRole('button', { name: /restore all defaults/i });
      await user.click(restoreButton);

      await waitFor(() => {
        expect(screen.getByText('Restore All Default Roles?')).toBeInTheDocument();
      });

      // Should always show 6 (the number in templates, not current count)
      expect(screen.getByText(/reset all 6 default system roles/i)).toBeInTheDocument();
    });
  });
});
