import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import WorkOrderDetailPage from './WorkOrderDetailPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';
import type { WorkOrder } from '../api';

vi.mock('../api/client');

const mockWorkOrder: WorkOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-00010',
  customerId: 'cust-1',
  serviceLocationId: 'loc-1',
  workOrderTypeId: 'type-1',
  divisionId: 'div-1',
  lifecycleState: 'ACTIVE',
  progressCategory: 'NOT_STARTED',
  priority: 'NORMAL',
  scheduledDate: '2026-04-23',
  customerOrderNumber: 'PO-12345',
  customer: {
    id: 'cust-1',
    name: 'Tenant 2 Inc.',
    phone: '5551234567',
    email: 'contact@tenant2.example',
  },
  serviceLocation: {
    id: 'loc-1',
    customerId: 'cust-1',
    locationName: "Paul's House",
    address: {
      streetAddress: '1942 LENOX RD NE',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30306-3035',
    },
    siteContactName: 'Paul Wilcox',
    siteContactPhone: '5559876543',
    status: 'ACTIVE',
  },
  workItems: [],
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-23T14:46:00Z',
};

describe('WorkOrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockApiResponses = (workOrder: WorkOrder | null = mockWorkOrder) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/work-orders/config/types')) {
        return Promise.resolve({
          data: [{ id: 'type-1', name: 'HVAC Service', code: 'HVAC', isActive: true, sortOrder: 0 }],
        });
      }
      if (url.includes('/work-orders/config/divisions')) {
        return Promise.resolve({
          data: [{ id: 'div-1', name: 'HVAC', code: 'HVAC', isActive: true, sortOrder: 0 }],
        });
      }
      if (url.includes('/work-orders/config/item-statuses')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/work-orders/config/status-workflows')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/work-orders/config/workflow')) {
        return Promise.resolve({
          data: { enforceStatusWorkflow: false, dispatchBoardType: 'STATUS_BASED' },
        });
      }
      if (url.includes('/scheduling/dispatches')) {
        return Promise.resolve({ data: [] });
      }
      if (url.match(/\/work-orders\/[^/]+\/activity$/)) {
        return Promise.resolve({
          data: { content: [], nextCursor: null, hasMore: false },
        });
      }
      if (url.match(/\/work-orders\/[^/]+\/notes$/)) {
        return Promise.resolve({ data: [] });
      }
      if (url.match(/\/work-orders\/[^/]+$/)) {
        return workOrder
          ? Promise.resolve({ data: workOrder })
          : Promise.reject(new Error('Not found'));
      }
      return Promise.reject(new Error(`Unmocked endpoint: ${url}`));
    });
  };

  const renderPage = (id = 'wo-1') => {
    /* eslint-disable i18next/no-literal-string -- test-only placeholder routes */
    const routes: RouteObject[] = [
      { path: '/work-orders/:id', element: <WorkOrderDetailPage /> },
      { path: '/work-orders', element: <div>Work Orders List</div> },
      { path: '/customers/:id', element: <div>Customer Detail</div> },
      { path: '/service-locations/:id', element: <div>Service Location Detail</div> },
    ];
    /* eslint-enable i18next/no-literal-string */

    return renderWithProviders(<WorkOrderDetailPage />, {
      routes,
      initialPath: `/work-orders/${id}`,
    });
  };

  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays error state when work order is not found', async () => {
    mockApiResponses(null);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });

  it('renders the work order number and progress badge', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    expect(screen.getByText(/not started/i)).toBeInTheDocument();
  });

  it('renders priority badge', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      // Two badges (header + left strip) — both render priority
      expect(screen.getAllByText(/normal/i).length).toBeGreaterThan(0);
    });
  });

  it('renders customer name as a link in the header', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: 'Tenant 2 Inc.' });
      expect(links[0]).toHaveAttribute('href', '/customers/cust-1');
    });
  });

  it('renders the address text in the Service Location card', async () => {
    mockApiResponses();
    renderPage();
    // Address moved out of the header into the Service Location card —
    // location identity belongs in its own surface so "where is this work
    // happening?" jumps out at a glance instead of mixing with status
    // pills and contact data.
    await waitFor(() => {
      expect(screen.getByText(/1942 LENOX RD NE/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Atlanta, GA 30306-3035/i)).toBeInTheDocument();
  });

  it('hides the money chip row until phase 7 (financial detail drawer)', async () => {
    mockApiResponses();
    renderPage();
    // Wait for the page to settle then assert no chip placeholders render —
    // a row of "$ —" stubs communicates nothing on a fresh WO and is hidden
    // until live values flow in phase 7.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /WO-/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/quoted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoiced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument();
  });

  it('renders the Service Location card with location name and address linked', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Paul's House")).toBeInTheDocument();
    });
    // The location name + address block is one big link to the SL detail page
    const locationLink = screen.getAllByRole('link').find(
      (el) => el.getAttribute('href') === '/service-locations/loc-1'
    );
    expect(locationLink).toBeDefined();
  });

  it('renders the Work Order Info card with order details', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-12345')).toBeInTheDocument();
    });
    expect(screen.getByText('HVAC')).toBeInTheDocument();
    expect(screen.getByText('HVAC Service')).toBeInTheDocument();
  });

  it('renders the action bar with the right enabled/disabled state', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    // Phase 4 wired up "+ Work Item" — should be enabled on an active WO.
    const addWorkItemButton = screen.getByRole('button', { name: /add work item/i });
    expect(addWorkItemButton).not.toBeDisabled();
    // Edit WO is wired up to the existing WorkOrderFormDialog — enabled on an active WO.
    const editButton = screen.getByRole('button', { name: /edit/i });
    expect(editButton).not.toBeDisabled();
    // + Dispatch remains disabled until phase 6 lands.
    const addDispatchButton = screen.getByRole('button', { name: /add dispatch/i });
    expect(addDispatchButton).toBeDisabled();
  });

  it('opens the edit dialog when the Edit button is clicked', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);
    // WorkOrderFormDialog mounts a Catalyst Dialog with role="dialog";
    // confirms the click wired through.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('deletes the work order from the overflow menu and navigates back', async () => {
    mockApiResponses();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('WO-00010')
      );
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/wo-1');
    });
    confirmSpy.mockRestore();
  });

  it('does not delete when the user cancels the confirm', async () => {
    mockApiResponses();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('renders a back button to the work orders list', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    const backButton = screen.getByRole('button', { name: /back to/i });
    expect(backButton).toBeInTheDocument();
  });

  it('renders cancelled badge when work order is cancelled', async () => {
    const cancelledWO: WorkOrder = {
      ...mockWorkOrder,
      lifecycleState: 'CANCELLED',
      cancelledAt: '2026-04-22T10:00:00Z',
      cancellationReason: 'Customer cancelled',
    };
    mockApiResponses(cancelledWO);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
    });
  });

  it('renders archived badge when work order is archived', async () => {
    const archivedWO: WorkOrder = {
      ...mockWorkOrder,
      archivedAt: '2026-04-22T10:00:00Z',
    };
    mockApiResponses(archivedWO);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/archived/i)).toBeInTheDocument();
    });
  });

  it('hides location name from the card when not provided', async () => {
    const woWithoutLocationName: WorkOrder = {
      ...mockWorkOrder,
      serviceLocation: {
        ...mockWorkOrder.serviceLocation!,
        locationName: undefined,
      },
    };
    mockApiResponses(woWithoutLocationName);
    renderPage();
    await waitFor(() => {
      // Address renders in both header and card; either confirms the page loaded
      expect(screen.getAllByText(/1942 LENOX RD NE/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Paul's House")).not.toBeInTheDocument();
  });

  it('renders the work items empty state when there are no work items', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no work items/i)).toBeInTheDocument();
    });
  });

  it('renders work items table with descriptions when work items exist', async () => {
    mockApiResponses({
      ...mockWorkOrder,
      workItems: [
        {
          id: 'wi-1',
          statusId: null,
          statusCategory: 'NOT_STARTED',
          description: 'Replace filter',
          equipmentId: null,
          equipment: null,
          createdAt: '2026-04-21T13:40:00Z',
          updatedAt: '2026-04-22T10:30:00Z',
        },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Replace filter')).toBeInTheDocument();
    });
  });

  it('renders the site contact phone with click-to-copy in the Service Location card', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    // Site contact lives in the Service Location card. The phone is a
    // click-to-copy button. Fixture has siteContactPhone: 5559876543 →
    // formatted (555) 987-6543.
    expect(
      screen.getByRole('button', { name: /\(555\) 987-6543/ })
    ).toBeInTheDocument();
  });
});
