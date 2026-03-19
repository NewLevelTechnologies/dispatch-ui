import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UserDetailPage from './UserDetailPage';
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
];

const mockUser = {
  id: 'user-123',
  tenantId: 'tenant-1',
  cognitoSub: 'cognito-abc123',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
  enabled: true,
  roles: [mockRoles[0]],
  capabilities: ['*:*'],
  createdAt: '2024-01-01T10:30:00Z',
  updatedAt: '2024-01-15T14:45:00Z',
};

const mockDisabledUser = {
  ...mockUser,
  id: 'user-456',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane.smith@example.com',
  enabled: false,
  roles: [mockRoles[1]],
  capabilities: ['customers:read', 'work_orders:read'],
};

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('displays loading state while fetching user', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    expect(screen.getByText('Loading user...')).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('displays error state when user not found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked from error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Not found'));
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText(/error loading user/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/users');
  });

  it('renders user details with all information', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Doe')).toBeInTheDocument();
  });

  it('displays enabled status badge', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('displays disabled status badge', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-456') {
        return Promise.resolve({ data: mockDisabledUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-456'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeInTheDocument();
    });

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('displays user roles as badges', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders back button in header', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const backButtons = screen.getAllByRole('button', { name: /back/i });
    expect(backButtons.length).toBeGreaterThan(0);
  });

  it('navigates back when header back button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const backButtons = screen.getAllByRole('button', { name: /back/i });
    await user.click(backButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/users');
  });

  it('renders edit and disable buttons for enabled user', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
  });

  it('renders edit and enable buttons for disabled user', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-456') {
        return Promise.resolve({ data: mockDisabledUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-456'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /^edit$/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('opens disable confirmation when disable button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: /disable/i });
    await user.click(disableButton);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'));
    confirmSpy.mockRestore();
  });

  it('calls disable mutation when confirmed', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockUser, enabled: false } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: /disable/i });
    await user.click(disableButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/users/user-123', { enabled: false });
    });

    confirmSpy.mockRestore();
  });

  it('opens enable confirmation when enable button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-456') {
        return Promise.resolve({ data: mockDisabledUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-456'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeInTheDocument();
    });

    const enableButton = screen.getByRole('button', { name: /enable/i });
    await user.click(enableButton);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Jane Smith'));
    confirmSpy.mockRestore();
  });

  it('calls enable mutation when confirmed', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-456') {
        return Promise.resolve({ data: mockDisabledUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockDisabledUser, enabled: true } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-456'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeInTheDocument();
    });

    const enableButton = screen.getByRole('button', { name: /enable/i });
    await user.click(enableButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/users/user-456', { enabled: true });
    });

    confirmSpy.mockRestore();
  });

  it('renders basic information section', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
    });

    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Last Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders role & permissions section', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('Role & Permissions')).toBeInTheDocument();
    });

    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('displays dash for users with no roles', async () => {
    const userWithoutRoles = {
      ...mockUser,
      roles: [],
    };

    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: userWithoutRoles });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check that role section shows dash
    const roleTerm = screen.getByText('Role');
    const roleDetails = roleTerm.nextElementSibling;
    expect(roleDetails).toHaveTextContent('-');
  });

  it('closes edit dialog after successful update', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockUser });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Open edit dialog
    const editButton = screen.getByRole('button', { name: /^edit$/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Update and submit
    const firstNameInput = screen.getByDisplayValue('John');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Johnny');

    const submitButton = screen.getByRole('button', { name: /update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('uses correct query key for user fetch', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users/user-123') {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/users/user-123');
    });
  });

  describe('Permission-based UI', () => {
    it('hides all action buttons when user lacks EDIT_USERS capability', async () => {
      const { useHasCapability } = await import('../hooks/useCurrentUser');
      vi.mocked(useHasCapability).mockReturnValue(false);
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users/user-123') {
          return Promise.resolve({ data: mockUser });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UserDetailPage />, {
        initialEntries: ['/users/user-123'],
        path: '/users/:id',
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      });

      // No action buttons should be visible
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /disable/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /enable/i })).not.toBeInTheDocument();
    });

    it('shows action buttons when user has EDIT_USERS capability', async () => {
      const { useHasCapability } = await import('../hooks/useCurrentUser');
      vi.mocked(useHasCapability).mockImplementation((cap: string) => cap === 'EDIT_USERS');
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users/user-123') {
          return Promise.resolve({ data: mockUser });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UserDetailPage />, {
        initialEntries: ['/users/user-123'],
        path: '/users/:id',
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });

    it('shows enable button for disabled user when user has EDIT_USERS capability', async () => {
      const { useHasCapability } = await import('../hooks/useCurrentUser');
      vi.mocked(useHasCapability).mockImplementation((cap: string) => cap === 'EDIT_USERS');
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users/user-456') {
          return Promise.resolve({ data: mockDisabledUser });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UserDetailPage />, {
        initialEntries: ['/users/user-456'],
        path: '/users/:id',
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
    });
  });
});
