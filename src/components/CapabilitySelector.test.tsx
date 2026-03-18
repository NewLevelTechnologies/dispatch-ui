import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CapabilitySelector from './CapabilitySelector';
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
  ],
};

describe('CapabilitySelector', () => {
  const mockOnCapabilityToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading and error states', () => {
    it('displays loading state', () => {
      vi.mocked(apiClient.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays error state when fetch fails', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to fetch'));

      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByText(/error loading capabilities/i)).toBeInTheDocument();
      });
    });

    it('displays message when no capabilities available', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { groups: [] } });

      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByText('No capabilities assigned')).toBeInTheDocument();
      });
    });
  });

  describe('Tabbed interface', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('renders tabs for each feature area', async () => {
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /customers/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /work orders/i })).toBeInTheDocument();
      });
    });

    it('shows first group capabilities by default', async () => {
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
        expect(screen.getByText('Edit Customers')).toBeInTheDocument();
        expect(screen.getByText('Delete Customers')).toBeInTheDocument();
      });
    });

    it('switches tabs when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByText('View Customers')).toBeInTheDocument();
      });

      const workOrdersTab = screen.getByRole('button', { name: /work orders/i });
      await user.click(workOrdersTab);

      expect(screen.getByText('View Work Orders')).toBeInTheDocument();
      expect(screen.getByText('Edit Work Orders')).toBeInTheDocument();
      expect(screen.queryByText('View Customers')).not.toBeInTheDocument();
    });

    it('shows selection count on tabs', async () => {
      renderWithProviders(
        <CapabilitySelector
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnCapabilityToggle}
        />
      );

      await waitFor(() => {
        const customersTab = screen.getByRole('button', { name: /customers/i });
        expect(customersTab).toHaveTextContent('2');
      });
    });
  });

  describe('Capability selection', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('displays checkboxes for capabilities', async () => {
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /edit customers/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /delete customers/i })).toBeInTheDocument();
      });
    });

    it('checks selected capabilities', async () => {
      renderWithProviders(
        <CapabilitySelector
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnCapabilityToggle}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /edit customers/i })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /delete customers/i })).not.toBeChecked();
      });
    });

    it('calls onCapabilityToggle when checkbox is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /view customers/i })).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox', { name: /view customers/i });
      await user.click(checkbox);

      expect(mockOnCapabilityToggle).toHaveBeenCalledWith('customers:read', true);
    });

    it('displays capability descriptions', async () => {
      renderWithProviders(
        <CapabilitySelector selectedCapabilities={[]} onCapabilityToggle={mockOnCapabilityToggle} />
      );

      await waitFor(() => {
        expect(screen.getByText('View customer list')).toBeInTheDocument();
        expect(screen.getByText('Create and edit customers')).toBeInTheDocument();
        expect(screen.getByText('Delete customers')).toBeInTheDocument();
      });
    });
  });

  describe('Summary and actions', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });
    });

    it('shows total selected count', async () => {
      renderWithProviders(
        <CapabilitySelector
          selectedCapabilities={['customers:read', 'work_orders:write']}
          onCapabilityToggle={mockOnCapabilityToggle}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/2.*capabilities.*selected/i)).toBeInTheDocument();
      });
    });

    it('shows clear group button when capabilities are selected', async () => {
      renderWithProviders(
        <CapabilitySelector
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnCapabilityToggle}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear group/i })).toBeInTheDocument();
      });
    });

    it('clears current group when clear button clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CapabilitySelector
          selectedCapabilities={['customers:read', 'customers:write']}
          onCapabilityToggle={mockOnCapabilityToggle}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear group/i })).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear group/i });
      await user.click(clearButton);

      expect(mockOnCapabilityToggle).toHaveBeenCalledWith('customers:read', false);
      expect(mockOnCapabilityToggle).toHaveBeenCalledWith('customers:write', false);
    });
  });
});
