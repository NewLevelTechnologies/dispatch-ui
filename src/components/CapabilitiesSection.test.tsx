import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CapabilitiesSection from './CapabilitiesSection';
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
        { name: 'customers:write', displayName: 'Edit Customers', description: 'Create/edit customers' },
      ],
    },
    {
      featureArea: 'WORK_ORDERS',
      displayName: 'Work Orders',
      capabilities: [
        { name: 'work_orders:read', displayName: 'View Work Orders', description: 'View work order list' },
        { name: 'work_orders:write', displayName: 'Edit Work Orders', description: 'Create/edit work orders' },
      ],
    },
  ],
};

describe('CapabilitiesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty state', () => {
    it('displays message when no capabilities', () => {
      renderWithProviders(<CapabilitiesSection capabilities={[]} />);

      expect(screen.getByText('Capabilities')).toBeInTheDocument();
      expect(screen.getByText('No capabilities assigned')).toBeInTheDocument();
    });
  });

  describe('Collapsed state', () => {
    it('shows capability count badge when collapsed', () => {
      renderWithProviders(<CapabilitiesSection capabilities={['customers:read', 'work_orders:write']} />);

      expect(screen.getByText('Capabilities')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Show')).toBeInTheDocument();
    });

    it('does not fetch capabilities data when collapsed', () => {
      renderWithProviders(<CapabilitiesSection capabilities={['customers:read']} />);

      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('Expanded state', () => {
    it('expands and fetches capabilities data when show button clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });

      renderWithProviders(<CapabilitiesSection capabilities={['customers:read', 'work_orders:write']} />);

      const showButton = screen.getByRole('button', { name: /show/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/users/capabilities/grouped');
      });

      await waitFor(() => {
        expect(screen.getByText('Hide')).toBeInTheDocument();
      });
    });

    it('displays capabilities grouped by feature area', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });

      renderWithProviders(<CapabilitiesSection capabilities={['customers:read', 'work_orders:write']} />);

      const showButton = screen.getByRole('button', { name: /show/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Work Orders')).toBeInTheDocument();
        expect(screen.getByText('View Customers')).toBeInTheDocument();
        expect(screen.getByText('Edit Work Orders')).toBeInTheDocument();
      });
    });

    it('collapses when hide button clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });

      renderWithProviders(<CapabilitiesSection capabilities={['customers:read']} />);

      // Expand
      const showButton = screen.getByRole('button', { name: /show/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('Hide')).toBeInTheDocument();
      });

      // Collapse
      const hideButton = screen.getByRole('button', { name: /hide/i });
      await user.click(hideButton);

      expect(screen.getByText('Show')).toBeInTheDocument();
      expect(screen.queryByText('Customers')).not.toBeInTheDocument();
    });

    it('displays loading state while fetching', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<CapabilitiesSection capabilities={['customers:read']} />);

      const showButton = screen.getByRole('button', { name: /show/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
      });
    });

    it('shows capability description as badge title', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockCapabilitiesData });

      renderWithProviders(<CapabilitiesSection capabilities={['customers:read']} />);

      const showButton = screen.getByRole('button', { name: /show/i });
      await user.click(showButton);

      await waitFor(() => {
        const badge = screen.getByText('View Customers');
        expect(badge).toHaveAttribute('title', 'View customer list');
      });
    });
  });
});
