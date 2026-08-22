import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import RolesPage from './RolesPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

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
    id: 'role-admin',
    name: 'Admin',
    description: 'Full access role',
    capabilities: ['ALL'],
    capabilityCount: 1,
    userCount: 1,
    isProtected: true,
    isSystemRole: true,
    systemRoleCode: 'ADMIN',
    updatedAt: '2024-04-18T14:22:00Z',
  },
  {
    id: 'role-tech',
    name: 'Technician',
    description: 'Field technician',
    capabilities: ['VIEW_WORK_ORDERS', 'EDIT_WORK_ORDERS'],
    capabilityCount: 2,
    userCount: 2,
    isProtected: true,
    isSystemRole: true,
    systemRoleCode: 'TECHNICIAN',
    updatedAt: '2024-02-14T10:00:00Z',
  },
  {
    id: 'role-refund',
    name: 'Refund Approver',
    description: 'Custom stack role',
    capabilities: ['REFUND_INVOICES'],
    capabilityCount: 1,
    userCount: 0,
    isProtected: false,
    isSystemRole: false,
    updatedAt: '2024-05-09T08:00:00Z',
  },
];

const mockUsers = [
  {
    id: 'u1',
    tenantId: 't',
    cognitoSub: 's',
    email: 'a@a.com',
    firstName: 'A',
    lastName: 'A',
    enabled: true,
    roles: [mockRoles[0]],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'u2',
    tenantId: 't',
    cognitoSub: 's',
    email: 'b@b.com',
    firstName: 'B',
    lastName: 'B',
    enabled: true,
    roles: [mockRoles[1]],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'u3',
    tenantId: 't',
    cognitoSub: 's',
    email: 'c@c.com',
    firstName: 'C',
    lastName: 'C',
    enabled: true,
    roles: [mockRoles[1]],
    createdAt: '',
    updatedAt: '',
  },
];

const mockCapabilities = {
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
      ],
    },
  ],
};

// Centralized GET handler — each test can override individual URLs by
// re-mocking before mount, but most tests just need everything wired.
function mockAllGets() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/users/roles') return Promise.resolve({ data: mockRoles });
    if (url === '/users') return Promise.resolve({ data: mockUsers });
    if (url === '/users/capabilities/grouped')
      return Promise.resolve({ data: mockCapabilities });
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

describe('RolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('header', () => {
    it('renders title, kebab menu, and Add role CTA', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
      // Add role — anchor href
      const addLink = screen.getByRole('link', { name: /add role/i });
      expect(addLink).toHaveAttribute('href', '/settings/access/roles/new');
      // "Restore all defaults" now lives behind the page-header kebab.
      // Open it and verify the menu item appears.
      const kebabs = screen.getAllByRole('button', { name: /more options/i });
      // First kebab is the page-header one (row kebabs come after).
      await user.click(kebabs[0]);
      expect(
        await screen.findByRole('menuitem', { name: /restore all defaults/i })
      ).toBeInTheDocument();
    });

    it('disables Restore all defaults when no protected roles exist', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url === '/users/roles') return Promise.resolve({ data: [mockRoles[2]] });
        if (url === '/users') return Promise.resolve({ data: [] });
        if (url === '/users/capabilities/grouped')
          return Promise.resolve({ data: mockCapabilities });
        return Promise.reject(new Error(url));
      });
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });
      const kebabs = screen.getAllByRole('button', { name: /more options/i });
      await user.click(kebabs[0]);
      const item = await screen.findByRole('menuitem', { name: /restore all defaults/i });
      // Headless MenuItem reflects the disabled prop via aria-disabled.
      expect(item).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('summary strip', () => {
    it('shows 5 cells with derived totals', async () => {
      mockAllGets();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      // The strip labels — note "Built-in" + "Custom" appear in multiple
      // places (summary cell + table pill), so we look up each label as text.
      expect(screen.getAllByText('Roles').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Built-in').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
      expect(screen.getByText('Users assigned')).toBeInTheDocument();
      expect(screen.getByText('Total capabilities')).toBeInTheDocument();
    });
  });

  describe('table', () => {
    it('renders one row per role with description + type pill', async () => {
      mockAllGets();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });
      expect(screen.getByText('Technician')).toBeInTheDocument();
      expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      expect(screen.getByText('Field technician')).toBeInTheDocument();
      expect(screen.getByText('Custom stack role')).toBeInTheDocument();
    });

    it('sorts by user count descending', async () => {
      mockAllGets();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Technician')).toBeInTheDocument();
      });

      // Tech has 2 users, Admin has 1, Refund Approver has 0 — order should
      // match that. Clickable DenseRows expose `role="button"` (not `role="row"`)
      // so query the tbody directly.
      const cells = Array.from(document.querySelectorAll('tbody tr'));
      const orderedNames = cells.map(
        (row) => within(row as HTMLElement).getByText(/Admin|Technician|Refund Approver/).textContent
      );
      expect(orderedNames).toEqual(['Technician', 'Admin', 'Refund Approver']);
    });

    it('navigates to detail page when row is clicked', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Admin'));
      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/roles/role-admin');
    });
  });

  describe('search', () => {
    it('filters rows by name', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search roles…'), 'refund');
      await waitFor(() => {
        expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Refund Approver')).toBeInTheDocument();
    });
  });

  describe('loading / error / empty states', () => {
    it('shows the loading state', async () => {
      vi.mocked(apiClient.get).mockImplementation(
        () => new Promise(() => {})
      );
      renderWithProviders(<RolesPage />);

      expect(await screen.findByText('Loading roles...')).toBeInTheDocument();
    });

    it('shows the error state with retry button', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading roles/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('shows the no-filter empty state when there are zero roles', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url === '/users/roles') return Promise.resolve({ data: [] });
        if (url === '/users') return Promise.resolve({ data: [] });
        if (url === '/users/capabilities/grouped')
          return Promise.resolve({ data: mockCapabilities });
        return Promise.reject(new Error(url));
      });
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText(/no roles found/i)).toBeInTheDocument();
      });
      // The empty-state "Add role" link is the primary CTA.
      const addLinks = screen.getAllByRole('link', { name: /add role/i });
      expect(addLinks.length).toBeGreaterThan(0);
    });

    it('shows filtered-empty when search yields no rows + clears via button', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search roles…'), 'nomatch-xyz');
      await waitFor(() => {
        expect(screen.getByText(/no roles match your filters/i)).toBeInTheDocument();
      });
      const clearBtn = screen.getByRole('button', { name: /clear filters/i });
      await user.click(clearBtn);

      // After clear, table comes back.
      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });
    });
  });

  describe('filter chips', () => {
    it('Type filter restricts to built-in roles', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      // Open the Type chip, pick "Built-in".
      await user.click(screen.getByRole('button', { name: /^type$/i }));
      const builtInOption = await screen.findByRole('option', { name: /built-in/i });
      await user.click(builtInOption);

      await waitFor(() => {
        expect(screen.queryByText('Refund Approver')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('Has-users filter "No" hides roles with users', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /has users/i }));
      const noOption = await screen.findByRole('option', { name: /^no$/i });
      await user.click(noOption);

      await waitFor(() => {
        // Admin has a user, gets hidden. Refund Approver has none, stays.
        expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Refund Approver')).toBeInTheDocument();
    });

    it('clearing a single chip via × restores the dropped rows', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      // Pick the Type filter
      await user.click(screen.getByRole('button', { name: /^type$/i }));
      const builtInOption = await screen.findByRole('option', { name: /built-in/i });
      await user.click(builtInOption);

      // The chip × button now appears — clicking it fires `onClear` (a distinct
      // arrow callback from the `onChange` we hit above).
      await waitFor(() => {
        expect(screen.queryByText('Refund Approver')).not.toBeInTheDocument();
      });
      const clearChip = screen.getByRole('button', { name: /type — clear/i });
      await user.click(clearChip);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });
    });
  });

  describe('kebab actions', () => {
    it('shows Edit link to /:id/edit', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      // Open kebab on the custom role row — find dropdown button inside the row.
      const row = screen.getByText('Refund Approver').closest('tr')!;
      const kebab = within(row).getByRole('button', { name: /more options/i });
      await user.click(kebab);

      // Edit menuitem is an <a> with href
      const editItem = await screen.findByRole('menuitem', { name: /edit/i });
      expect(editItem).toHaveAttribute(
        'href',
        '/settings/access/roles/role-refund/edit'
      );
    });

    it('shows Delete only for custom roles with no users', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      // Admin is protected → no Delete in kebab
      const adminRow = screen.getByText('Admin').closest('tr')!;
      await user.click(within(adminRow).getByRole('button', { name: /more options/i }));
      expect(
        screen.queryByRole('menuitem', { name: /^delete$/i })
      ).not.toBeInTheDocument();
    });

    it('opens delete confirm on the eligible custom role', async () => {
      mockAllGets();
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      const row = screen.getByText('Refund Approver').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /more options/i }));
      const deleteItem = await screen.findByRole('menuitem', { name: /^delete$/i });
      await user.click(deleteItem);

      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete refund approver/i)
        ).toBeInTheDocument();
      });
    });

    it('clones the role and navigates to its edit page on Duplicate', async () => {
      mockAllGets();
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { ...mockRoles[2], id: 'role-new' },
      });
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Refund Approver')).toBeInTheDocument();
      });

      const row = screen.getByText('Refund Approver').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /more options/i }));
      const dupItem = await screen.findByRole('menuitem', { name: /duplicate/i });
      await user.click(dupItem);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/users/roles/role-refund/clone',
          expect.objectContaining({ name: 'Refund Approver (copy)' })
        );
      });
      expect(mockNavigate).toHaveBeenCalledWith(
        '/settings/access/roles/role-new/edit'
      );
    });
  });

  describe('restore all defaults', () => {
    it('opens the confirmation and invokes the endpoint', async () => {
      mockAllGets();
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { restoredRoles: [], recreatedRoles: [], preservedCustomRoles: [] },
      });
      const user = userEvent.setup();
      renderWithProviders(<RolesPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      // Open the page-header kebab (first 'more options' button — row
      // kebabs follow it) and click the "Restore all defaults" menuitem.
      const kebabs = screen.getAllByRole('button', { name: /more options/i });
      await user.click(kebabs[0]);
      const item = await screen.findByRole('menuitem', {
        name: /restore all defaults/i,
      });
      await user.click(item);

      await waitFor(() => {
        expect(
          screen.getByText('Restore All Default Roles?')
        ).toBeInTheDocument();
      });

      // The destructive confirm button has the same label as the menu item.
      const confirmBtn = screen.getByRole('button', {
        name: /restore all defaults/i,
      });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/users/roles/restore-all-defaults'
        );
      });
    });
  });
});
