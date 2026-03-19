import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RoleDetailPage from './RoleDetailPage';
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

const mockRole = {
  id: 'role-123',
  name: 'Field Technician',
  description: 'Handles field work and customer visits',
  capabilities: ['customers:read', 'work_orders:read', 'work_orders:write'],
  isProtected: false,
  isSystemRole: true,
  createdAt: '2024-01-01T10:30:00Z',
  updatedAt: '2024-01-15T14:45:00Z',
};

const mockProtectedRole = {
  id: 'role-456',
  name: 'Admin',
  description: 'Full system access',
  capabilities: ['*:*'],
  isProtected: true,
  isSystemRole: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockCustomRole = {
  id: 'role-789',
  name: 'Custom Role',
  description: 'A custom role',
  capabilities: ['customers:read'],
  isProtected: false,
  isSystemRole: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

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

describe('RoleDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('displays loading state while fetching role', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    expect(screen.getByText('Loading role...')).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading role/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('displays error state when role not found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading role/i)).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked from error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading role/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/roles');
  });

  it('renders role details with all information', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Description appears in multiple places (header and description list)
    const descriptions = screen.getAllByText('Handles field work and customer visits');
    expect(descriptions.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Field Technician').length).toBeGreaterThan(0);
    expect(screen.getByText(/3.*capabilities/i)).toBeInTheDocument();
    expect(screen.getByText('role-123')).toBeInTheDocument();
  });

  it('displays default text for missing description', async () => {
    const roleWithoutDescription = {
      ...mockRole,
      description: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: roleWithoutDescription });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('No description provided')).toBeInTheDocument();
    });
  });

  it('formats dates correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      // Check dates are formatted with month, day, year, and time (timezone may vary)
      expect(screen.getByText(/jan 1, 2024,.*[ap]m/i)).toBeInTheDocument();
      expect(screen.getByText(/jan 15, 2024,.*[ap]m/i)).toBeInTheDocument();
    });
  });

  it('renders back button in header', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const backButtons = screen.getAllByRole('button', { name: /back/i });
    expect(backButtons.length).toBeGreaterThan(0);
  });

  it('navigates back when header back button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const backButtons = screen.getAllByRole('button', { name: /back/i });
    await user.click(backButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/roles');
  });

  it('renders edit and delete buttons', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/roles/role-123') {
        return Promise.resolve({ data: mockRole });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /^edit$/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Edit Role')).toBeInTheDocument();
    });
  });

  it('opens delete confirmation when delete button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
      expect(screen.getByText(/users assigned this role will lose associated capabilities/i)).toBeInTheDocument();
    });
  });

  it('deletes role and navigates back on successful deletion', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open delete confirmation
    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteButton);

    // Wait for alert dialog to appear
    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
    });

    // Find the confirm button within the alert dialog (last Delete button)
    const allDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    const confirmButton = allDeleteButtons[allDeleteButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/users/roles/role-123');
      expect(mockNavigate).toHaveBeenCalledWith('/roles');
    });
  });

  it('cancels deletion when cancel button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open delete confirmation
    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteButton);

    // Cancel
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(apiClient.delete).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/delete field technician/i)).not.toBeInTheDocument();
    });
  });

  it('displays deleting state during deletion', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    vi.mocked(apiClient.delete).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open delete confirmation
    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteButton);

    // Wait for alert dialog to appear
    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
    });

    // Find the confirm button within the alert dialog (last Delete button)
    const allDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    const confirmButton = allDeleteButtons[allDeleteButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });
  });

  it('displays error message when deletion fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const error = new Error('Cannot delete role in use');
    // @ts-expect-error - Adding response property to Error for test
    error.response = { data: { message: 'Cannot delete role in use' } };
    vi.mocked(apiClient.delete).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open delete confirmation
    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteButton);

    // Wait for alert dialog to appear
    await waitFor(() => {
      expect(screen.getByText(/delete field technician/i)).toBeInTheDocument();
    });

    // Find the confirm button within the alert dialog (last Delete button)
    const allDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    const confirmButton = allDeleteButtons[allDeleteButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot delete role in use');
    });

    alertSpy.mockRestore();
  });

  it('renders role information section', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('Role Information')).toBeInTheDocument();
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Total Capabilities')).toBeInTheDocument();
  });

  it('renders system information section', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('System Information')).toBeInTheDocument();
    });

    expect(screen.getByText('Role ID')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Updated')).toBeInTheDocument();
  });

  it('displays role ID as code', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      const codeElement = screen.getByText('role-123');
      expect(codeElement.tagName).toBe('CODE');
    });
  });

  it('displays dash for missing description in description list', async () => {
    const roleWithoutDescription = {
      ...mockRole,
      description: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: roleWithoutDescription });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Check description in the list shows dash
    const descriptionTerm = screen.getByText('Description');
    const descriptionDetails = descriptionTerm.nextElementSibling;
    expect(descriptionDetails).toHaveTextContent('-');
  });

  it('displays capabilities count as 0 when no capabilities', async () => {
    const roleWithoutCapabilities = {
      ...mockRole,
      capabilities: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: roleWithoutCapabilities });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/0.*capabilities/i)).toBeInTheDocument();
    });
  });

  it('renders CapabilitiesSection component', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // CapabilitiesSection should be rendered with count badge
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('closes edit dialog after successful update', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/roles/role-123') {
        return Promise.resolve({ data: mockRole });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open edit dialog
    const editButton = screen.getByRole('button', { name: /^edit$/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Update and submit
    const nameInput = screen.getByDisplayValue('Field Technician');
    await user.clear(nameInput);
    await user.type(nameInput, 'Senior Technician');

    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays description from header when no detailed description', async () => {
    const roleWithoutDetailedDescription = {
      ...mockRole,
      description: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: roleWithoutDetailedDescription });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Should show default text in header
    expect(screen.getByText('No description provided')).toBeInTheDocument();
  });

  it('uses correct query key for role fetch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/users/roles/role-123');
    });
  });

  // Protected role tests
  it('hides edit button for protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockProtectedRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-456'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('hides delete button for protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockProtectedRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-456'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it('shows clone button for all roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /clone role/i })).toBeInTheDocument();
  });

  it('shows clone button for protected roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockProtectedRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-456'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /clone role/i })).toBeInTheDocument();
  });

  it('shows restore defaults button for system roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /restore defaults/i })).toBeInTheDocument();
  });

  it('hides restore defaults button for custom roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomRole });

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-789'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Custom Role' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /restore defaults/i })).not.toBeInTheDocument();
  });

  it('opens clone dialog when clone button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const cloneButton = screen.getByRole('button', { name: /clone role/i });
    await user.click(cloneButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Clone Role' })).toBeInTheDocument();
    });
  });

  it('opens restore defaults confirmation when restore button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    const restoreButton = screen.getByRole('button', { name: /restore defaults/i });
    await user.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText(/restore "field technician" to default capabilities/i)).toBeInTheDocument();
      expect(screen.getByText(/this will reset all capabilities to the system template defaults/i)).toBeInTheDocument();
    });
  });

  it('calls restore defaults API when confirmed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open restore confirmation
    const restoreButton = screen.getByRole('button', { name: /restore defaults/i });
    await user.click(restoreButton);

    // Confirm restore
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^restore$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/roles/role-123/restore-defaults');
    });
  });

  it('cancels restore defaults when cancel is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open restore confirmation
    const restoreButton = screen.getByRole('button', { name: /restore defaults/i });
    await user.click(restoreButton);

    // Cancel
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(apiClient.post).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/restore "field technician"/i)).not.toBeInTheDocument();
    });
  });

  it('displays restoring state during restore operation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    vi.mocked(apiClient.post).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open restore confirmation
    const restoreButton = screen.getByRole('button', { name: /restore defaults/i });
    await user.click(restoreButton);

    // Confirm restore
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^restore$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Restoring...')).toBeInTheDocument();
    });

    expect(confirmButton).toBeDisabled();
  });

  it('displays error message when restore defaults fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRole });
    const error = new Error('Failed to restore');
    // @ts-expect-error - Adding response property to Error for test
    error.response = { data: { message: 'Failed to restore' } };
    vi.mocked(apiClient.post).mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(<RoleDetailPage />, {
      initialEntries: ['/roles/role-123'],
      path: '/roles/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Technician' })).toBeInTheDocument();
    });

    // Open restore confirmation
    const restoreButton = screen.getByRole('button', { name: /restore defaults/i });
    await user.click(restoreButton);

    // Confirm restore
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^restore$/i })).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^restore$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to restore');
    });

    alertSpy.mockRestore();
  });
});
