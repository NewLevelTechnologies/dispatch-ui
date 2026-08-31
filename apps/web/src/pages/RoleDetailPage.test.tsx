import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RoleDetailPage from './RoleDetailPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'role-123' }),
  };
});

const customRole = {
  id: 'role-123',
  name: 'Refund Approver',
  description: 'Custom stack role',
  capabilities: ['REFUND_INVOICES'],
  isProtected: false,
  isSystemRole: false,
  updatedAt: '2024-05-09T08:00:00Z',
};

const builtInAdminRole = {
  id: 'role-123',
  name: 'Admin',
  description: 'Full access',
  capabilities: ['VIEW_WORK_ORDERS', 'EDIT_WORK_ORDERS', 'REFUND_INVOICES'],
  isProtected: true,
  isSystemRole: true,
  systemRoleCode: 'ADMIN',
  updatedAt: '2024-04-18T14:22:00Z',
};

const groupedCaps = {
  groups: [
    {
      featureArea: 'WORK_ORDERS',
      displayName: 'Work Orders',
      capabilities: [
        { name: 'VIEW_WORK_ORDERS', displayName: 'View Work Orders', description: '' },
        { name: 'EDIT_WORK_ORDERS', displayName: 'Edit Work Orders', description: '' },
      ],
    },
    {
      featureArea: 'BILLING',
      displayName: 'Billing',
      capabilities: [
        { name: 'REFUND_INVOICES', displayName: 'Refund Invoices', description: '' },
        { name: 'VOID_INVOICES', displayName: 'Void Invoices', description: '' },
      ],
    },
  ],
};

function mockGets(
  role: typeof customRole | typeof builtInAdminRole,
  members: { id: string; firstName: string; lastName: string; email: string; photoUrl: string | null; roles: { id: string; name: string }[] }[] = []
) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === `/users/roles/${role.id}`)
      return Promise.resolve({ data: role });
    if (url.startsWith(`/users/roles/${role.id}/members`))
      return Promise.resolve({
        data: {
          content: members,
          page: 0,
          size: 100,
          totalElements: members.length,
          totalPages: members.length === 0 ? 0 : 1,
          counts: null,
        },
      });
    if (url === '/users/capabilities/grouped')
      return Promise.resolve({ data: groupedCaps });
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

describe('RoleDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('loading + error', () => {
    it('shows loading state', async () => {
      vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
      renderWithProviders(<RoleDetailPage />);
      // LoadingState has a 250ms delay before becoming visible; page uses
      // singular ("Loading role...") since the detail is about one role.
      expect(await screen.findByText('Loading role...')).toBeInTheDocument();
    });

    it('shows error state with back button', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('network'));
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading role/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('renders name, type pill, clone + edit buttons for custom roles', async () => {
      mockGets(customRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /refund approver/i })
        ).toBeInTheDocument();
      });

      // Type pill — "Custom" appears in the header (and likely the lifecycle
      // footer surfaces). At least one Custom pill.
      expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /clone role/i })).toBeInTheDocument();

      const editLink = screen.getByRole('link', { name: /edit capabilities/i });
      expect(editLink).toHaveAttribute(
        'href',
        '/settings/access/roles/role-123/edit'
      );
    });

    it('shows Built-in pill for protected roles', async () => {
      mockGets(builtInAdminRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
      });
      expect(screen.getAllByText('Built-in').length).toBeGreaterThan(0);
    });
  });

  describe('description card', () => {
    it('locks Edit for Admin role', async () => {
      mockGets(builtInAdminRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
      });

      // Two edit affordances exist; the inline Description Edit is the one
      // expected to be disabled for the Admin system role. There's no link
      // role for a disabled button — assert by name + disabled state.
      const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
      const disabled = editButtons.find((b) => b.hasAttribute('disabled'));
      expect(disabled).toBeTruthy();
    });

    it('keeps Edit enabled for non-Admin roles', async () => {
      mockGets(customRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /refund approver/i })
        ).toBeInTheDocument();
      });

      // The Edit on the description card is rendered as an <a> link.
      const editLinks = screen.getAllByRole('link', { name: /^edit$/i });
      expect(editLinks.length).toBeGreaterThan(0);
      expect(editLinks[0]).toHaveAttribute(
        'href',
        '/settings/access/roles/role-123/edit'
      );
    });
  });

  describe('capabilities grid', () => {
    it('renders only granted capabilities by default', async () => {
      mockGets(customRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /refund approver/i })
        ).toBeInTheDocument();
      });

      // Granted-only mode: Refund Approver only has REFUND_INVOICES, so
      // "Refund Invoices" shows, but "Void Invoices" and the work-orders
      // capability labels do not.
      expect(screen.getByText('Refund Invoices')).toBeInTheDocument();
      expect(screen.queryByText('Void Invoices')).not.toBeInTheDocument();
      expect(screen.queryByText('View Work Orders')).not.toBeInTheDocument();
    });

    it('reveals all capabilities (including not-granted) in Show all mode', async () => {
      mockGets(customRole);
      const user = userEvent.setup();
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /refund approver/i })
        ).toBeInTheDocument();
      });

      // ToggleGroup is built on Headless RadioGroup — options expose
      // role="radio", not role="button".
      await user.click(screen.getByRole('radio', { name: /show all/i }));

      await waitFor(() => {
        expect(screen.getByText('View Work Orders')).toBeInTheDocument();
      });
      expect(screen.getByText('Edit Work Orders')).toBeInTheDocument();
      expect(screen.getByText('Void Invoices')).toBeInTheDocument();
    });
  });

  describe('members card', () => {
    it('shows the empty state when the stub returns no members', async () => {
      mockGets(customRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No users have this role yet.')
        ).toBeInTheDocument();
      });
    });

    it('navigates to Users when the empty-state Add user CTA is clicked', async () => {
      mockGets(customRole);
      const user = userEvent.setup();
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No users have this role yet.')
        ).toBeInTheDocument();
      });

      const addBtn = screen.getByRole('button', { name: /add user/i });
      await user.click(addBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/users');
    });

    it('renders member rows + derives sub-line from a member\'s other roles', async () => {
      mockGets(customRole, [
        {
          id: 'u1',
          firstName: 'Maria',
          lastName: 'Chen',
          email: 'maria@example.com',
          photoUrl: null,
          // Holds both the current role (Refund Approver = role-123) AND
          // Field Supervisor. Sub-line should prefer the non-current role.
          roles: [
            { id: 'role-123', name: 'Refund Approver' },
            { id: 'role-fs', name: 'Field Supervisor' },
          ],
        },
        {
          id: 'u2',
          firstName: 'Sam',
          lastName: 'Singh',
          email: 'sam@example.com',
          photoUrl: null,
          // Only has the current role — sub-line falls back to it.
          roles: [{ id: 'role-123', name: 'Refund Approver' }],
        },
      ]);
      renderWithProviders(<RoleDetailPage />);

      // Member rows render
      expect(await screen.findByText('Maria Chen')).toBeInTheDocument();
      expect(screen.getByText('Sam Singh')).toBeInTheDocument();

      // Sub-line for Maria: "Field Supervisor" (other role)
      expect(screen.getByText('Field Supervisor')).toBeInTheDocument();
      // Sub-line for Sam: falls back to "Refund Approver"
      // (appears in heading too — assert via getAllByText length > 0)
      expect(screen.getAllByText('Refund Approver').length).toBeGreaterThan(0);
    });
  });

  describe('lifecycle footer', () => {
    it('renders the built-in lock variant for protected roles', async () => {
      mockGets(builtInAdminRole);
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Built-in role')).toBeInTheDocument();
      });
    });

    it('renders the delete-role variant for custom roles', async () => {
      mockGets(customRole);
      renderWithProviders(<RoleDetailPage />);

      // "Delete role" appears twice in this variant — title text + button
      // label. getAllByText is the correct match.
      await waitFor(() => {
        expect(screen.getAllByText('Delete role').length).toBeGreaterThan(0);
      });
      const deleteButtons = screen.getAllByRole('button', { name: /delete role/i });
      expect(deleteButtons.some((b) => !b.hasAttribute('disabled'))).toBe(true);
    });

    it('opens the delete confirm when Delete role is clicked', async () => {
      mockGets(customRole);
      const user = userEvent.setup();
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Delete role').length).toBeGreaterThan(0);
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete role/i });
      const enabled = deleteButtons.find((b) => !b.hasAttribute('disabled'))!;
      await user.click(enabled);

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete refund approver/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('clone action', () => {
    it('clones via the header Clone button and navigates to the new edit page', async () => {
      mockGets(customRole);
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { ...customRole, id: 'role-cloned' },
      });
      const user = userEvent.setup();
      renderWithProviders(<RoleDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /refund approver/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /clone role/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/users/roles/role-123/clone',
          expect.objectContaining({ name: 'Refund Approver (copy)' })
        );
      });
      expect(mockNavigate).toHaveBeenCalledWith(
        '/settings/access/roles/role-cloned/edit'
      );
    });
  });
});
