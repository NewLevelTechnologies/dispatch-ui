import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import WorkOrderDetailPage from './WorkOrderDetailPage';
import { apiClient } from '../api/setup';
import { useLocation, type RouteObject } from 'react-router-dom';
import type {
  ServiceLocationDetailDto,
  WorkItemResponse,
  WorkOrder,
  WorkOrderFinancialSummary,
} from '../api/setup';

vi.mock('@dispatch/api/src/client');

const mockShowUndo = vi.fn();
vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showUndo: (...a: unknown[]) => mockShowUndo(...a) };
});

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
      city: 'ATLANTA',
      state: 'GA',
      zipCode: '30306-3035',
    },
    siteContactName: 'Paul Wilcox',
    siteContactPhone: '5559876543',
    status: 'ACTIVE',
  },
  workItemCount: 0,
  workItems: [],
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-23T14:46:00Z',
};

const mockServiceLocation: ServiceLocationDetailDto = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Tenant 2 Inc.',
  premiseType: 'RESIDENCE',
  dispatchRegionId: 'region-1',
  locationName: "Paul's House",
  address: {
    streetAddress: '1942 LENOX RD NE',
    city: 'ATLANTA',
    state: 'GA',
    zipCode: '30306-3035',
  },
  additionalContacts: [],
  siteContactName: 'Paul Wilcox',
  siteContactPhone: '5559876543',
  accessInstructions: 'Side gate, dog in yard',
  arrivalFacts: [
    {
      id: 'fact-1',
      label: 'Gate',
      value: '4821',
      mono: true,
      multiline: false,
      authorName: null,
      authorUserId: null,
      displayOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  notes: [
    {
      id: 'note-1',
      body: 'Two small kids in home — offer same-day on no-cooling calls.',
      pinned: true,
      authorName: 'Maria C.',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
};

const WORK_ITEM: WorkItemResponse = {
  id: 'wi-1',
  statusId: null,
  statusCategory: 'IN_PROGRESS',
  description: 'No cooling — upstairs condenser',
  equipmentId: null,
  equipment: null,
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-21T13:40:00Z',
};

/** Stand-in for the dispatch board that reports the query it was handed, so a
 *  back-link can be checked for carrying the date and scope, not just the
 *  path. */
function BoardProbe() {
  const { search } = useLocation();
  return <div>{`Dispatch Board${search}`}</div>;
}

function AgreementsProbe() {
  const { search } = useLocation();
  return <div>{`Agreements${search}`}</div>;
}

describe('WorkOrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ZERO_SUMMARY: WorkOrderFinancialSummary = {
    invoiced: '0.00',
    paid: '0.00',
    balance: '0.00',
    currency: 'USD',
  };

  const mockApiResponses = (
    workOrder: WorkOrder | null = mockWorkOrder,
    summary: WorkOrderFinancialSummary = ZERO_SUMMARY,
    location: ServiceLocationDetailDto | null = mockServiceLocation,
  ) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.match(/\/financial\/work-orders\/[^/]+\/summary$/)) {
        return Promise.resolve({ data: summary });
      }
      if (url.match(/\/financial\/work-orders\/[^/]+\/invoices$/)) {
        return Promise.resolve({ data: [] });
      }
      if (url.match(/\/financial\/work-orders\/[^/]+\/quotes$/)) {
        return Promise.resolve({ data: [] });
      }
      if (url.match(/\/service-locations\/[^/]+$/)) {
        return location
          ? Promise.resolve({ data: location })
          : Promise.reject(new Error('Not found'));
      }
      if (url.includes('/work-orders/config/types')) {
        return Promise.resolve({
          data: {
            workOrderTypes: [{ id: 'type-1', name: 'HVAC Service', code: 'HVAC', accentId: 'blue', isActive: true, sortOrder: 0 }],
            colorsInUse: {},
          },
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
      if (url.match(/\/work-orders\/config\/workflows\/[^/]+$/)) {
        return Promise.resolve({
          data: {
            id: 'wf-1',
            tenantId: 't',
            workOrderTypeId: 'type-1',
            workOrderType: { id: 'type-1', name: 'HVAC Service', code: 'HVAC', accentId: 'blue' },
            name: 'HVAC Service workflow',
            isSeeded: true,
            transitionCount: 0,
            approvalGateCount: 0,
            transitions: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        });
      }
      if (url.endsWith('/work-orders/config/workflows')) {
        return Promise.resolve({ data: [] });
      }
      if (url.endsWith('/work-orders/config/workflow')) {
        return Promise.resolve({
          data: {
            id: 'cfg-1',
            tenantId: 't',
            enforcementMode: 'OPEN',
            defaultApprovalExpiryHours: 72,
            dispatchBoardType: 'STATUS_BASED',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
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
      if (url.match(/\/work-orders\/[^/]+\/approvals$/)) {
        return Promise.resolve({ data: [] });
      }
      if (url.match(/\/work-orders\/[^/]+\/files$/)) {
        return Promise.resolve({
          data: {
            content: [],
            counts: { all: 3, photos: 2, videos: 0, documents: 1 },
            totalElements: 3,
            totalPages: 1,
            number: 0,
            size: 1,
            first: true,
            last: true,
          },
        });
      }
      if (url.endsWith('/work-orders/callback-candidates')) {
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

  const renderPage = (id = 'wo-1', search = '') => {
    /* eslint-disable i18next/no-literal-string -- test-only placeholder routes */
    const routes: RouteObject[] = [
      { path: '/work-orders/:id', element: <WorkOrderDetailPage /> },
      { path: '/work-orders', element: <div>Work Orders List</div> },
      { path: '/dispatch', element: <BoardProbe /> },
      { path: '/agreements', element: <AgreementsProbe /> },
      { path: '/customers/:id', element: <div>Customer Detail</div> },
      { path: '/service-locations/:id', element: <div>Service Location Detail</div> },
    ];
    /* eslint-enable i18next/no-literal-string */

    return renderWithProviders(<WorkOrderDetailPage />, {
      routes,
      initialPath: `/work-orders/${id}${search}`,
    });
  };

  // The dispatch board is a place, not a list: a dispatcher who opened a job
  // from it is mid-triage, so back returns to the day and scope they left
  // rather than dropping them on the work order list.
  it('returns to the dispatch board, restoring its date and scope', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderPage('wo-1', '?from=dispatch&back=date%3D2026-03-15%26region%3Dr1');

    await user.click(await screen.findByRole('button', { name: /back to the board/i }));
    expect(
      await screen.findByText('Dispatch Board?date=2026-03-15&region=r1'),
    ).toBeInTheDocument();
  });

  // The agreements queue's Schedule button lands straight on booking, and back
  // returns to the queue it came from.
  it('opens the dispatch form from the agreements queue, and goes back to it', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderPage('wo-1', `?from=agreements&back=${encodeURIComponent('view=visits')}&schedule=new`);

    expect(await screen.findByText('Work addressed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to agreements/i }));
    expect(await screen.findByText('Agreements?view=visits')).toBeInTheDocument();
  });

  it('displays loading state', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('displays error state when the work order is not found', async () => {
    mockApiResponses(null);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });

  it('auto-attaches new equipment on return from the full-page create (?newEquipmentId + ?attachTo=wi:)', async () => {
    mockApiResponses();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    renderPage('wo-1', '?tab=items&newEquipmentId=eq-new&attachTo=wi:it-1');
    // The return effect PATCHes the launching work item with the new equipment.
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1/work-items/it-1', {
        equipmentId: 'eq-new',
      })
    );
  });

  // ── Header (location-led) ────────────────────────────────────────────
  it('renders a location-led header with site name, WO number, status, division and type', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      // H1 is the SITE, not the WO number or customer.
      expect(screen.getByRole('heading', { name: "Paul's House" })).toBeInTheDocument();
    });
    expect(screen.getByText('WO-00010')).toBeInTheDocument();
    expect(screen.getByText(/not started/i)).toBeInTheDocument();
    // Division + type render in the header AND the editable Details card.
    expect(screen.getAllByText('HVAC').length).toBeGreaterThan(0); // division
    expect(screen.getAllByText('HVAC Service').length).toBeGreaterThan(0); // type
  });

  it('renders the premise tag from the service-location record', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Residence')).toBeInTheDocument();
    });
  });

  it('renders the priority pill (shown for every level, including NORMAL)', async () => {
    mockApiResponses({ ...mockWorkOrder, priority: 'HIGH' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument();
    });
  });

  it('lets the user change priority inline from the header pill', async () => {
    const user = userEvent.setup();
    mockApiResponses({ ...mockWorkOrder, priority: 'HIGH' });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...mockWorkOrder, priority: 'URGENT' } });
    renderPage();
    await waitFor(() => expect(screen.getByText('High')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /priority/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Urgent' }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringMatching(/\/work-orders\/wo-1$/),
        { priority: 'URGENT' },
      );
    });
  });

  it('renders the job essence from the backend summary when present', async () => {
    mockApiResponses({
      ...mockWorkOrder,
      summary: 'No cooling + air-handler noise',
    } as WorkOrder);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No cooling + air-handler noise')).toBeInTheDocument();
    });
  });

  // ── Tab shell ────────────────────────────────────────────────────────
  it('renders the tab row with Overview active by default', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('tab', { name: /work items/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dispatches/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /quotes & invoices/i })).toBeInTheDocument();
  });

  it('shows the file count badge on the Files tab', async () => {
    mockApiResponses();
    renderPage();
    // The list envelope reports counts.all = 3 → the tab's badge.
    expect(await screen.findByRole('tab', { name: /files\s*3/i })).toBeInTheDocument();
  });

  it('switches tabs and unmounts the Overview when Work items is selected', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderPage();
    await waitFor(() => expect(screen.getByText(/bills to/i)).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: /work items/i }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /work items/i })).toHaveAttribute('aria-selected', 'true');
    });
    // The Money card lives only on Overview — gone once we leave it.
    expect(screen.queryByText(/bills to/i)).not.toBeInTheDocument();
  });

  // ── Overview: Money card ─────────────────────────────────────────────
  it('renders the Money card with the payer and a derived rollup', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/bills to/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Tenant 2 Inc.')).toBeInTheDocument();
    // Profile link routes to the customer.
    const profile = screen.getByRole('link', { name: /profile/i });
    expect(profile).toHaveAttribute('href', '/customers/cust-1');
    // Zero summary renders $0.00 (not hidden).
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
  });

  // ── Overview: Location card ──────────────────────────────────────────
  it('renders the Location card with address, gate, access, contact and pinned note', async () => {
    mockApiResponses();
    renderPage();
    // The card hydrates from getServiceLocationById (async); the header address
    // comes from the nested projection, so wait on a card-only value.
    expect(await screen.findByText('4821')).toBeInTheDocument(); // gate arrival fact
    expect(screen.getAllByText(/1942 Lenox Rd Ne/i).length).toBeGreaterThan(0); // title-cased
    expect(screen.getByText(/side gate, dog in yard/i)).toBeInTheDocument(); // access
    expect(screen.getByText(/two small kids in home/i)).toBeInTheDocument(); // pinned site note
    // Site contact phone is a tel link, formatted.
    expect(
      screen.getByRole('link', { name: /\(555\) 987-6543/ }),
    ).toBeInTheDocument();
  });

  // ── Overview: work-items peek ────────────────────────────────────────
  it('shows the work-items peek empty state when there are none', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no work items yet/i)).toBeInTheDocument();
    });
  });

  it('shows work items in the Overview peek when present', async () => {
    mockApiResponses({ ...mockWorkOrder, workItemCount: 1, workItems: [WORK_ITEM] });
    renderPage();
    // Appears in the peek (and the header essence, since there's no summary).
    await waitFor(() => {
      expect(screen.getAllByText('No cooling — upstairs condenser').length).toBeGreaterThan(0);
    });
  });

  // ── Overview: Details (extraRail) card — PO# + NTE inline edit ────────
  it('renders the Details card with the customer PO number', async () => {
    mockApiResponses();
    renderPage();
    // PO# shows in the header meta line AND the Details card.
    await waitFor(() => {
      expect(screen.getAllByText('PO-12345').length).toBeGreaterThan(0);
    });
  });

  it('saves a new NTE value via the Details card inline edit', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...mockWorkOrder, notToExceed: 1500 } });
    renderPage();

    const nteTrigger = await screen.findByLabelText('NTE');
    await user.click(nteTrigger);
    const input = await screen.findByLabelText('NTE');
    await user.type(input, '1500');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringMatching(/\/work-orders\/wo-1$/),
        { notToExceed: 1500 },
      );
    });
  });

  // ── Header actions ───────────────────────────────────────────────────
  it('renders the Call site and Directions actions', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /call site/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /directions/i })).toBeInTheDocument();
  });

  it('opens the edit dialog when Edit is clicked', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('disables Edit on a cancelled work order', async () => {
    mockApiResponses({ ...mockWorkOrder, lifecycleState: 'CANCELLED' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeDisabled();
    });
  });

  it('deletes the work order from the overflow menu and navigates back', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    mockApiResponses();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: "Paul's House" })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(expect.stringMatching(/\/work-orders\/wo-1$/));
    });
    expect(await screen.findByText('Work Orders List')).toBeInTheDocument();
  });

  it('does not delete when the user cancels the confirm', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    mockApiResponses();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: "Paul's House" })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('renders a back button to the work orders list', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: "Paul's House" })).toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: /back to work orders/i })[0]);
    expect(await screen.findByText('Work Orders List')).toBeInTheDocument();
  });

  it('renders the cancelled badge when the work order is cancelled', async () => {
    mockApiResponses({ ...mockWorkOrder, lifecycleState: 'CANCELLED' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
    });
  });

  it('renders the archived badge when the work order is archived', async () => {
    mockApiResponses({ ...mockWorkOrder, archivedAt: '2026-05-01T00:00:00Z' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/archived/i)).toBeInTheDocument();
    });
  });

  it('falls back to the WO number as the header title when no location name', async () => {
    mockApiResponses(
      {
        ...mockWorkOrder,
        serviceLocation: { ...mockWorkOrder.serviceLocation!, locationName: undefined },
      },
      ZERO_SUMMARY,
      { ...mockServiceLocation, locationName: null },
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'WO-00010' })).toBeInTheDocument();
    });
  });

  // ── Callback link ────────────────────────────────────────────────────
  const callbackOf = {
    id: 'wo-orig',
    workOrderNumber: 'WO-1234',
    summary: 'No cooling — upstairs unit',
    completedDate: '2026-09-18',
    chargedTechnicians: [{ userId: 't1', name: 'Daniel Park' }],
    linkedByUserId: 'u1',
    linkedByName: 'Ana Ruiz',
    linkedAt: '2026-09-29T13:58:00Z',
  };

  it('shows a linked callback in the header and its card, naming who it counts for', async () => {
    mockApiResponses({ ...mockWorkOrder, callbackOf });
    renderPage();

    expect(await screen.findByRole('link', { name: 'callbacks.chipLabel' })).toHaveAttribute('href', '/work-orders/wo-orig');
    const card = await screen.findByTestId('callback-card-linked');
    expect(card).toHaveTextContent('WO-1234');
    expect(card).toHaveTextContent('Daniel Park');
    expect(card).toHaveTextContent('callbacks.linkedBy');
  });

  it('unlinks instantly and offers Undo, which restores the link', async () => {
    const user = userEvent.setup();
    mockApiResponses({ ...mockWorkOrder, callbackOf });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...mockWorkOrder, callbackOf: null } });
    renderPage();

    const card = await screen.findByTestId('callback-card-linked');
    await user.click(within(card).getByRole('button', { name: 'callbacks.unlink' }));
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith(expect.stringMatching(/\/work-orders\/wo-1$/), {
        callbackOfWorkOrderId: null,
      }),
    );
    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    const undo = mockShowUndo.mock.calls[0][2] as () => void;
    undo();
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenLastCalledWith(expect.stringMatching(/\/work-orders\/wo-1$/), {
        callbackOfWorkOrderId: 'wo-orig',
      }),
    );
  });

  it('keeps the Callback card off an unlinked work order until it is linked from the header menu', async () => {
    const user = userEvent.setup();
    mockApiResponses({ ...mockWorkOrder, callbackOf: null });
    renderPage();

    // The Overview has rendered (the Details card), but no Callback card.
    await waitFor(() => expect(screen.getAllByText('PO-12345').length).toBeGreaterThan(0));
    expect(screen.queryByText('callbacks.notACallback')).toBeNull();
    expect(screen.queryByTestId('callback-prompt')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'callbacks.linkAsCallback' }));
    expect(await screen.findByTestId('callback-prompt')).toBeInTheDocument();
  });

  it('lists the callbacks that point to an original job', async () => {
    mockApiResponses({
      ...mockWorkOrder,
      completedDate: '2026-09-18',
      callbacks: [
        {
          id: 'wo-cb',
          workOrderNumber: 'WO-1302',
          summary: 'No cooling again',
          createdAt: '2026-09-29T13:58:00Z',
          createdByUserId: 'u1',
          createdByName: 'Ana Ruiz',
          lifecycleState: 'ACTIVE',
          progressCategory: 'AWAITING_SCHEDULE',
        },
      ],
    });
    renderPage();

    const row = await screen.findByTestId('callback-backref');
    expect(row).toHaveTextContent('WO-1302');
    expect(row).toHaveTextContent('callbacks.daysAfter');
  });
});
