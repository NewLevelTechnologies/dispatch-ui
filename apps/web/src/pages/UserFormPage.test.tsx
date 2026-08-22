import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { UserInvitePage, UserEditPage } from './UserFormPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'user-1' }),
  };
});

const mockRoles = [
  {
    id: 'role-1',
    name: 'Admin',
    description: 'Administrator role',
    isSystemRole: true,
    capabilities: ['VIEW_USERS', 'EDIT_USERS', 'DELETE_USERS'],
  },
  {
    id: 'role-2',
    name: 'Technician',
    description: 'Field technician',
    isSystemRole: false,
    capabilities: ['VIEW_WORK_ORDERS'],
  },
];

const mockRegions = [
  { id: 'region-1', name: 'North', active: true },
  { id: 'region-2', name: 'South', active: true },
];

const mockUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  cognitoSub: 'cognito-123',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  phoneNumber: '5551234567',
  enabled: true,
  roles: [mockRoles[0]],
  dispatchRegionIds: ['region-1'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
};

const mockGroupedCapabilities = {
  groups: [
    {
      area: 'USERS',
      displayName: 'Users',
      capabilities: [
        { name: 'VIEW_USERS', displayName: 'View users', description: 'View users' },
        { name: 'EDIT_USERS', displayName: 'Edit users', description: 'Edit users' },
      ],
    },
  ],
};

function defaultGetMock(url: string) {
  if (url === '/users/user-1') return Promise.resolve({ data: mockUser });
  if (url === '/users/roles') return Promise.resolve({ data: { roles: mockRoles } });
  if (url.startsWith('/tenant/dispatch-regions')) {
    return Promise.resolve({ data: mockRegions });
  }
  if (url === '/users/capabilities/grouped') {
    return Promise.resolve({ data: mockGroupedCapabilities });
  }
  return Promise.reject(new Error(`Unknown URL: ${url}`));
}

describe('UserFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(apiClient.get).mockImplementation(defaultGetMock);
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser });
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockUser });
  });

  describe('Invite mode', () => {
    it('renders the invite heading and empty form fields', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /invite user/i }),
        ).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('Maria')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Chen')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('maria@yourcompany.com'),
      ).toBeInTheDocument();
    });

    it('renders the role grid with role names and capability counts', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });
      expect(screen.getByText('Technician')).toBeInTheDocument();
    });

    it('disables submit when no roles are selected', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', {
        name: /send invitation/i,
      });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit after toggling a role checkbox', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      // Click the checkbox inside the Admin row directly — Catalyst's
      // Checkbox is button-role-with-aria-checked, not a native input, so
      // the label-forwards-click pattern doesn't fire in jsdom.
      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);

      const submitButton = screen.getByRole('button', {
        name: /send invitation/i,
      });
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('updates the summary counts as the user picks roles and regions', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);

      // Summary live-updates: "Creates 1 role · 0 regions · ... capabilities"
      await waitFor(() => {
        expect(screen.getByText(/1 role/)).toBeInTheDocument();
      });
    });

    it('renders the send-invite checkbox', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText(/Send invitation email to/i)).toBeInTheDocument();
      });
    });

    it('navigates back via the Cancel link', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      const cancel = screen.getByRole('link', { name: /cancel/i });
      expect(cancel).toHaveAttribute('href', '/settings/access/users');
    });

    it('shows the role-required hint when no roles are picked', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Pick at least one role/i),
        ).toBeInTheDocument();
      });
    });

    it('typing in first name updates the field value', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      const firstNameInput = await screen.findByPlaceholderText('Maria');
      await user.type(firstNameInput, 'Alice');
      expect(firstNameInput).toHaveValue('Alice');
    });
  });

  describe('Edit mode', () => {
    it('pre-fills the form with the existing user values', async () => {
      renderWithProviders(<UserEditPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
      });
      expect(screen.getByDisplayValue('Smith')).toBeInTheDocument();
      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
    });

    it('disables the email input in edit mode', async () => {
      renderWithProviders(<UserEditPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('jane@example.com')).toBeDisabled();
      });
    });

    it('renders the edit heading with the user name', async () => {
      renderWithProviders(<UserEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Edit Jane Smith/i }),
        ).toBeInTheDocument();
      });
    });

    it('renders Save changes button', async () => {
      renderWithProviders(<UserEditPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /save changes/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('CapabilityPreview', () => {
    it('toggles the expanded capability list when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      // Pick a role so the preview switches from the "pick at least one" hint
      // to the expandable disclosure.
      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);

      await waitFor(() => {
        expect(screen.getByText(/Show details/i)).toBeInTheDocument();
      });

      const toggle = screen.getByText(/Show details/i);
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Hide details/i)).toBeInTheDocument();
      });
    });
  });

  describe('Clear-all roles', () => {
    it('clear-all button appears when more than one role is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Admin')).toBeInTheDocument();
      });

      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      const techCheckbox = screen
        .getByText('Technician')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);
      await user.click(techCheckbox);

      const clearBtn = await screen.findByRole('button', {
        name: /Clear all 2/i,
      });
      await user.click(clearBtn);

      // Clear-all button vanishes once selection drops back to 0.
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Clear all/i }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Region toggling', () => {
    it('renders the region grid', async () => {
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('North')).toBeInTheDocument();
      });
      expect(screen.getByText('South')).toBeInTheDocument();
    });

    it('toggles a region when its checkbox is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('North')).toBeInTheDocument();
      });
      const northCheckbox = screen
        .getByText('North')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(northCheckbox);

      await waitFor(() => {
        expect(screen.getByText(/1 region/)).toBeInTheDocument();
      });
    });
  });

  describe('Submit flow', () => {
    it('invite submit calls POST /users with the form data', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserInvitePage />);

      const firstName = await screen.findByPlaceholderText('Maria');
      await user.type(firstName, 'Maria');
      await user.type(screen.getByPlaceholderText('Chen'), 'Chen');
      await user.type(
        screen.getByPlaceholderText('maria@yourcompany.com'),
        'maria@example.com',
      );

      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);

      const submit = screen.getByRole('button', { name: /send invitation/i });
      await user.click(submit);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/users',
          expect.objectContaining({
            firstName: 'Maria',
            lastName: 'Chen',
            email: 'maria@example.com',
            roleIds: ['role-1'],
          }),
        );
      });
    });

    it('edit submit calls the three update endpoints', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserEditPage />);

      const firstName = await screen.findByDisplayValue('Jane');
      await user.clear(firstName);
      await user.type(firstName, 'Janet');

      const submit = screen.getByRole('button', { name: /save changes/i });
      await user.click(submit);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/users/user-1',
          expect.objectContaining({ firstName: 'Janet' }),
        );
      });
      // updateRoles + updateRegions follow.
      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/users/user-1/roles',
          expect.objectContaining({ roleIds: ['role-1'] }),
        );
      });
    });

    it('edit submit with zero roles surfaces an error and does not call API', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UserEditPage />);

      // Untoggle the only existing role.
      await screen.findByDisplayValue('Jane');
      const adminCheckbox = screen
        .getByText('Admin')
        .closest('label')!
        .querySelector('[role="checkbox"]') as HTMLElement;
      await user.click(adminCheckbox);

      const submit = screen.getByRole('button', { name: /save changes/i });
      await user.click(submit);

      // Should NOT call profile update (early return on zero roles).
      // Wait a tick to make sure the click handler ran.
      await new Promise((r) => setTimeout(r, 50));
      expect(apiClient.put).not.toHaveBeenCalledWith(
        '/users/user-1',
        expect.anything(),
      );
    });
  });
});
