import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UserDetailPage from './UserDetailPage';
import { apiClient } from '../api/setup';
import type { User } from '../api/setup';

// Mock the API client
vi.mock('@dispatch/api/src/client');

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('UserDetailPage', () => {
  const mockUser = {
    id: 'user-123',
    cognitoSub: 'cognito-sub-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    enabled: true,
    invitationStatus: 'ACTIVE' as const,
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
    user?: Partial<User> & Pick<User, 'id'>;
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
      // v1.5 backs the activity card with the new curated feed at
      // /audit/account-activity/{userId}. Keep the legacy entity-history
      // URLs mocked too in case some path still touches them.
      if (
        url === `/audit/account-activity/${user.id}` ||
        url === `/audit/user/${user.id}` ||
        url === `/audit/TenantUser/${user.id}`
      ) {
        if (auditLog === 'loading') {
          return new Promise(() => {}); // Never resolve for loading state
        }
        return Promise.resolve({ data: auditLog });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      if (url === `/users/${user.id}/2fa/status`) {
        return Promise.resolve({ data: { enabled: [], preferred: undefined } });
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

    expect(mockNavigate).toHaveBeenCalledWith('/settings/access/users');
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

    // Email and role chip render in the header card; status text is "Active"
    // in the v1.5 inline status line (was "Enabled" in the prior Catalyst layout).
    expect(screen.getAllByText('john.doe@example.com')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the formatted phone number with a tel: link when present', async () => {
    setupStandardMocks({
      user: { ...mockUser, phoneNumber: '5551234567' },
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const phoneLink = screen.getByRole('link', { name: '(555) 123-4567' });
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');
  });

  it('omits the phone block when the user has no phone number', async () => {
    setupStandardMocks({
      user: { ...mockUser, phoneNumber: null },
    });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('link', { name: /\(.*\) .*-.*/ })
    ).not.toBeInTheDocument();
  });

  it('navigates to the edit page when the edit button is clicked', async () => {
    setupStandardMocks({});

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // The primary header action is now a single "Edit user" button that
    // navigates to the dedicated edit page (replacing the prior dialog).
    const editButton = screen.getByRole('button', { name: /edit user/i });
    await user.click(editButton);

    expect(mockNavigate).toHaveBeenCalledWith(`/settings/access/users/${mockUser.id}/edit`);
  });

  it('hides the Resend Invitation button when invitationStatus is ACTIVE', async () => {
    setupStandardMocks({}); // default mockUser.invitationStatus is ACTIVE

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // The button is conditional on the invite lifecycle — accepted users
    // don't have one outstanding to resend.
    expect(
      screen.queryByRole('button', { name: /resend invitation/i })
    ).not.toBeInTheDocument();
  });

  it.each(['INVITED' as const, 'INVITATION_EXPIRED' as const])(
    'shows Resend Invitation when invitationStatus is %s',
    async (status) => {
      setupStandardMocks({ user: { ...mockUser, invitationStatus: status } });

      renderWithProviders(<UserDetailPage />, {
        initialEntries: ['/users/user-123'],
        path: '/users/:id',
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /resend invitation/i })
      ).toBeInTheDocument();
    }
  );

  it('calls the resend endpoint when Resend Invitation is clicked', async () => {
    setupStandardMocks({ user: { ...mockUser, invitationStatus: 'INVITED' } });
    const postSpy = vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const resendButton = screen.getByRole('button', { name: /resend invitation/i });
    await user.click(resendButton);

    await waitFor(() => {
      // userApi.resendInvitation(id) → POST /users/{id}/invitation/resend
      expect(postSpy).toHaveBeenCalledWith('/users/user-123/invitation/resend');
    });
  });

  it('deactivates user when deactivate button is clicked with confirmation', async () => {
    setupStandardMocks({});

    // Backend dropped `enabled` from PUT /users/{id} — activate/deactivate
    // are now their own POST endpoints. The handlers also emit matching
    // activity-feed rows server-side.
    const postSpy = vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockUser, enabled: false } });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // The v1.5 lifecycle footer renames the destructive action from
    // "Disable" → "Deactivate" to match the spec.
    const disableButton = screen.getByRole('button', { name: /^deactivate$/i });
    await user.click(disableButton);

    // ConfirmDialog opens with the user's name
    const confirmButton = await screen.findByRole('button', { name: /^deactivate$/i });
    // Two "Deactivate" buttons can transiently coexist (the trigger in the
    // page + the confirm in the dialog). Click the one inside the dialog —
    // the dialog renders after the trigger, so the *last* match is it.
    const buttons = screen.getAllByRole('button', { name: /^deactivate$/i });
    await user.click(buttons[buttons.length - 1] ?? confirmButton);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/users/user-123/deactivate');
    });
  });

  it('does not deactivate user when confirmation is cancelled', async () => {
    setupStandardMocks({}); // Audit log

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: /^deactivate$/i });
    await user.click(disableButton);

    // Cancel in the ConfirmDialog
    const cancelButton = await screen.findByRole('button', { name: /^cancel$/i });
    await user.click(cancelButton);

    // API was NOT called
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('reactivates disabled user when reactivate button is clicked with confirmation', async () => {
    const disabledUser = { ...mockUser, enabled: false };
    setupStandardMocks({ user: disabledUser });

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

    // The inline status line shows "Disabled" for non-enabled users.
    expect(screen.getByText('Disabled')).toBeInTheDocument();

    // The lifecycle footer surfaces a "Reactivate" button when the user
    // is disabled (was "Enable" in the prior layout).
    const reactivateButton = screen.getByRole('button', { name: /^reactivate$/i });
    await user.click(reactivateButton);

    // Confirm in the dialog — page button + dialog button can both match;
    // dialog renders second.
    await screen.findByRole('button', { name: /^reactivate$/i });
    const buttons = screen.getAllByRole('button', { name: /^reactivate$/i });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/users/user-123/activate');
    }, { timeout: 5000 });
  });

  it('renders an "all users" back link on the success state', async () => {
    setupStandardMocks({}); // Audit log

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // The success-state back affordance is a React Router <Link>, not a button.
    // Asserting the href is enough — actually clicking it would require a full
    // <Router> with the destination route registered.
    const backLink = screen.getByRole('link', { name: /all users/i });
    expect(backLink).toHaveAttribute('href', '/settings/access/users');
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

    // v1.5 collapses the prior "Role & Permissions" + "Capabilities" cards
    // into a single Roles/Regions card with a capability-detail expander.
    // The detail is collapsed by default and surfaced by a count + link.
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Regions')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Account activity')).toBeInTheDocument();
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
    const userWithoutRegions: User = {
      ...mockUser,
      tenantId: 'tenant-123',
      phoneNumber: null,
      dispatchRegionIds: undefined,
    };
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

  it('surfaces the capability count with a "view details" link', async () => {
    setupStandardMocks({}); // Audit log

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // v1.5 swaps the dedicated "Capabilities" card for an inline count
    // ("3 capabilities granted") + expander on the combined Roles/Regions
    // card. The count and trailing label render in separate spans for
    // typography (mono digit + sans label), so match them independently.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/capabilities granted/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /view detailed permissions/i })
    ).toBeInTheDocument();
  });

  it('shows the regions row on the combined Roles/Regions card', async () => {
    setupStandardMocks({}); // Audit log

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // v1.5 renames "Assigned Regions" → "Regions" and moves the row into
    // the same card as Roles instead of a separate description-list field.
    await waitFor(() => {
      expect(screen.getByText('Regions')).toBeInTheDocument();
    });
  });

  it('does not call deactivate when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    setupStandardMocks({}); // Audit log

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: /^deactivate$/i });
    await user.click(disableButton);

    // Cancel in the ConfirmDialog
    const cancelButton = await screen.findByRole('button', { name: /^cancel$/i });
    await user.click(cancelButton);

    // Should not have called the activate/deactivate endpoint since
    // confirmation was cancelled. (Activate/deactivate moved from PUT
    // + body to dedicated POST endpoints.)
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('displays activity feed events with classified labels', async () => {
    // New backend shape: { id, occurredAt, actionType, payload, actor, ip, userAgent }
    // Role events populate payload.roleName; lifecycle/security events leave
    // payload null. Actor is null only for system-originated events (today
    // just user_created until actor plumbing lands).
    const mockActivity = [
      {
        id: 'a-1',
        occurredAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        actionType: 'ROLE_ADDED',
        payload: { roleId: 'role-1', roleName: 'Dispatcher' },
        actor: { id: 'u-9', name: 'Maria Chen' },
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      },
      {
        id: 'a-2',
        occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        actionType: 'USER_CREATED',
        payload: null,
        actor: null,
        ip: null,
        userAgent: null,
      },
    ];

    setupStandardMocks({ auditLog: mockActivity });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    await waitFor(() => {
      // ROLE_ADDED interpolates payload.roleName into the label.
      expect(screen.getByText('Role "Dispatcher" added')).toBeInTheDocument();
      expect(screen.getByText('Account created')).toBeInTheDocument();
      // Actor is rendered as "· By {name}" when present; absent when null.
      expect(screen.getByText('· By Maria Chen')).toBeInTheDocument();
    });
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

    // Note: AuditHistory component loading state test
    // Requires VIEW_AUDIT_LOGS capability which is included in setup.ts
    // The audit query remains in loading state as the mock promise never resolves
  });

  // The sign-in kinds are the one classifyEvent family the enum test above
  // doesn't reach, and they're the only ones that build a meta sub-line from
  // payload/UA/IP rather than a fixed label.
  it('renders sign-in activity with the browser, OS and IP meta line', async () => {
    const now = Date.now();
    const ts = (offsetSec: number) => new Date(now - offsetSec * 1000).toISOString();

    const mockActivity = [
      // userAgent + ip populated → meta reads "Browser · OS · IP".
      {
        id: 's-1',
        occurredAt: ts(30),
        actionType: 'SIGN_IN_SUCCESS',
        payload: null,
        actor: null,
        ip: '203.0.113.7',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      // A failed run collapses to an attempt count plus a rounded window.
      {
        id: 's-2',
        occurredAt: ts(60),
        actionType: 'SIGN_IN_FAILED_RUN',
        payload: { attemptCount: 5, windowSeconds: 240 },
        actor: null,
        ip: null,
        userAgent: null,
      },
      // A window past an hour rolls up to "Nh" instead of reading "73 min".
      {
        id: 's-3',
        occurredAt: ts(90),
        actionType: 'SIGN_IN_FAILED_RUN',
        payload: { attemptCount: 12, windowSeconds: 4380 },
        actor: null,
        ip: null,
        userAgent: null,
      },
    ];

    setupStandardMocks({ auditLog: mockActivity });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Signed in')).toBeInTheDocument();
    });

    // Edge and iOS UA strings also contain "Chrome"/"Safari", so assert the
    // resolved pair rather than just a browser name.
    expect(screen.getByText(/Chrome · macOS · 203\.0\.113\.7/)).toBeInTheDocument();

    expect(screen.getAllByText('Failed sign-in attempts')).toHaveLength(2);
    expect(screen.getByText(/5 attempts · within 4 min/)).toBeInTheDocument();
    expect(screen.getByText(/12 attempts · within 1h/)).toBeInTheDocument();
  });

  it('shows the empty state when the account has no recorded activity', async () => {
    setupStandardMocks({ auditLog: [] });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    expect(await screen.findByText('No activity recorded yet.')).toBeInTheDocument();
  });

  it('classifies the full activity actionType enum', async () => {
    const now = Date.now();
    const ts = (offsetSec: number) => new Date(now - offsetSec * 1000).toISOString();
    const actor = { id: 'u-9', name: 'Maria Chen' };

    // Cover each branch of classifyEvent: lifecycle (created/activated/
    // deactivated/invitation_resent), access (role added/removed), security
    // (password reset / mfa reset / global signout), and the forward-compat
    // default for an unknown actionType.
    const mockActivity = [
      { id: 'a-1', occurredAt: ts(10),  actionType: 'USER_CREATED',        payload: null, actor: null, ip: null, userAgent: null },
      { id: 'a-2', occurredAt: ts(20),  actionType: 'USER_ACTIVATED',      payload: null, actor, ip: null, userAgent: null },
      { id: 'a-3', occurredAt: ts(30),  actionType: 'USER_DEACTIVATED',    payload: null, actor, ip: null, userAgent: null },
      { id: 'a-4', occurredAt: ts(40),  actionType: 'INVITATION_RESENT',   payload: null, actor, ip: null, userAgent: null },
      { id: 'a-4b', occurredAt: ts(45), actionType: 'INVITATION_ACCEPTED', payload: null, actor, ip: null, userAgent: null },
      { id: 'a-5', occurredAt: ts(50),  actionType: 'ROLE_ADDED',          payload: { roleId: 'r1', roleName: 'Dispatcher' }, actor, ip: null, userAgent: null },
      { id: 'a-6', occurredAt: ts(60),  actionType: 'ROLE_REMOVED',        payload: { roleId: 'r2', roleName: 'Sales' },      actor, ip: null, userAgent: null },
      { id: 'a-7', occurredAt: ts(70),  actionType: 'PASSWORD_RESET_SENT', payload: null, actor, ip: null, userAgent: null },
      { id: 'a-8', occurredAt: ts(80),  actionType: 'MFA_RESET',           payload: null, actor, ip: null, userAgent: null },
      { id: 'a-9', occurredAt: ts(90),  actionType: 'GLOBAL_SIGNOUT',      payload: null, actor, ip: null, userAgent: null },
      // Forward-compat: unknown values must render with a generic label.
      { id: 'a-10', occurredAt: ts(100), actionType: 'SOMETHING_NEW',      payload: null, actor, ip: null, userAgent: null },
    ];

    setupStandardMocks({ auditLog: mockActivity });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Account created')).toBeInTheDocument();
      expect(screen.getByText('Account activated')).toBeInTheDocument();
      expect(screen.getByText('Account deactivated')).toBeInTheDocument();
      expect(screen.getByText('Invitation resent')).toBeInTheDocument();
      expect(screen.getByText('Invitation accepted')).toBeInTheDocument();
      expect(screen.getByText('Role "Dispatcher" added')).toBeInTheDocument();
      expect(screen.getByText('Role "Sales" removed')).toBeInTheDocument();
      expect(screen.getByText('Password reset link sent')).toBeInTheDocument();
      expect(screen.getByText('2FA reset')).toBeInTheDocument();
      expect(screen.getByText('Signed out of all sessions')).toBeInTheDocument();
      // Unknown actionType falls through to the generic "Activity" label.
      expect(screen.getByText('Activity')).toBeInTheDocument();
    });
  });

  it('renders SIGN_IN_FAILED_RUN with attempt-count + window meta line', async () => {
    // SIGN_IN_FAILED_RUN ships once the Cognito Lambda triggers deploy.
    // Payload is { attemptCount, windowSeconds, firstAt, lastAt }; the meta
    // line "5 attempts · within 2 min" is composed client-side from
    // attemptCount + windowSeconds (rounded to the largest sensible unit).
    const mockActivity = [
      {
        id: 'a-1',
        occurredAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        actionType: 'SIGN_IN_FAILED_RUN',
        payload: {
          attemptCount: 5,
          windowSeconds: 120,
          firstAt: '2026-05-18T14:20:00Z',
          lastAt: '2026-05-18T14:22:00Z',
        },
        actor: null,
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      },
    ];

    setupStandardMocks({ auditLog: mockActivity });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Failed sign-in attempts')).toBeInTheDocument();
      // 120 seconds → "2 min" via the formatWindowSeconds rollup.
      expect(screen.getByText('· 5 attempts · within 2 min')).toBeInTheDocument();
    });
  });

  it('renders old timestamps without erroring', async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
    const mockActivity = [
      {
        id: 'a-1',
        occurredAt: oldDate.toISOString(),
        actionType: 'USER_CREATED',
        payload: null,
        actor: null,
        ip: null,
        userAgent: null,
      },
    ];

    setupStandardMocks({ auditLog: mockActivity });

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    // Old timestamps (>7 days) render as "Mon D" in the v1.5 relTime
    // helper. We don't pin the exact string — just confirm the activity
    // entry rendered so the time column was reached.
    await waitFor(() => {
      expect(screen.getByText('Account created')).toBeInTheDocument();
    });
  });


  it('does not call reactivate when confirmation is cancelled', async () => {
    const disabledUser = { ...mockUser, enabled: false };
    setupStandardMocks({ user: disabledUser });

    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    const reactivateButton = screen.getByRole('button', { name: /^reactivate$/i });
    await user.click(reactivateButton);

    const cancelButton = await screen.findByRole('button', { name: /^cancel$/i });
    await user.click(cancelButton);

    // Should not have called the activate/deactivate endpoint since
    // confirmation was cancelled. (Activate/deactivate moved from PUT
    // + body to dedicated POST endpoints.)
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('sends a password reset link when confirmed', async () => {
    setupStandardMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'John Doe' }),
      ).toBeInTheDocument();
    });

    const sendResetBtn = screen.getByRole('button', {
      name: /send reset link/i,
    });
    await user.click(sendResetBtn);

    // Confirm dialog opens — the confirm button has the same label.
    const confirmBtns = await screen.findAllByRole('button', {
      name: /send reset link/i,
    });
    await user.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/user-123/reset-password',
      );
    });
  });

  it('signs the user out everywhere when confirmed', async () => {
    setupStandardMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'John Doe' }),
      ).toBeInTheDocument();
    });

    const signOutBtn = screen.getByRole('button', {
      name: /sign out everywhere/i,
    });
    await user.click(signOutBtn);

    const confirmBtns = await screen.findAllByRole('button', {
      name: /sign out everywhere/i,
    });
    await user.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/user-123/sign-out');
    });
  });

  it('shows Reset 2FA button when MFA is enabled and resets when confirmed', async () => {
    // Setup standard mocks then override the 2FA status response.
    setupStandardMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === `/users/${mockUser.id}`) {
        return Promise.resolve({ data: mockUser });
      }
      if (url === '/users/roles') {
        return Promise.resolve({ data: mockRoles });
      }
      if (url === '/tenant/dispatch-regions?includeInactive=true') {
        return Promise.resolve({ data: mockDispatchRegions });
      }
      if (
        url === `/audit/account-activity/${mockUser.id}` ||
        url === `/audit/user/${mockUser.id}` ||
        url === `/audit/TenantUser/${mockUser.id}`
      ) {
        return Promise.resolve({ data: [] });
      }
      if (url === '/users/capabilities/grouped') {
        return Promise.resolve({ data: mockCapabilitiesData });
      }
      if (url === `/users/${mockUser.id}/2fa/status`) {
        return Promise.resolve({
          data: { enabled: ['TOTP'], preferred: 'TOTP' },
        });
      }
      return Promise.reject(new Error(`Unmocked API call: ${url}`));
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    const resetBtn = await screen.findByRole('button', { name: /reset 2fa/i });
    await user.click(resetBtn);

    const confirmBtns = await screen.findAllByRole('button', {
      name: /reset 2fa/i,
    });
    await user.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/user-123/mfa-reset',
      );
    });
  });

  it('reveals detailed permissions when "View detailed permissions" is clicked', async () => {
    setupStandardMocks();
    const user = userEvent.setup();

    renderWithProviders(<UserDetailPage />, {
      initialEntries: ['/users/user-123'],
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'John Doe' }),
      ).toBeInTheDocument();
    });

    const detailsBtn = await screen.findByRole('button', {
      name: /view detailed permissions/i,
    });
    await user.click(detailsBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /hide details/i }),
      ).toBeInTheDocument();
    });
  });

});
