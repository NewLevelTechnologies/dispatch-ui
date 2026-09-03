import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import UsersPage from './UsersPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

// react-router's useNavigate is the side-effect we assert on for row clicks,
// dropdown actions, and the add CTA — patch it once for the whole file.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockRoles = [
  { id: 'role-1', name: 'Admin', description: 'Administrator role' },
  { id: 'role-2', name: 'Technician', description: 'Field technician role' },
];

type MockUser = {
  id: string;
  tenantId: string;
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  invitationStatus?: 'ACTIVE' | 'INVITED' | 'INVITATION_EXPIRED';
  roles: { id: string; name: string; description?: string }[];
  createdAt: string;
  updatedAt: string;
};

const mockUsers: MockUser[] = [
  {
    id: 'user-1',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-123',
    email: 'john.doe@example.com',
    firstName: 'John',
    lastName: 'Doe',
    enabled: true,
    invitationStatus: 'ACTIVE',
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
    invitationStatus: 'ACTIVE',
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
    invitationStatus: 'INVITED',
    roles: [],
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-25T09:15:00Z',
  },
];

// Spring page envelope wrapper used by `GET /users` now. Counts ignores the
// status / invitation filters per the BE contract, but we don't exercise
// that nuance — disabled count = enabled-filtered set is close enough for
// the subtitle tests.
function pageOf(users: MockUser[], opts: { counts?: { disabled: number; invited: number } } = {}) {
  return {
    data: {
      content: users,
      page: 0,
      size: 50,
      totalElements: users.length,
      totalPages: users.length === 0 ? 0 : 1,
      counts: opts.counts ?? {
        disabled: users.filter((u) => !u.enabled).length,
        invited: users.filter((u) => u.invitationStatus && u.invitationStatus !== 'ACTIVE').length,
      },
    },
  };
}

// Parse the URL the page sent and return the matching slice of `users`.
// Mirrors the server's filter semantics (case-insensitive contains on
// firstName/lastName/email; enabled boolean; repeatable roleId and
// invitationStatus).
function applyUsersQuery(url: string, users: MockUser[]): MockUser[] {
  const qi = url.indexOf('?');
  const params = new URLSearchParams(qi >= 0 ? url.slice(qi + 1) : '');
  let out = users;
  const q = params.get('q')?.toLowerCase();
  if (q) {
    out = out.filter(
      (u) =>
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }
  const enabled = params.get('enabled');
  if (enabled === 'true') out = out.filter((u) => u.enabled);
  else if (enabled === 'false') out = out.filter((u) => !u.enabled);
  const roleIds = params.getAll('roleId');
  if (roleIds.length > 0) {
    out = out.filter((u) => u.roles.some((r) => roleIds.includes(r.id)));
  }
  const invitationStatuses = params.getAll('invitationStatus');
  if (invitationStatuses.length > 0) {
    out = out.filter((u) => u.invitationStatus && invitationStatuses.includes(u.invitationStatus));
  }
  return out;
}

function installApiMock(users: MockUser[] = mockUsers, roles = mockRoles) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.startsWith('/users/roles')) {
      return Promise.resolve({ data: roles });
    }
    if (url === '/users' || url.startsWith('/users?')) {
      return Promise.resolve(pageOf(applyUsersQuery(url, users)));
    }
    if (url === '/users/me') {
      return Promise.resolve({ data: users[0] ?? null });
    }
    return Promise.reject(new Error(`Unknown URL: ${url}`));
  });
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    installApiMock();
  });

  it('renders the page title and add button', async () => {
    renderWithProviders(<UsersPage />);

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching users', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<UsersPage />);

    // LoadingState has a 250 ms delay before becoming visible.
    expect(await screen.findByText('Loading users...')).toBeInTheDocument();
  });

  it('displays users in a table', async () => {
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane.smith@example.com')).toBeInTheDocument();
  });

  it('displays role badges for users', async () => {
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Technician')).toBeInTheDocument();
  });

  it('displays enabled/disabled status indicators', async () => {
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);
  });

  it('displays an em-dash for users with no roles', async () => {
    installApiMock([mockUsers[2]]);

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/couldn.?t load users/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('displays empty state when no users exist', async () => {
    installApiMock([]);

    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/no users yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/invite your team to get started/i)).toBeInTheDocument();
    // PageHead + EmptyState both expose an "Add user" CTA when permitted.
    expect(screen.getAllByRole('button', { name: /^add user$/i }).length).toBeGreaterThan(0);
  });

  it('navigates to detail page when row is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    await user.click(screen.getByText('John Doe'));

    expect(mockNavigate).toHaveBeenCalledWith('/settings/access/users/user-1');
  });

  it('navigates to edit page when edit menu item is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    await user.click(screen.getByRole('menuitem', { name: /edit/i }));

    expect(mockNavigate).toHaveBeenCalledWith(`/settings/access/users/${mockUsers[0].id}/edit`);
  });

  it('does not navigate when dropdown is clicked', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    expect(router.state.location.pathname).toBe('/');
  });

  it('opens disable confirmation for enabled users', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    await user.click(screen.getByRole('menuitem', { name: /disable/i }));

    // Scoped to the workspace, not the account. No tenant settings are mocked
    // here, so the title falls back to the generic workspace phrase.
    await waitFor(() => {
      expect(screen.getByText(/remove john doe from this workspace/i)).toBeInTheDocument();
    });
  });

  it('opens enable confirmation for disabled users', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[1]);

    await user.click(screen.getByRole('menuitem', { name: /enable/i }));

    await waitFor(() => {
      expect(screen.getByText(/enable jane smith/i)).toBeInTheDocument();
    });
  });

  it('calls disable mutation when confirmed', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockUsers[0], enabled: false } });
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: /disable/i }));

    const confirmButton = await screen.findByRole('button', { name: /^disable$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/user-1/deactivate');
    });
  });

  it('opens delete alert when delete menu item is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/delete john doe/i)).toBeInTheDocument();
      expect(
        screen.getByText(/all user data and history will be permanently removed/i)
      ).toBeInTheDocument();
    });
  });

  it('calls delete mutation when confirmed', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    const confirmButton = await screen.findByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/users/user-1');
    });
  });

  it('cancels delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  describe('Search', () => {
    it('shows the search input', async () => {
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Placeholder reflects the new server-side q semantics (name + email).
      expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
    });

    it('queries the server and filters users by q', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      await user.type(searchInput, 'jane');

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });

      // Verify the q param hit the wire.
      const calls = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
      expect(calls.some((url) => typeof url === 'string' && url.includes('q=jane'))).toBe(true);
    });

    it('shows the no-match empty state when q returns zero rows', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      await user.type(searchInput, 'nonexistentuser');

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
      });
    });
  });

  describe('Role filter', () => {
    it('renders the role filter chip', async () => {
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^Role$/i })).toBeInTheDocument();
    });

    it('filters users by selected role via the server', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Role$/i }));
      await user.click(screen.getByRole('option', { name: /^admin$/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });

      const calls = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
      expect(
        calls.some((url) => typeof url === 'string' && url.includes('roleId=role-1'))
      ).toBe(true);
    });

    it('clears the role filter via the chip × button', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Role$/i }));
      await user.click(screen.getByRole('option', { name: /^admin$/i }));

      await waitFor(() => {
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /role.*clear/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Status filter', () => {
    it('renders the status filter chip', async () => {
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^Status$/i })).toBeInTheDocument();
    });

    it('filters users by enabled status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Status$/i }));
      await user.click(screen.getByRole('option', { name: /^enabled$/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });

      const calls = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
      expect(
        calls.some((url) => typeof url === 'string' && url.includes('enabled=true'))
      ).toBe(true);
    });

    it('filters users by disabled status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Status$/i }));
      await user.click(screen.getByRole('option', { name: /^disabled$/i }));

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
        expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
      });
    });
  });

  describe('Invitation filter', () => {
    it('renders the invitation filter chip', async () => {
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^Invitation$/i })).toBeInTheDocument();
    });

    it('filters users by INVITED status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Invitation$/i }));
      await user.click(screen.getByRole('option', { name: /^invited$/i }));

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });

      const calls = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
      expect(
        calls.some(
          (url) => typeof url === 'string' && url.includes('invitationStatus=INVITED')
        )
      ).toBe(true);
    });
  });

  describe('Per-chip clear', () => {
    it('hides × on chips when empty and shows it when set', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /status.*clear/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Status$/i }));
      await user.click(screen.getByRole('option', { name: /^enabled$/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /status.*clear/i })).toBeInTheDocument();
      });
    });

    it('clears each filter independently', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^Role$/i }));
      await user.click(screen.getByRole('option', { name: /^admin$/i }));

      await waitFor(() => {
        const statusBtn = screen.getByRole('button', { name: /^Status$/i });
        return user.click(statusBtn);
      });
      await user.click(screen.getByRole('option', { name: /^enabled$/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
        expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /role.*clear/i }));
      await user.click(screen.getByRole('button', { name: /status.*clear/i }));

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });
    });
  });

  describe('Enable user', () => {
    it('calls enable mutation when confirmed', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockUsers[1], enabled: true } });
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
      await user.click(dropdownButtons[1]);
      await user.click(screen.getByRole('menuitem', { name: /enable/i }));

      const confirmButton = await screen.findByRole('button', { name: /^enable$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/users/user-2/activate');
      });
    });
  });

  describe('Invite navigation', () => {
    it('navigates to the invite page when "Add user" is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add user/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/users/new');
    });

    it('navigates to the invite page from the empty-state CTA', async () => {
      installApiMock([]);
      const user = userEvent.setup();
      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText(/no users yet/i)).toBeInTheDocument();
      });

      const addButtons = screen.getAllByRole('button', { name: /^add user$/i });
      await user.click(addButtons[addButtons.length - 1]);

      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/users/new');
    });
  });

  describe('Pagination', () => {
    // Build a synthetic dataset large enough to span multiple pages and
    // install a mock that respects ?page and ?size on the wire so we can
    // assert both the URL link the page renders AND the request that goes
    // out when a page is selected.
    function makePagedUsers(count: number): MockUser[] {
      return Array.from({ length: count }, (_, i) => ({
        id: `paged-${i + 1}`,
        tenantId: 'tenant-1',
        cognitoSub: `cognito-${i + 1}`,
        email: `user${i + 1}@example.com`,
        firstName: `User`,
        lastName: `Number${String(i + 1).padStart(3, '0')}`,
        enabled: true,
        invitationStatus: 'ACTIVE' as const,
        roles: [mockRoles[0]],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }));
    }

    function installPagedMock(allUsers: MockUser[]) {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.startsWith('/users/roles')) {
          return Promise.resolve({ data: mockRoles });
        }
        if (url === '/users' || url.startsWith('/users?')) {
          const qi = url.indexOf('?');
          const params = new URLSearchParams(qi >= 0 ? url.slice(qi + 1) : '');
          const page = parseInt(params.get('page') || '0', 10);
          const size = parseInt(params.get('size') || '50', 10);
          const slice = allUsers.slice(page * size, (page + 1) * size);
          return Promise.resolve({
            data: {
              content: slice,
              page,
              size,
              totalElements: allUsers.length,
              totalPages: Math.ceil(allUsers.length / size),
              counts: { disabled: 0, invited: 0 },
            },
          });
        }
        if (url === '/users/me') return Promise.resolve({ data: allUsers[0] ?? null });
        return Promise.reject(new Error(`Unknown URL: ${url}`));
      });
    }

    it('renders pagination links and shows the first page slice', async () => {
      const all = makePagedUsers(137);
      installPagedMock(all);

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        // First page only — last row on page 1 is User Number050.
        expect(screen.getByText('User Number050')).toBeInTheDocument();
        expect(screen.queryByText('User Number051')).not.toBeInTheDocument();
      });

      // Subtitle reflects the *full* set, not just the page slice.
      expect(screen.getByText(/137 users/)).toBeInTheDocument();

      // Pagination renders pages 2 and 3 as anchor hrefs. Router resolves the
      // `?page=N` relative href against the current pathname (`/` in tests),
      // so the rendered attribute is `/?page=N`.
      expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute(
        'href',
        '/?page=2'
      );
      expect(screen.getByRole('link', { name: 'Page 3' })).toHaveAttribute(
        'href',
        '/?page=3'
      );
    });

    it('requests page=1 (0-based) when the user navigates to page 2', async () => {
      const all = makePagedUsers(137);
      installPagedMock(all);
      const user = userEvent.setup();

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('User Number001')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('link', { name: 'Page 2' }));

      // Page 2 slice — User Number051 first, User Number100 last.
      await waitFor(() => {
        expect(screen.getByText('User Number051')).toBeInTheDocument();
        expect(screen.queryByText('User Number001')).not.toBeInTheDocument();
      });

      // Verify the server saw page=1 (the page is 1-based in the UI/URL,
      // 0-based on the wire).
      const calls = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
      expect(
        calls.some((url) => typeof url === 'string' && /(\?|&)page=1(&|$)/.test(url))
      ).toBe(true);
    });

    it('hides pagination when there is only one page of results', async () => {
      const all = makePagedUsers(3);
      installPagedMock(all);

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('User Number001')).toBeInTheDocument();
      });

      // No page links rendered — totalPages <= 1 collapses to the count-only band.
      expect(screen.queryByRole('link', { name: /^Page \d+$/ })).not.toBeInTheDocument();
    });
  });

  describe('Counts subtitle', () => {
    it('renders disabled and invited breakdown from the envelope counts', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.startsWith('/users/roles')) return Promise.resolve({ data: mockRoles });
        if (url === '/users' || url.startsWith('/users?')) {
          return Promise.resolve({
            data: {
              content: mockUsers,
              page: 0,
              size: 50,
              totalElements: mockUsers.length,
              totalPages: 1,
              // Global counts — not derived from the page slice.
              counts: { disabled: 5, invited: 12 },
            },
          });
        }
        return Promise.reject(new Error(`Unknown URL: ${url}`));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Subtitle is one composite line; assert the pieces appear together.
      expect(screen.getByText(/3 users · 5 disabled · 12 invited/)).toBeInTheDocument();
    });

    it('hides the breakdown pills when counts are zero', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.startsWith('/users/roles')) return Promise.resolve({ data: mockRoles });
        if (url === '/users' || url.startsWith('/users?')) {
          return Promise.resolve({
            data: {
              content: mockUsers,
              page: 0,
              size: 50,
              totalElements: mockUsers.length,
              totalPages: 1,
              counts: { disabled: 0, invited: 0 },
            },
          });
        }
        return Promise.reject(new Error(`Unknown URL: ${url}`));
      });

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Bare count, no "· N disabled" tail when the count is zero.
      expect(screen.getByText('3 users')).toBeInTheDocument();
      expect(screen.queryByText(/disabled/)).not.toBeInTheDocument();
      expect(screen.queryByText(/invited/)).not.toBeInTheDocument();
    });
  });

  describe('Multiple roles display', () => {
    it('displays user with multiple roles', async () => {
      const userWithMultipleRoles: MockUser = {
        ...mockUsers[0],
        roles: [mockRoles[0], mockRoles[1]],
      };
      installApiMock([userWithMultipleRoles]);

      renderWithProviders(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Technician')).toBeInTheDocument();
    });
  });
});
