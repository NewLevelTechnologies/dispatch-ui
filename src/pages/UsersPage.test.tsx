import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UsersPage from './UsersPage';
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
  },
  {
    id: 'role-2',
    name: 'Technician',
    description: 'Field technician role',
  },
];

const mockUsers = [
  {
    id: 'user-1',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-123',
    email: 'john.doe@example.com',
    firstName: 'John',
    lastName: 'Doe',
    enabled: true,
    roles: [mockRoles[0]],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'user-2',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-456',
    email: 'jane.smith@example.com',
    firstName: 'Jane',
    lastName: 'Smith',
    enabled: false,
    roles: [mockRoles[1]],
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-20T14:20:00Z',
  },
  {
    id: 'user-3',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-789',
    email: 'bob.johnson@example.com',
    firstName: 'Bob',
    lastName: 'Johnson',
    enabled: true,
    roles: [],
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-25T09:15:00Z',
  },
];

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('renders the page title and add button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<UsersPage />);

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
  });

  it('displays page description', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<UsersPage />);

    expect(screen.getByText(/manage user accounts and permissions/i)).toBeInTheDocument();
  });

  it('displays loading state while fetching users', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<UsersPage />);

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('displays users in a table', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane.smith@example.com')).toBeInTheDocument();
  });

  it('displays role badges for users', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Technician')).toBeInTheDocument();
  });

  it('displays enabled/disabled status badges', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const enabledBadges = screen.getAllByText('Enabled');
    const disabledBadges = screen.getAllByText('Disabled');
    expect(enabledBadges.length).toBeGreaterThan(0);
    expect(disabledBadges.length).toBeGreaterThan(0);
  });

  it('displays dash for users with no roles', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: [mockUsers[2]] });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });

    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it('formats dates correctly', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
      expect(screen.getByText('Jan 20, 2024')).toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading users/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no users exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add your first user/i })).toBeInTheDocument();
  });

  it('navigates to detail page when row is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const nameCell = screen.getByText('John Doe');
    await user.click(nameCell);

    expect(mockNavigate).toHaveBeenCalledWith('/users/user-1');
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click edit option
    const editButton = screen.getByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('does not navigate when dropdown is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const { router } = renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Should not navigate
    expect(router.state.location.pathname).toBe('/');
  });

  it('opens disable confirmation for enabled users', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button for enabled user
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click disable option
    const disableButton = screen.getByRole('menuitem', { name: /disable/i });
    await user.click(disableButton);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'));
    confirmSpy.mockRestore();
  });

  it('opens enable confirmation for disabled users', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    // Click the dropdown button for disabled user
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[1]);

    // Click enable option
    const enableButton = screen.getByRole('menuitem', { name: /enable/i });
    await user.click(enableButton);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Jane Smith'));
    confirmSpy.mockRestore();
  });

  it('calls disable mutation when confirmed', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockUsers[0], enabled: false } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click disable option
    const disableButton = screen.getByRole('menuitem', { name: /disable/i });
    await user.click(disableButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/users/user-1', { enabled: false });
    });

    confirmSpy.mockRestore();
  });

  it('opens delete alert when delete button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click the dropdown button
    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    // Click delete option
    const deleteButton = screen.getByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    // Delete alert should open
    await waitFor(() => {
      expect(screen.getByText(/delete john doe/i)).toBeInTheDocument();
      expect(screen.getByText(/all user data and history will be permanently removed/i)).toBeInTheDocument();
    });
  });

  it('calls delete mutation when delete is confirmed', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
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
      expect(apiClient.delete).toHaveBeenCalledWith('/users/user-1');
    });
  });

  it('cancels delete when cancel button is clicked', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: mockUsers });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    const user = userEvent.setup();

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
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

  describe('Search and Filters', () => {
    it('displays search bar when users exist', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: mockUsers });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText(/search by name, email, or role/i)).toBeInTheDocument();
    });

    it('filters users by search query', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: mockUsers });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      const user = userEvent.setup();

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by name, email, or role/i);
      await user.type(searchInput, 'jane');

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('displays role filter dropdown', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: mockUsers });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /role:.*all roles/i })).toBeInTheDocument();
    });

    it('displays status filter dropdown', async () => {
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: mockUsers });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: mockRoles });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /status:.*all/i })).toBeInTheDocument();
    });
  });

  describe('Row navigation', () => {
    it('navigates to user detail page when user name is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: mockUsers });
        }
        if (url === '/users/roles') {
          return Promise.resolve({ data: [] });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const nameCell = screen.getByText('John Doe');
      await user.click(nameCell);

      expect(mockNavigate).toHaveBeenCalledWith('/users/user-1');
    });
  });
});
