import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import WorkOrdersList from './WorkOrdersList';
import apiClient from '../api/client';
import type { WorkOrderSummary } from '../api';

vi.mock('../api/client');

const woAtLocation1: WorkOrderSummary = {
  id: 'wo-1',
  workOrderNumber: 'WO-00001',
  customerId: 'cust-1',
  serviceLocationId: 'loc-1',
  lifecycleState: 'ACTIVE',
  progressCategory: 'IN_PROGRESS',
  priority: 'HIGH',
  scheduledDate: '2026-04-23',
  serviceLocation: {
    id: 'loc-1',
    locationName: 'Main Office',
    address: { streetAddress: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
  },
  customer: { id: 'cust-1', name: 'Acme Co.' },
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-22T10:30:00Z',
};

const cancelledWO: WorkOrderSummary = {
  id: 'wo-2',
  workOrderNumber: 'WO-00002',
  customerId: 'cust-1',
  serviceLocationId: 'loc-2',
  lifecycleState: 'CANCELLED',
  progressCategory: 'CANCELLED',
  priority: 'NORMAL',
  scheduledDate: '2026-03-15',
  cancelledAt: '2026-03-10T10:00:00Z',
  serviceLocation: {
    id: 'loc-2',
    locationName: 'Annex',
    address: { streetAddress: '2 Annex Rd', city: 'Springfield', state: 'IL', zipCode: '62702' },
  },
  customer: { id: 'cust-1', name: 'Acme Co.' },
  createdAt: '2026-03-01T13:40:00Z',
  updatedAt: '2026-03-10T10:00:00Z',
};

function pageOf(items: WorkOrderSummary[]) {
  return {
    content: items,
    totalElements: items.length,
    totalPages: 1,
    number: 0,
    size: 25,
  };
}

describe('WorkOrdersList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading state while fetching', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });

  it('shows the empty state when no work orders exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no.*work order.*yet/i)).toBeInTheDocument();
    });
  });

  it('renders rows with WO# linked to the detail page, status, priority, and scheduled date', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: 'WO-00001' });
    expect(link).toHaveAttribute('href', '/work-orders/wo-1');
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    // Date formatting is timezone-dependent; just verify a 2026 date renders
    expect(screen.getByText(/Apr.*2026/)).toBeInTheDocument();
  });

  it('renders the Service Location column when showLocation is true (default)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
  });

  it('shows the full address (street, city, state zip) under the location name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
    expect(screen.getByText('1 Main St, Springfield, IL 62701')).toBeInTheDocument();
  });

  it('renders the service location cell as a link to the service location detail page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /Main Office/ });
    expect(link).toHaveAttribute('href', '/service-locations/loc-1');
  });

  it('falls back to the full address when the location has no locationName', async () => {
    const woNoName: WorkOrderSummary = {
      ...woAtLocation1,
      id: 'wo-no-name',
      workOrderNumber: 'WO-00099',
      serviceLocation: {
        id: 'loc-99',
        address: { streetAddress: '7 No-Name Pl', city: 'Anytown', state: 'CA', zipCode: '90210' },
      },
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woNoName]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('7 No-Name Pl, Anytown, CA 90210')).toBeInTheDocument();
    });
  });

  it('hides the Service Location column when showLocation is false', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(
      <WorkOrdersList customerId="cust-1" serviceLocationId="loc-1" showLocation={false} />
    );
    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });
    expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
  });

  it('renders cancelled badge for cancelled work orders', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([cancelledWO]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('WO-00002')).toBeInTheDocument();
    });
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it('passes serviceLocationId as a server-side filter to the list endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([]) });
    renderWithProviders(
      <WorkOrdersList customerId="cust-1" serviceLocationId="loc-1" />
    );
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });
    const call = vi.mocked(apiClient.get).mock.calls[0];
    const params = (call[1] as { params?: Record<string, unknown> })?.params;
    expect(params).toMatchObject({ customerId: 'cust-1', serviceLocationId: 'loc-1' });
  });
});
