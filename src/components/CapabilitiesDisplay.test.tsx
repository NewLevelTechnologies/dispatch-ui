import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CapabilitiesDisplay from './CapabilitiesDisplay';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockCapabilitiesData = {
  groups: [
    {
      featureArea: 'CUSTOMERS',
      displayName: 'Customers',
      capabilities: [
        { name: 'customers:read', displayName: 'View Customers', description: 'View customer list' },
        { name: 'customers:write', displayName: 'Edit Customers', description: 'Create and edit customers' },
        { name: 'customers:delete', displayName: 'Delete Customers', description: 'Delete customers' },
      ],
    },
    {
      featureArea: 'WORK_ORDERS',
      displayName: 'Work Orders',
      capabilities: [
        { name: 'work_orders:read', displayName: 'View Work Orders', description: 'View work order list' },
        { name: 'work_orders:write', displayName: 'Edit Work Orders', description: 'Create and edit work orders' },
      ],
    },
    {
      featureArea: 'USERS',
      displayName: 'Users',
      capabilities: [
        { name: 'users:read', displayName: 'View Users', description: 'View user list' },
        { name: 'users:write', displayName: 'Edit Users', description: 'Create and edit users' },
      ],
    },
  ],
};

describe('CapabilitiesDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading and error states', () => {
    it('displays loading state', () => {
      vi.mocked(apiClient.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays error state when fetch fails', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to fetch'));

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText(/error loading capabilities/i)).toBeInTheDocument();
        expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
      });
    });

    it('displays unknown error message when error has no message', async () => {
      vi.mocked(apiClient.get).mockRejectedValue({});

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
      });
    });

    it('displays error when no capabilities data returned', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: null });

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText(/error loading capabilities/i)).toBeInTheDocument();
      });
    });
  });

  describe('Read-only mode', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('displays empty message when user has no capabilities', async () => {
      renderWithProviders(<CapabilitiesDisplay userCapabilities={[]} editMode={false} />);

      await waitFor(() => {
        expect(screen.getByText('No capabilities assigned')).toBeInTheDocument();
      });
    });

    it('renders capability groups with badges', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read', 'work_orders:write']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });
    });

    it('filters groups to only show capabilities user has', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Work Orders and Users groups should not be shown (user has no caps in those groups)
      expect(screen.queryByText('Work Orders')).not.toBeInTheDocument();
      expect(screen.queryByText('Users')).not.toBeInTheDocument();
    });

    it('displays capability badges with descriptions as titles', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand the group to see badges
      const groupHeader = screen.getByRole('button', { name: /customers.*1.*capabilities/i });
      await userEvent.setup().click(groupHeader);

      await waitFor(() => {
        const badge = screen.getByText('View Customers');
        expect(badge).toHaveAttribute('title', 'View customer list');
      });
    });

    it('shows capability count per group', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read', 'customers:write']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText(/2.*capabilities/i)).toBeInTheDocument();
      });
    });

    it('does not show groups with zero capabilities', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Only Customers group should be shown (others have 0 matching capabilities)
      const groupHeaders = screen.getAllByRole('button');
      expect(groupHeaders.length).toBe(1);
    });
  });

  describe('Edit mode', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('shows all groups regardless of selection', async () => {
      const mockOnToggle = vi.fn();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={[]}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
        expect(screen.getByText('Users')).toBeInTheDocument();
      });
    });

    it('shows selection count in group stats', async () => {
      const mockOnToggle = vi.fn();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/2\/3.*capabilities/i)).toBeInTheDocument();
      });
    });

    it('displays checkboxes when expanded', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={[]}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /edit customers/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /delete customers/i })).toBeInTheDocument();
      });
    });

    it('checks selected capabilities', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /edit customers/i })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /delete customers/i })).not.toBeChecked();
      });
    });

    it('calls onCapabilityToggle when checkbox is clicked', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={[]}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox', { name: /view customers/i });
      await user.click(checkbox);

      expect(mockOnToggle).toHaveBeenCalledWith('customers:read', true);
    });

    it('displays capability descriptions in edit mode', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={[]}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByText('View customer list')).toBeInTheDocument();
        expect(screen.getByText('Create and edit customers')).toBeInTheDocument();
        expect(screen.getByText('Delete customers')).toBeInTheDocument();
      });
    });
  });

  describe('Group expansion', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('starts with all groups collapsed', async () => {
      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Badges should not be visible (group is collapsed)
      expect(screen.queryByText('View Customers')).not.toBeInTheDocument();
    });

    it('expands group when header is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });
    });

    it('collapses expanded group when header is clicked again', async () => {
      const user = userEvent.setup();

      renderWithProviders(<CapabilitiesDisplay userCapabilities={['customers:read']} />);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      const groupHeader = screen.getByRole('button', { name: /customers/i });

      // Expand
      await user.click(groupHeader);
      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });

      // Collapse
      await user.click(groupHeader);
      expect(screen.queryByText('View Customers')).not.toBeInTheDocument();
    });

    it('shows expand/collapse all buttons when more than 3 groups', async () => {
      const manyGroups = {
        groups: [
          mockCapabilitiesData.groups[0],
          mockCapabilitiesData.groups[1],
          mockCapabilitiesData.groups[2],
          {
            featureArea: 'EQUIPMENT',
            displayName: 'Equipment',
            capabilities: [
              { name: 'equipment:read', displayName: 'View Equipment', description: 'View equipment' },
            ],
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: manyGroups });

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read', 'users:read', 'equipment:read']}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument();
      });
    });

    it('does not show expand/collapse buttons when 3 or fewer groups', async () => {
      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /expand all/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /collapse all/i })).not.toBeInTheDocument();
    });

    it('expands all groups when expand all is clicked', async () => {
      const user = userEvent.setup();
      const manyGroups = {
        groups: [
          mockCapabilitiesData.groups[0],
          mockCapabilitiesData.groups[1],
          mockCapabilitiesData.groups[2],
          {
            featureArea: 'EQUIPMENT',
            displayName: 'Equipment',
            capabilities: [
              { name: 'equipment:read', displayName: 'View Equipment', description: 'View equipment' },
            ],
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: manyGroups });

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read', 'users:read', 'equipment:read']}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
      });

      const expandAllButton = screen.getByRole('button', { name: /expand all/i });
      await user.click(expandAllButton);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
        expect(screen.getByText('View Work Orders')).toBeInTheDocument();
        expect(screen.getByText('View Users')).toBeInTheDocument();
        expect(screen.getByText('View Equipment')).toBeInTheDocument();
      });
    });

    it('collapses all groups when collapse all is clicked', async () => {
      const user = userEvent.setup();
      const manyGroups = {
        groups: [
          mockCapabilitiesData.groups[0],
          mockCapabilitiesData.groups[1],
          mockCapabilitiesData.groups[2],
          {
            featureArea: 'EQUIPMENT',
            displayName: 'Equipment',
            capabilities: [
              { name: 'equipment:read', displayName: 'View Equipment', description: 'View equipment' },
            ],
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: manyGroups });

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read', 'users:read', 'equipment:read']}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
      });

      // Expand all first
      const expandAllButton = screen.getByRole('button', { name: /expand all/i });
      await user.click(expandAllButton);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });

      // Collapse all
      const collapseAllButton = screen.getByRole('button', { name: /collapse all/i });
      await user.click(collapseAllButton);

      expect(screen.queryByText('View Customers')).not.toBeInTheDocument();
      expect(screen.queryByText('View Work Orders')).not.toBeInTheDocument();
      expect(screen.queryByText('View Users')).not.toBeInTheDocument();
      expect(screen.queryByText('View Equipment')).not.toBeInTheDocument();
    });

    it('displays chevron icons for collapsed/expanded state', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read']} />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      const groupHeader = screen.getByRole('button', { name: /customers/i });

      // Should show chevron right when collapsed
      const chevronRight = groupHeader.querySelector('svg');
      expect(chevronRight).toBeInTheDocument();

      // Expand
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });

      // Should show chevron down when expanded
      const chevronDown = groupHeader.querySelector('svg');
      expect(chevronDown).toBeInTheDocument();
    });
  });

  describe('Edit mode with callbacks', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('shows all groups in edit mode even with no selections', async () => {
      const mockOnToggle = vi.fn();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={[]}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
        expect(screen.getByText('Users')).toBeInTheDocument();
      });
    });

    it('shows correct selection stats in edit mode', async () => {
      const mockOnToggle = vi.fn();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        // Customers: 2/3 selected
        expect(screen.getByText(/2\/3.*capabilities/i)).toBeInTheDocument();
        // Work Orders and Users: both have 0/2 selected
        const zeroCapabilities = screen.getAllByText(/0\/2.*capabilities/i);
        expect(zeroCapabilities.length).toBe(2);
      });
    });

    it('unchecks capability when checkbox is toggled off', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={['customers:read']}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeChecked();
      });

      // Uncheck
      const checkbox = screen.getByRole('checkbox', { name: /view customers/i });
      await user.click(checkbox);

      expect(mockOnToggle).toHaveBeenCalledWith('customers:read', false);
    });

    it('does not call onCapabilityToggle in read-only mode', async () => {
      const mockOnToggle = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read']}
          onCapabilityToggle={mockOnToggle}
          editMode={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand group
      const groupHeader = screen.getByRole('button', { name: /customers/i });
      await user.click(groupHeader);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });

      // Should show badges, not checkboxes
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });

  describe('Group stats display', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('shows total count in read-only mode', async () => {
      renderWithProviders(
        <CapabilitiesDisplay userCapabilities={['customers:read', 'customers:write']} editMode={false} />
      );

      await waitFor(() => {
        expect(screen.getByText(/2.*capabilities/i)).toBeInTheDocument();
      });
    });

    it('shows selection count format in edit mode', async () => {
      const mockOnToggle = vi.fn();

      renderWithProviders(
        <CapabilitiesDisplay
          selectedCapabilities={['customers:read']}
          onCapabilityToggle={mockOnToggle}
          editMode={true}
        />
      );

      await waitFor(() => {
        // Should show "1/3 capabilities" format
        expect(screen.getByText(/1\/3.*capabilities/i)).toBeInTheDocument();
      });
    });
  });

  describe('Multiple group management', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('can expand multiple groups simultaneously', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read']}
          editMode={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
      });

      // Expand both groups
      const customersHeader = screen.getByRole('button', { name: /customers/i });
      const workOrdersHeader = screen.getByRole('button', { name: /work orders/i });

      await user.click(customersHeader);
      await user.click(workOrdersHeader);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
        expect(screen.getByText('View Work Orders')).toBeInTheDocument();
      });
    });

    it('maintains other groups expanded state when one is collapsed', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <CapabilitiesDisplay
          userCapabilities={['customers:read', 'work_orders:read']}
          editMode={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });

      // Expand both
      const customersHeader = screen.getByRole('button', { name: /customers/i });
      const workOrdersHeader = screen.getByRole('button', { name: /work orders/i });

      await user.click(customersHeader);
      await user.click(workOrdersHeader);

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
        expect(screen.getByText('View Work Orders')).toBeInTheDocument();
      });

      // Collapse only Customers
      await user.click(customersHeader);

      expect(screen.queryByText('View Customers')).not.toBeInTheDocument();
      expect(screen.getByText('View Work Orders')).toBeInTheDocument();
    });
  });
});
