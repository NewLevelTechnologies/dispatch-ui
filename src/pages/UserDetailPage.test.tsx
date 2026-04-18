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

  const mockCapabilitiesData = {
    groups: [
      {
        name: 'USER_MANAGEMENT',
        displayName: 'User Management',
        capabilities: [
          { name: 'VIEW_USERS', displayName: 'View Users' },
          { name: 'EDIT_USERS', displayName: 'Edit Users' },
          { name: 'DELETE_USERS', displayName: 'Delete Users' },
        ],
      },
    ],
  };

  interface MockOptions {
    user?: typeof mockUser;
    auditLog?: unknown[] | 'loading';
  }

  const setupStandardMocks = (options: MockOptions = {}) => {
    const { user = mockUser, auditLog = [] } = options;

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      // Match exact patterns - order matters for specificity
      if (url === `/users/${user.id}`) {
        return Promise.resolve({ data: user });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      if (url === '/tenant/dispatch-regions?includeInactive=true') {
        return Promise.resolve({ data: mockDispatchRegions });
      }
      if (url === `/audit/user/${user.id}`) {
        if (auditLog === 'loading') {
          return new Promise(() => {}); // Never resolve for loading state
        }
        return Promise.resolve({ data: auditLog });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }

      // Fallback for unmatched URLs
      console.warn('Unmatched API URL in test:', url);
      return Promise.reject(new Error(`Unmocked API call: ${url}`));
    });
  };

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
    setupStandardMocks({});

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
    setupStandardMocks({});

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

  it('disables user when disable button is clicked with confirmation', async () => {
    // Mock window.confirm to return true BEFORE rendering
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupStandardMocks({});

    const putSpy = vi.mocked(apiClient.put).mockResolvedValue({ data: { ...mockUser, enabled: false } });

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
      expect(putSpy).toHaveBeenCalledWith('/users/user-123', { enabled: false });
    });

    confirmSpy.mockRestore();
  });

  it('does not disable user when confirmation is cancelled', async () => {
    setupStandardMocks({}); // Audit log

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

  it('enables disabled user when enable button is clicked with confirmation', async () => {
    const disabledUser = { ...mockUser, enabled: false };

    // Mock window.confirm to return true BEFORE rendering
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupStandardMocks({ user: disabledUser });

    const putSpy = vi.mocked(apiClient.put).mockResolvedValue({ data: { ...disabledUser, enabled: true } });

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
      expect(putSpy).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(putSpy).toHaveBeenCalledWith('/users/user-123', { enabled: true });

    confirmSpy.mockRestore();
  });

  it('navigates back when back button is clicked from success state', async () => {
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({ user: userWithoutRegions });

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
    setupStandardMocks({ user: userWithoutRegions });

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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
    setupStandardMocks({}); // Audit log

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

  it('displays audit log when available', async () => {
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: { firstName: 'John -> Jane' },
      },
      {
        id: 'audit-2',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
        eventType: 'CREATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check audit log is displayed
    await waitFor(() => {
      expect(screen.getByText('UPDATED')).toBeInTheDocument();
      expect(screen.getByText('CREATED')).toBeInTheDocument();
    });

    // Check timestamp formatting (5m ago)
    expect(screen.getByText(/5m ago/i)).toBeInTheDocument();

    // Check timestamp formatting (3h ago)
    expect(screen.getByText(/3h ago/i)).toBeInTheDocument();

    // Check changes are formatted
    expect(screen.getByText(/firstName:/i)).toBeInTheDocument();
  });

  it('displays loading state for audit log', async () => {
    setupStandardMocks({ auditLog: 'loading' });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check loading state for audit log
    await waitFor(() => {
      expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    });
  });

  it.skip('toggles audit log expansion', async () => {
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: { firstName: 'John -> Jane' },
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Wait for audit log to load
    await waitFor(() => {
      expect(screen.getByText('UPDATED')).toBeInTheDocument();
    });

    // Find show all button - it's a plain button with the text "Show all"
    const buttons = await screen.findAllByRole('button');
    const showAllButton = buttons.find(btn => btn.textContent?.includes('Show all'));
    expect(showAllButton).toBeDefined();

    await user.click(showAllButton!);

    // Check button text changed to "Hide"
    await waitFor(() => {
      const buttonsAfter = screen.getAllByRole('button');
      const hideButton = buttonsAfter.find(btn => btn.textContent?.includes('Hide'));
      expect(hideButton).toBeDefined();
    });
  });

  it('formats different audit event types with correct badge colors', async () => {
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        eventType: 'CREATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
      {
        id: 'audit-2',
        timestamp: new Date().toISOString(),
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: { email: 'old@email.com -> new@email.com' },
      },
      {
        id: 'audit-3',
        timestamp: new Date().toISOString(),
        eventType: 'DELETED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check all event types are displayed (this tests getEventBadgeColor)
    await waitFor(() => {
      expect(screen.getByText('CREATED')).toBeInTheDocument();
      expect(screen.getByText('UPDATED')).toBeInTheDocument();
      expect(screen.getByText('DELETED')).toBeInTheDocument();
    });
  });

  it('formats timestamp for events older than 7 days', async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: oldDate.toISOString(),
        eventType: 'CREATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check date formatting (should show month abbreviation like "Apr 8")
    await waitFor(() => {
      const expectedDate = oldDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      expect(screen.getByText(expectedDate)).toBeInTheDocument();
    });
  });

  it('formats timestamp for events within last minute as "Just now"', async () => {
    const recentDate = new Date(Date.now() - 1000 * 30); // 30 seconds ago
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: recentDate.toISOString(),
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check "Just now" formatting
    await waitFor(() => {
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });
  });

  it('formats timestamp for events within last day', async () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 5); // 5 hours ago
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: recentDate.toISOString(),
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check "5h ago" formatting
    await waitFor(() => {
      expect(screen.getByText(/5h ago/i)).toBeInTheDocument();
    });
  });

  it('formats timestamp for events within last week', async () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3); // 3 days ago
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: recentDate.toISOString(),
        eventType: 'UPDATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Check "3d ago" formatting
    await waitFor(() => {
      expect(screen.getByText(/3d ago/i)).toBeInTheDocument();
    });
  });

  it('shows dash for empty changes object', async () => {
    const mockAuditLog = [
      {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        eventType: 'CREATED',
        entityType: 'USER',
        userId: 'user-123',
        changes: {},
      },
    ];

    setupStandardMocks({ auditLog: mockAuditLog });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('CREATED')).toBeInTheDocument();
    });

    // The dash should appear in the changes column
    const cells = screen.getAllByRole('cell');
    const changesCell = cells.find(cell => cell.textContent === '-');
    expect(changesCell).toBeInTheDocument();
  });

  it('does not call enable when confirmation is cancelled', async () => {
    const disabledUser = { ...mockUser, enabled: false };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setupStandardMocks({ user: disabledUser });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Find enable button
    const buttons = await screen.findAllByRole('button');
    const enableButton = buttons.find(btn => btn.textContent?.includes('Enable'));
    expect(enableButton).toBeDefined();

    await user.click(enableButton!);

    expect(confirmSpy).toHaveBeenCalled();
    // Should not have called the API since confirmation was cancelled
    expect(apiClient.put).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

});
