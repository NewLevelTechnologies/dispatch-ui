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

// Mock useCurrentUser hook
vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    data: {
      id: 'current-user-id',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      capabilities: ['VIEW_USERS', 'EDIT_USERS'],
    },
  }),
  useHasCapability: () => true, // Grant all capabilities for testing
  useHasAnyCapability: () => true,
  useHasAllCapabilities: () => true,
}));

describe('UserDetailPage', () => {
  const mockUser = {
    id: 'user-123',
    cognitoSub: 'cognito-sub-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    enabled: true,
    roles: [
      { id: 'role-1', name: 'Admin', description: 'Administrator role' },
    ],
    capabilities: ['VIEW_USERS', 'EDIT_USERS', 'DELETE_USERS'],
    dispatchRegionIds: ['region-1', 'region-2'],
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-15T14:30:00Z',
  };

  const mockRoles = [
    { id: 'role-1', name: 'Admin', description: 'Administrator role' },
    { id: 'role-2', name: 'User', description: 'Standard user role' },
  ];

  const mockDispatchRegions = [
    { id: 'region-1', name: 'North Region', abbreviation: 'NORTH', isActive: true, sortOrder: 0, createdAt: '2024-01-01T10:00:00Z', updatedAt: '2024-01-01T10:00:00Z', version: 0 },
    { id: 'region-2', name: 'South Region', abbreviation: 'SOUTH', isActive: true, sortOrder: 1, createdAt: '2024-01-01T10:00:00Z', updatedAt: '2024-01-01T10:00:00Z', version: 0 },
  ];

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

  it('displays user details when loaded successfully', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser }) // First call for user
      .mockResolvedValueOnce({ data: mockRoles }) // Second call for roles
      .mockResolvedValueOnce({ data: mockDispatchRegions }); // Third call for dispatch regions

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Email appears twice (header and details), so use getAllByText
    expect(screen.getAllByText('john.doe@example.com')[0]).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

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

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it.skip('disables user when disable button is clicked with confirmation', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockUser, enabled: false } });

    // Mock window.confirm to return true
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

    // Confirm was called
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'));

    // API was called
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/user-123/disable', undefined);
    });

    confirmSpy.mockRestore();
  });

  it('does not disable user when confirmation is cancelled', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    // Mock window.confirm to return false
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

    // Confirm was called
    expect(confirmSpy).toHaveBeenCalled();

    // API was NOT called
    expect(apiClient.post).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it.skip('enables disabled user when enable button is clicked with confirmation', async () => {
    const disabledUser = { ...mockUser, enabled: false };

    // Mock window.confirm to return true BEFORE rendering
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: disabledUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    const postSpy = vi.mocked(apiClient.post).mockResolvedValue({ data: { ...disabledUser, enabled: true } });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Verify disabled badge is showing
    expect(screen.getByText('Disabled')).toBeInTheDocument();

    // Find enable button - it should be the second button (after Edit)
    const buttons = await screen.findAllByRole('button');
    const enableButton = buttons.find(btn => btn.textContent?.includes('Enable'));
    expect(enableButton).toBeDefined();

    // Click enable button
    await user.click(enableButton!);

    // Confirm was called
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'));

    // API was called
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(postSpy).toHaveBeenCalledWith('/users/user-123/enable', undefined);

    confirmSpy.mockRestore();
  });

  it('navigates back when back button is clicked from success state', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const backButton = screen.getAllByRole('button', { name: /back/i })[0];
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/users');
  });

  it('closes edit dialog when cancel is clicked', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Open dialog
    const editButton = screen.getByRole('button', { name: /^edit$/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Close dialog
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays all user information sections', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check all sections are rendered (updated for new layout)
    expect(screen.getByText('Role & Permissions')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('displays dispatch regions when user has assigned regions', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check dispatch regions are displayed
    await waitFor(() => {
      expect(screen.getByText('North Region')).toBeInTheDocument();
      expect(screen.getByText('South Region')).toBeInTheDocument();
    });
  });

  it('displays "No regions assigned" when user has no dispatch regions', async () => {
    const userWithoutRegions = { ...mockUser, dispatchRegionIds: [] };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: userWithoutRegions })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check "No regions assigned" message is displayed
    await waitFor(() => {
      expect(screen.getByText('No regions assigned')).toBeInTheDocument();
    });
  });

  it('displays "No regions assigned" when dispatchRegionIds is undefined', async () => {
    const userWithoutRegions = { ...mockUser, dispatchRegionIds: undefined };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: userWithoutRegions })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check "No regions assigned" message is displayed
    await waitFor(() => {
      expect(screen.getByText('No regions assigned')).toBeInTheDocument();
    });
  });

  it('displays capabilities section', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check capabilities section is displayed with count
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 capabilities count
  });

  it('shows dispatch regions section in role & permissions', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check the "Assigned Regions" label is displayed
    await waitFor(() => {
      expect(screen.getByText('Assigned Regions')).toBeInTheDocument();
    });
  });

  it('does not call disable when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: /disable/i });
    await user.click(disableButton);

    expect(confirmSpy).toHaveBeenCalled();
    // Should not have called the API since confirmation was cancelled
    expect(apiClient.put).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('closes edit dialog when cancel is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: mockUser })
      .mockResolvedValueOnce({ data: mockRoles })
      .mockResolvedValueOnce({ data: mockDispatchRegions });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Open edit dialog
    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
