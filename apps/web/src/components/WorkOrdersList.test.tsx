import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import WorkOrdersList from './WorkOrdersList';
import { apiClient } from '../api/setup';
import type { WorkOrderSummary } from '../api/setup';

vi.mock('@dispatch/api/src/client');

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
  workItemCount: 0,
  workItems: [],
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
  workItemCount: 0,
  workItems: [],
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
    // Links to the location detail, carrying back-context so its smart back
    // link can return to this work order.
    const href = link.getAttribute('href');
    expect(href).toMatch(/^\/service-locations\/loc-1(\?|$)/);
    expect(href).toContain('from=work-order');
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

  it('renders work item descriptions in the Work column with a status dot per item', async () => {
    const woWithItems: WorkOrderSummary = {
      ...woAtLocation1,
      workItemCount: 2,
      workItems: [
        { description: 'Replace condenser coil', statusCategory: 'IN_PROGRESS' },
        { description: 'Inspect ductwork', statusCategory: 'COMPLETED' },
      ],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woWithItems]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('Replace condenser coil')).toBeInTheDocument();
    });
    expect(screen.getByText('Inspect ductwork')).toBeInTheDocument();
  });

  it('collapses overflow into a "+N more" indicator when work item count exceeds the inline cap', async () => {
    const woWithMany: WorkOrderSummary = {
      ...woAtLocation1,
      workItemCount: 7,
      workItems: [
        { description: 'Item one', statusCategory: 'IN_PROGRESS' },
        { description: 'Item two', statusCategory: 'NOT_STARTED' },
        { description: 'Item three', statusCategory: 'COMPLETED' },
        { description: 'Item four', statusCategory: 'NOT_STARTED' },
        { description: 'Item five', statusCategory: 'NOT_STARTED' },
      ],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woWithMany]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('Item one')).toBeInTheDocument();
    });
    // Inline cap is 3
    expect(screen.getByText('Item one')).toBeInTheDocument();
    expect(screen.getByText('Item two')).toBeInTheDocument();
    expect(screen.getByText('Item three')).toBeInTheDocument();
    expect(screen.queryByText('Item four')).not.toBeInTheDocument();
    // Overflow is `workItemCount - visible.length` = 7 - 3 = 4
    expect(screen.getByText('+4 more')).toBeInTheDocument();
  });

  it('renders an em-dash placeholder in the Work column when the WO has no items', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: pageOf([woAtLocation1]) });
    renderWithProviders(<WorkOrdersList customerId="cust-1" />);
    await waitFor(() => {
      expect(screen.getByText('WO-00001')).toBeInTheDocument();
    });
    // woAtLocation1 has workItemCount: 0, workItems: []
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
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
