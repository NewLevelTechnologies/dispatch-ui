import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { RoleAddPage, RoleEditPage } from './RoleFormPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'role-edit-target' }),
  };
});

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

const existingCustomRole = {
  id: 'role-edit-target',
  name: 'Refund Approver',
  description: 'Custom stack role',
  capabilities: ['REFUND_INVOICES'],
  isProtected: false,
  isSystemRole: false,
  accentId: 'teal',
  updatedAt: '2024-05-09T08:00:00Z',
};

const existingAdminRole = {
  ...existingCustomRole,
  id: 'role-edit-target',
  name: 'Admin',
  description: 'Full access',
  capabilities: ['VIEW_WORK_ORDERS', 'EDIT_WORK_ORDERS'],
  isProtected: true,
  isSystemRole: true,
  systemRoleCode: 'ADMIN',
};

const otherRoles = [
  {
    id: 'role-disp',
    name: 'Dispatcher',
    description: '',
    capabilities: ['VIEW_WORK_ORDERS'],
    isProtected: true,
    accentId: 'amber',
  },
];

function mockGetsForAdd() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/users/roles')
      return Promise.resolve({
        data: { roles: otherRoles, colorsInUse: { amber: { roleId: 'role-disp', roleName: 'Dispatcher' } } },
      });
    if (url === '/users/capabilities/grouped')
      return Promise.resolve({ data: groupedCaps });
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

function mockGetsForEdit(role: typeof existingCustomRole | typeof existingAdminRole) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === `/users/roles/${role.id}`)
      return Promise.resolve({
        data: {
          ...role,
          colorsInUse: {
            amber: { roleId: 'role-disp', roleName: 'Dispatcher' },
            // Self-entry the FE should filter out
            [role.accentId!]: { roleId: role.id, roleName: role.name },
          },
        },
      });
    if (url === '/users/roles')
      return Promise.resolve({ data: { roles: [role, ...otherRoles] } });
    if (url === '/users/capabilities/grouped')
      return Promise.resolve({ data: groupedCaps });
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

describe('RoleFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('add mode', () => {
    it('renders Add role heading + subtitle + Create button disabled', async () => {
      mockGetsForAdd();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Add role' })
        ).toBeInTheDocument();
      });
      // Footer primary button — disabled until name + ≥1 cap.
      const create = screen.getByRole('button', { name: /create role/i });
      expect(create).toBeDisabled();
    });

    it('renders the Start from card with Blank + each existing role chip', async () => {
      mockGetsForAdd();
      renderWithProviders(<RoleAddPage />);

      // Wait for the role list to populate before asserting chips — Blank
      // appears immediately, but role-list-derived chips arrive after the
      // ['roles'] query resolves.
      expect(
        await screen.findByRole('button', { name: /Dispatcher/ })
      ).toBeInTheDocument();
      expect(screen.getByText('Start from')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Blank' })).toBeInTheDocument();
    });

    it('renders all capability areas with their checkboxes', async () => {
      mockGetsForAdd();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });
      expect(screen.getByText('Billing')).toBeInTheDocument();
      // Capability checkboxes
      expect(
        screen.getByRole('checkbox', { name: /view work orders/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: /edit work orders/i })
      ).toBeInTheDocument();
    });

    it('disables a swatch already taken by another role', async () => {
      mockGetsForAdd();
      renderWithProviders(<RoleAddPage />);

      // Wait for the Dispatcher chip to appear — its presence implies the
      // ['roles'] query has resolved and `colorsInUse` is now wired into
      // the ColorPicker. Without this gate Amber would still be evaluated
      // in its pre-data state (no taken metadata).
      await screen.findByRole('button', { name: /Dispatcher/ });

      const amber = screen.getByRole('button', { name: 'Amber' });
      expect(amber).toBeDisabled();
      expect(amber).toHaveAttribute('title', 'Used by Dispatcher');
    });

    it('enables Create role once name + capability are set', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Add role' })).toBeInTheDocument();
      });

      const create = screen.getByRole('button', { name: /create role/i });
      expect(create).toBeDisabled();

      await user.type(screen.getByPlaceholderText(/e\.g\. Refund Approver/i), 'QA Lead');
      // Still disabled — no capability
      expect(create).toBeDisabled();

      await user.click(screen.getByRole('checkbox', { name: /view work orders/i }));
      expect(create).toBeEnabled();
    });

    it('submits and navigates to the new role detail page', async () => {
      mockGetsForAdd();
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { id: 'role-new', name: 'QA Lead' },
      });
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Add role' })).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/e\.g\. Refund Approver/i),
        'QA Lead'
      );
      await user.click(screen.getByRole('checkbox', { name: /view work orders/i }));
      await user.click(screen.getByRole('button', { name: /create role/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/users/roles',
          expect.objectContaining({
            name: 'QA Lead',
            capabilities: ['VIEW_WORK_ORDERS'],
          })
        );
      });
      expect(mockNavigate).toHaveBeenCalledWith('/settings/access/roles/role-new');
    });

    it('surfaces 409 ACCENT_ID_TAKEN inline next to the picker', async () => {
      mockGetsForAdd();
      const conflictError = Object.assign(new Error('conflict'), {
        response: {
          status: 409,
          data: {
            code: 'ACCENT_ID_TAKEN',
            field: 'accentId',
            conflictingRoleId: 'role-other',
            conflictingRoleName: 'Dispatcher',
          },
        },
      });
      vi.mocked(apiClient.post).mockRejectedValue(conflictError);
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Add role' })).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/e\.g\. Refund Approver/i),
        'QA Lead'
      );
      await user.click(screen.getByRole('checkbox', { name: /view work orders/i }));
      await user.click(screen.getByRole('button', { name: /create role/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/this color is now used by dispatcher/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('edit mode', () => {
    it('seeds the form from the existing role', async () => {
      mockGetsForEdit(existingCustomRole);
      renderWithProviders(<RoleEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit refund approver/i })
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(
        /e\.g\. Refund Approver/i
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('Refund Approver');

      // The role's own capability is checked
      expect(
        screen.getByRole('checkbox', { name: /refund invoices/i })
      ).toBeChecked();
      // A capability it doesn't have is not
      expect(
        screen.getByRole('checkbox', { name: /view work orders/i })
      ).not.toBeChecked();
    });

    it('does NOT render the Start from card in edit mode', async () => {
      mockGetsForEdit(existingCustomRole);
      renderWithProviders(<RoleEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit refund approver/i })
        ).toBeInTheDocument();
      });
      expect(screen.queryByText('Start from')).not.toBeInTheDocument();
    });

    it('keeps the role\'s own accent available — filters self from colorsInUse', async () => {
      mockGetsForEdit(existingCustomRole);
      renderWithProviders(<RoleEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit refund approver/i })
        ).toBeInTheDocument();
      });

      // Teal is the role's own accent. It must remain enabled.
      const teal = screen.getByRole('button', { name: 'Teal' });
      expect(teal).toBeEnabled();
      // Amber is owned by Dispatcher — still disabled.
      const amber = screen.getByRole('button', { name: 'Amber' });
      expect(amber).toBeDisabled();
    });

    it('locks name + capabilities for the Admin role', async () => {
      mockGetsForEdit(existingAdminRole);
      renderWithProviders(<RoleEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit admin/i })
        ).toBeInTheDocument();
      });

      // Name input disabled
      const nameInput = screen.getByPlaceholderText(
        /e\.g\. Refund Approver/i
      ) as HTMLInputElement;
      expect(nameInput).toBeDisabled();
      // Capability checkboxes disabled. Catalyst Checkbox renders as a
      // Headless span with role=checkbox; it reflects the disabled prop
      // through aria-disabled rather than the form-element disabled attr.
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((c) =>
        expect(c).toHaveAttribute('aria-disabled', 'true')
      );
      // Admin lock callout visible
      expect(screen.getByText('Admin role')).toBeInTheDocument();
    });

    it('shows Save changes label in edit mode', async () => {
      mockGetsForEdit(existingCustomRole);
      renderWithProviders(<RoleEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit refund approver/i })
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).toBeInTheDocument();
    });
  });

  describe('capability filter', () => {
    it('hides non-matching areas and shows the "N hidden" footer', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/filter capabilities/i),
        'refund'
      );

      // Refund Invoices remains; work-orders capabilities hidden
      await waitFor(() => {
        expect(screen.queryByText('View Work Orders')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Refund Invoices')).toBeInTheDocument();
      // "3 capabilities hidden by filter" — total is 4 caps, 1 visible
      expect(
        screen.getByText(/3 capabilities hidden by filter/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /clear filter/i })
      ).toBeInTheDocument();
    });

    it('Clear filter button restores the full capability list', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      const filter = screen.getByPlaceholderText(/filter capabilities/i);
      await user.type(filter, 'refund');

      await waitFor(() => {
        expect(screen.queryByText('View Work Orders')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /clear filter/i }));

      // Filter cleared — all caps visible again, footer gone.
      await waitFor(() => {
        expect(screen.getByText('View Work Orders')).toBeInTheDocument();
      });
      expect(screen.queryByText(/capabilities hidden by filter/i)).not.toBeInTheDocument();
    });

    it('Select all on an area row grants every capability in that area', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      // Two Select all buttons exist (one per area). The first hit is the
      // Work Orders area in DOM order — exercises `toggleArea`.
      const selectAllButtons = screen.getAllByRole('button', { name: /select all/i });
      await user.click(selectAllButtons[0]);

      expect(
        screen.getByRole('checkbox', { name: /view work orders/i })
      ).toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: /edit work orders/i })
      ).toBeChecked();
    });

    it('Clear area drops every capability in that area', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      // Select all first, then Clear area — the same button toggles label.
      const selectAll = screen.getAllByRole('button', { name: /select all/i })[0];
      await user.click(selectAll);

      const clearArea = screen.getByRole('button', { name: /clear area/i });
      await user.click(clearArea);

      expect(
        screen.getByRole('checkbox', { name: /view work orders/i })
      ).not.toBeChecked();
    });

    it('Clear all from the card header removes every selection at once', async () => {
      mockGetsForAdd();
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      // Grant a couple capabilities first so the Clear all CTA appears.
      await user.click(screen.getByRole('checkbox', { name: /view work orders/i }));
      await user.click(screen.getByRole('checkbox', { name: /refund invoices/i }));

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      expect(
        screen.getByRole('checkbox', { name: /view work orders/i })
      ).not.toBeChecked();
      // The empty-state callout reappears once everything is unchecked.
      expect(screen.getByText(/pick at least one capability/i)).toBeInTheDocument();
    });

    it('clears accent conflict state when the user picks a different swatch', async () => {
      mockGetsForAdd();
      const conflictError = Object.assign(new Error('conflict'), {
        response: {
          status: 409,
          data: {
            code: 'ACCENT_ID_TAKEN',
            field: 'accentId',
            conflictingRoleName: 'Dispatcher',
          },
        },
      });
      vi.mocked(apiClient.post).mockRejectedValue(conflictError);
      const user = userEvent.setup();
      renderWithProviders(<RoleAddPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Add role' })).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/e\.g\. Refund Approver/i),
        'QA Lead'
      );
      await user.click(screen.getByRole('checkbox', { name: /view work orders/i }));
      await user.click(screen.getByRole('button', { name: /create role/i }));

      // Conflict surfaces.
      const conflict = await screen.findByText(/this color is now used by dispatcher/i);
      expect(conflict).toBeInTheDocument();

      // Pick a different swatch — the message should clear.
      await user.click(screen.getByRole('button', { name: /^teal$/i }));
      await waitFor(() => {
        expect(
          screen.queryByText(/this color is now used by dispatcher/i)
        ).not.toBeInTheDocument();
      });
    });
  });
});
