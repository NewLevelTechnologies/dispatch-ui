import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationDetailPage from './ServiceLocationDetailPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';
import type { ServiceLocationDetailDto, WorkOrderSummary, LocationDispatchResponse } from '../api';

vi.mock('../api/client');

const mockLocation: ServiceLocationDetailDto = {
  id: 'location-1',
  customerId: 'customer-1',
  customerName: 'Test Customer',
  premiseType: 'BUSINESS' as const,
  dispatchRegionId: 'region-1',
  locationName: 'Main Office',
  address: {
    streetAddress: '123 Main St',
    streetAddressLine2: 'Suite 100',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
    validated: true,
    isBusiness: true,
  },
  status: 'ACTIVE' as const,
  siteContactName: 'John Doe',
  siteContactPhone: '5551234567',
  siteContactEmail: 'john@example.com',
  additionalContacts: [],
  accessInstructions: 'Use side entrance',
  notes: [
    {
      id: 'note-1',
      body: 'Important client',
      pinned: false,
      authorName: 'Jane CSR',
      createdAt: '2024-01-02T10:30:00Z',
      updatedAt: '2024-01-02T10:30:00Z',
    },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T10:30:00Z',
  version: 1,
  region: { abbreviation: 'AZ-Central', name: 'Arizona Central' },
  customerStatus: 'ACTIVE' as const,
  customerType: 'STANDARD' as const,
  customerPaymentTermsDays: 30,
  tags: [],
  techOnSite: false,
  hasOpenJobs: false,
  lastServiceAt: null,
};

describe('ServiceLocationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockApiResponses = (
    location: ServiceLocationDetailDto | null = mockLocation,
    regions: unknown[] = [],
    equipment: unknown[] = [],
    workOrders: unknown[] = [],
    locationTech: unknown = { onSiteTech: null, techByWorkOrder: {} },
    invoices: unknown[] = [],
    invoiceSummary: unknown = { billedYtd: 0, openCount: 0, openAmount: 0, aged91: 0, currency: 'USD' },
    dispatches: unknown[] = []
  ) => {
    vi.mocked(apiClient.get).mockImplementation((url, config) => {
      // Site contact card reads the full contact collection (primary-first).
      // Project the location's primary site-contact fields into a primary
      // contact, then append any additional contacts.
      if (url.includes('/service-locations/') && url.includes('/contacts')) {
        const contacts = [];
        if (location?.siteContactName || location?.siteContactPhone || location?.siteContactEmail) {
          contacts.push({
            id: 'primary-contact',
            name: location.siteContactName ?? '',
            phone: location.siteContactPhone ?? null,
            email: location.siteContactEmail ?? null,
            displayOrder: 0,
            isPrimary: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          });
        }
        contacts.push(...(location?.additionalContacts ?? []).map((c) => ({ ...c, isPrimary: false })));
        return Promise.resolve({ data: contacts });
      }
      // Notes card reads the note collection live (same data the detail payload
      // seeds first paint with). Must precede the generic /service-locations/
      // branch below, which would otherwise swallow this URL.
      if (url.includes('/service-locations/') && url.includes('/notes')) {
        return Promise.resolve({ data: location?.notes ?? [] });
      }
      if (url.includes('/notification-preferences')) {
        // Contacts tab fetches per-contact prefs for the Notifications column.
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/service-locations/')) {
        return location ? Promise.resolve({ data: location }) : Promise.reject(new Error('Not found'));
      }
      if (url.includes('/dispatch-regions')) {
        return Promise.resolve({ data: regions });
      }
      if (url.startsWith('/work-orders/config/')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/scheduling/dispatches/location-tech')) {
        return Promise.resolve({ data: locationTech });
      }
      // Location-scoped dispatch list (Dispatches tab) — paged envelope. url is
      // the bare path; serviceLocationId/when/page/size ride params. Must follow
      // location-tech. Mirrors the backend: when=upcoming → strictly future open
      // dispatches, soonest first; anything else → full history, newest first.
      if (url === '/scheduling/dispatches' || url.startsWith('/scheduling/dispatches?')) {
        const params = (config?.params ?? {}) as { when?: string; page?: number; size?: number };
        const all = dispatches as LocationDispatchResponse[];
        const rows =
          params.when === 'upcoming'
            ? all
                .filter(
                  (d) =>
                    ['SCHEDULED', 'IN_PROGRESS'].includes(d.status) &&
                    new Date(d.arrivalWindowStart).getTime() >= Date.now(),
                )
                .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime())
            : [...all].sort(
                (a, b) => new Date(b.arrivalWindowStart).getTime() - new Date(a.arrivalWindowStart).getTime(),
              );
        const size = params.size ?? 200;
        const page = params.page ?? 0;
        return Promise.resolve({
          data: {
            content: rows.slice(page * size, page * size + size),
            page,
            size,
            totalElements: rows.length,
            totalPages: Math.ceil(rows.length / size),
            first: page === 0,
            last: (page + 1) * size >= rows.length,
          },
        });
      }
      // Order matters: the summary path is more specific than the list path.
      if (url.includes('/financial/invoices/summary')) {
        return Promise.resolve({ data: invoiceSummary });
      }
      // Paged list — serves both the tab body's filtered query and the size-1
      // count query (custom PageResponse envelope: `page`, not `number`).
      if (url.includes('/financial/invoices')) {
        return Promise.resolve({
          data: {
            content: invoices,
            page: 0,
            size: 25,
            totalElements: invoices.length,
            totalPages: invoices.length ? 1 : 0,
            first: true,
            last: true,
          },
        });
      }
      if (url.includes('/work-orders')) {
        return Promise.resolve({
          data: {
            content: workOrders,
            totalElements: workOrders.length,
            totalPages: workOrders.length ? 1 : 0,
            number: 0,
            size: 25,
          },
        });
      }
      if (url === '/equipment' || url.startsWith('/equipment?')) {
        return Promise.resolve({
          data: {
            content: equipment,
            totalElements: equipment.length,
            totalPages: 1,
            number: 0,
            size: 100,
          },
        });
      }
      if (url === '/equipment/config/types') {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/equipment/config/categories')) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/equipment/')) {
        // Equipment getById — used when opening the edit dialog.
        return Promise.resolve({ data: equipment[0] ?? null });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  };

  const renderDetailPage = (locationId = 'location-1') => {
    const routes: RouteObject[] = [
      {
        path: '/service-locations/:id',
        element: <ServiceLocationDetailPage />,
      },
    ];

    return renderWithProviders(<ServiceLocationDetailPage />, {
      routes,
      initialPath: `/service-locations/${locationId}`,
    });
  };

  // ── Resolved tech view (scheduling-service location-tech) ───────────────
  describe('resolved tech view', () => {
    const makeWO = (over: Partial<WorkOrderSummary>): WorkOrderSummary => ({
      id: 'wo-x',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      lifecycleState: 'ACTIVE',
      progressCategory: 'IN_PROGRESS',
      priority: 'NORMAL',
      workItemCount: 0,
      workItems: [],
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      ...over,
    });

    const techLocation = { ...mockLocation, hasOpenJobs: true };
    // Assigned users ride the WO search rows (`assignedUsers[]`, most-relevant-
    // first, per-entry state) — no scheduling merge. wo-4 has none → dash, not
    // an error.
    const workOrders = [
      makeWO({
        id: 'wo-1', workOrderNumber: 'WO-5000', priority: 'URGENT', equip: { label: 'RTU-3', count: 1 },
        assignedUsers: [
          { userId: 'u-1', name: 'Dana Park', state: 'ON_SITE' },
          { userId: 'u-2', name: 'Lee Wong', state: 'SCHEDULED' },
        ],
      }),
      makeWO({
        id: 'wo-2', workOrderNumber: 'WO-5001',
        assignedUsers: [{ userId: 'u-3', name: null, state: 'SCHEDULED' }],
      }),
      makeWO({
        id: 'wo-3', workOrderNumber: 'WO-5002', progressCategory: 'COMPLETED',
        assignedUsers: [{ userId: 'u-4', name: 'Sam Lee', state: 'DONE' }],
      }),
      makeWO({ id: 'wo-4', workOrderNumber: 'WO-5003', progressCategory: 'NOT_STARTED', assignedUsers: [] }),
    ];
    // location-tech now feeds the attention strip's on-site row only.
    const locationTech = {
      onSiteTech: {
        name: 'Dana Park',
        workOrderId: 'wo-1',
        workOrderNumber: 'WO-5000',
        // ~50h ago → exercises the day-tier of the duration formatter, clock-independent.
        since: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
        eta: new Date(Date.now() - 51 * 60 * 60 * 1000).toISOString(),
      },
      techByWorkOrder: {},
    };

    it('surfaces the live on-site tech row in the attention strip', async () => {
      mockApiResponses(techLocation, [], [], workOrders, locationTech);
      renderDetailPage();
      await waitFor(() =>
        expect(screen.getByText(/Dana Park on site · WO-5000/)).toBeInTheDocument()
      );
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('derives the urgent open-jobs row from the loaded work orders', async () => {
      mockApiResponses(techLocation, [], [], workOrders, locationTech);
      renderDetailPage();
      await waitFor(() => expect(screen.getByText(/1 urgent job/)).toBeInTheDocument());
    });

    it('renders embedded assigned users per work-order row (name, +N, null fallback)', async () => {
      mockApiResponses(techLocation, [], [], workOrders, locationTech);
      renderDetailPage();
      // lead with +N overflow
      await waitFor(() => expect(screen.getByText('Dana Park +1')).toBeInTheDocument());
      // null name falls back rather than blanking the cell
      expect(screen.getByText('Assigned user')).toBeInTheDocument();
      // past (completed) lead still shown
      expect(screen.getByText('Sam Lee')).toBeInTheDocument();
    });
  });

  // ── States ────────────────────────────────────────────────────────────
  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderDetailPage();
    expect(screen.getByText(/loading location/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/error loading location/i)).toBeInTheDocument();
    });
  });

  it('displays a back action in the error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/error loading location/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /back to location/i })).toBeInTheDocument();
  });

  // ── Header ────────────────────────────────────────────────────────────
  it('displays location headline and status', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    // "Active" appears on both the location status pill and the Billed-to
    // customer-status pill.
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('premise-driven header mark labels a Business location', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
    // Single premise signal — the 52px mark carries it (no separate pill).
    expect(screen.getByLabelText('Business')).toBeInTheDocument();
    expect(screen.queryByLabelText('Residence')).not.toBeInTheDocument();
  });

  it('premise-driven header mark labels a Residence location', async () => {
    mockApiResponses({ ...mockLocation, premiseType: 'RESIDENCE' as const });
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
    expect(screen.getByLabelText('Residence')).toBeInTheDocument();
    expect(screen.queryByLabelText('Business')).not.toBeInTheDocument();
  });

  it('falls back to the customer name as headline for an unnamed location', async () => {
    mockApiResponses({ ...mockLocation, locationName: '' });
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Customer' })).toBeInTheDocument();
    });
  });

  it('displays an inactive status', async () => {
    mockApiResponses({ ...mockLocation, status: 'INACTIVE' as const });
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('displays the full address in the header', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/123 Main St Suite 100/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Springfield, IL 62701/i)).toBeInTheDocument();
  });

  // ── Back-link + customer link ───────────────────────────────────────────
  it('back-link defaults to the parent customer', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    const backLink = screen.getByRole('link', { name: /test customer/i });
    expect(backLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('links to the parent customer from the Billed-to card', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    const customerLink = screen.getByRole('link', { name: /open customer/i });
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  // ── Overview content ──────────────────────────────────────────────────
  it('displays site contact information', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('(555) 123-4567')).toHaveAttribute('href', 'tel:5551234567');
    expect(screen.getByText('john@example.com')).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('displays access instructions', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Use side entrance')).toBeInTheDocument();
    });
  });

  it('displays notes', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Important client')).toBeInTheDocument();
    });
  });

  it('displays the region label from the payload', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('AZ-Central')).toBeInTheDocument();
    });
  });

  it('renders without crashing for a minimal location', async () => {
    mockApiResponses({
      ...mockLocation,
      siteContactName: '',
      siteContactPhone: '',
      siteContactEmail: '',
      accessInstructions: '',
      notes: [],
    });
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    // Empty-state copy stands in for the missing site contact + notes.
    expect(screen.getByText(/no site contact on file/i)).toBeInTheDocument();
    expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
  });

  // ── Tabs ──────────────────────────────────────────────────────────────
  it('displays all tabs', async () => {
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /equipment/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /work order/i })).toBeInTheDocument();
    // Dispatches tab label is glossary-driven from the `dispatch` entity.
    expect(screen.getByRole('tab', { name: /dispatch/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /contacts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });

  it('switches to the equipment tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    const equipmentTab = screen.getByRole('tab', { name: /equipment/i });
    await user.click(equipmentTab);
    await waitFor(() => expect(equipmentTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('switches to the work orders tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    const workOrdersTab = screen.getByRole('tab', { name: /work order/i });
    await user.click(workOrdersTab);
    await waitFor(() => expect(workOrdersTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('switches to the activity tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    const activityTab = screen.getByRole('tab', { name: /activity/i });
    await user.click(activityTab);
    await waitFor(() => expect(activityTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('renders the contacts directory table on the Contacts tab', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    const contactsTab = screen.getByRole('tab', { name: /contacts/i });
    await user.click(contactsTab);
    await waitFor(() => expect(contactsTab).toHaveAttribute('aria-selected', 'true'));

    // The primary site contact shows in the directory, badged + with its phone.
    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(within(table).getByText('John Doe')).toBeInTheDocument();
      expect(within(table).getByText('Primary')).toBeInTheDocument();
      expect(within(table).getByText('(555) 123-4567')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
  });

  // ── Dispatches tab ──────────────────────────────────────────────────────
  describe('dispatches tab', () => {
    const makeDispatch = (over: Partial<LocationDispatchResponse> = {}): LocationDispatchResponse => ({
      id: 'd-1',
      workOrderId: 'wo-1',
      assignedUserId: 'u-1',
      arrivalWindowStart: '2026-07-01T15:00:00Z',
      arrivalWindowEnd: '2026-07-01T17:00:00Z',
      estimatedDuration: 120,
      status: 'SCHEDULED',
      arrivedAt: null,
      departedAt: null,
      notes: null,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      workOrderNumber: 'WO-5000',
      workOrderTypeName: 'Quarterly PM',
      workOrderSummary: 'Replace compressor',
      assignedUserName: 'Jane Tech',
      ...over,
    });

    const openDispatchesTab = async (dispatches: LocationDispatchResponse[]) => {
      mockApiResponses(mockLocation, [], [], [], undefined, [], undefined, dispatches);
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /dispatch/i }));
      return user;
    };

    it('splits dispatches into Upcoming and Past with the resolved tech + type', async () => {
      await openDispatchesTab([
        makeDispatch({ id: 'd-1', status: 'SCHEDULED' }),
        makeDispatch({ id: 'd-2', status: 'COMPLETED', workOrderNumber: 'WO-4000', arrivalWindowStart: '2026-05-01T15:00:00Z', arrivalWindowEnd: '2026-05-01T17:00:00Z', arrivedAt: '2026-05-01T15:10:00Z', departedAt: '2026-05-01T16:30:00Z' }),
      ]);

      await waitFor(() => expect(screen.getByText('Upcoming')).toBeInTheDocument());
      expect(screen.getByText('Past')).toBeInTheDocument();
      // The future SCHEDULED dispatch renders once — in Upcoming, not echoed in
      // Past (the full-history response is filtered client-side until the
      // backend `when=past` complement lands).
      expect(screen.getAllByText('WO-5000')).toHaveLength(1);
      expect(screen.getByText('WO-4000')).toBeInTheDocument();
      expect(screen.getAllByText('Jane Tech').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Quarterly PM').length).toBeGreaterThan(0);
    });

    it('flags an overdue scheduled dispatch', async () => {
      // SCHEDULED with a window that ended in the past → not upcoming (the
      // backend window is strictly future) — lands in Past with Overdue treatment.
      await openDispatchesTab([
        makeDispatch({ id: 'd-1', status: 'SCHEDULED', arrivalWindowStart: '2020-01-01T08:00:00Z', arrivalWindowEnd: '2020-01-01T10:00:00Z' }),
      ]);
      await waitFor(() => expect(screen.getByText('Overdue')).toBeInTheDocument());
      expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    });

    it('pages the Past listing', async () => {
      // 30 completed dispatches, newest first → page 1 holds 25, page 2 the rest.
      const all = Array.from({ length: 30 }, (_, i) =>
        makeDispatch({
          id: `d-${i}`,
          status: 'COMPLETED',
          workOrderNumber: `WO-${1000 + i}`,
          // Descending days so row order matches index order.
          arrivalWindowStart: new Date(Date.UTC(2026, 0, 31 - i, 15)).toISOString(),
          arrivalWindowEnd: new Date(Date.UTC(2026, 0, 31 - i, 17)).toISOString(),
        }),
      );
      const user = await openDispatchesTab(all);

      await waitFor(() => expect(screen.getByText('WO-1000')).toBeInTheDocument());
      expect(screen.queryByText('WO-1029')).not.toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByText('WO-1029')).toBeInTheDocument());
      expect(screen.queryByText('WO-1000')).not.toBeInTheDocument();
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('drills through to the owning work order on row click', async () => {
      const user = userEvent.setup();
      const routes: RouteObject[] = [
        { path: '/service-locations/:id', element: <ServiceLocationDetailPage /> },
        // eslint-disable-next-line i18next/no-literal-string
        { path: '/work-orders/:id', element: <div>Work order stub</div> },
      ];
      mockApiResponses(mockLocation, [], [], [], undefined, [], undefined, [makeDispatch()]);
      renderWithProviders(<ServiceLocationDetailPage />, { routes, initialPath: '/service-locations/location-1' });
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /dispatch/i }));

      const row = (await screen.findByText('WO-5000')).closest('tr')!;
      await user.click(row);
      await waitFor(() => expect(screen.getByText('Work order stub')).toBeInTheDocument());
    });

    it('shows an empty state when there are no dispatches', async () => {
      await openDispatchesTab([]);
      await waitFor(() => expect(screen.getByText(/no dispatches yet/i)).toBeInTheDocument());
    });
  });

  // ── Invoices tab (FIN-1) ────────────────────────────────────────────────
  describe('invoices tab', () => {
    const makeInvoice = (over: Record<string, unknown> = {}) => ({
      id: 'inv-1',
      customerId: 'customer-1',
      workOrderId: 'wo-1',
      invoiceNumber: 'INV-1001',
      status: 'SENT',
      invoiceDate: '2026-01-15T00:00:00Z',
      dueDate: '2026-02-15T00:00:00Z',
      subtotal: 500,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 500,
      amountPaid: 0,
      balanceDue: 500,
      overdue: false,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      ...over,
    });

    const summary = { billedYtd: 1234.56, openCount: 2, openAmount: 890, aged91: 150, currency: 'USD' };
    const workOrders = [
      {
        id: 'wo-1',
        customerId: 'customer-1',
        serviceLocationId: 'location-1',
        workOrderNumber: 'WO-5000',
        lifecycleState: 'ACTIVE',
        progressCategory: 'IN_PROGRESS',
        priority: 'NORMAL',
        workItemCount: 1,
        workItems: [{ description: 'RTU-3 no cooling' }],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const openInvoicesTab = async () => {
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /invoice/i }));
      return user;
    };

    it('renders the summary strip and invoice rows', async () => {
      mockApiResponses(mockLocation, [], [], workOrders, undefined, [makeInvoice()], summary);
      await openInvoicesTab();

      // Summary strip — server-computed billed YTD, open, aged.
      await waitFor(() => expect(screen.getByText('$1,234.56')).toBeInTheDocument());
      expect(screen.getByText('Billed YTD')).toBeInTheDocument();
      expect(screen.getByText('2 open')).toBeInTheDocument();
      expect(screen.getByText('past due')).toBeInTheDocument();

      // Row: number, resolved WO #, bill-to, amount + balance (both $500 here).
      expect(screen.getByText('INV-1001')).toBeInTheDocument();
      expect(screen.getByText('WO-5000')).toBeInTheDocument();
      expect(screen.getAllByText('$500.00')).toHaveLength(2);
    });

    it('drills through to the owning work order on row click', async () => {
      mockApiResponses(mockLocation, [], [], workOrders, undefined, [makeInvoice()], summary);
      const user = userEvent.setup();
      // No standalone invoice route — navigation targets the WO (financial
      // drawer lives there). Render with a stub WO route to observe the nav.
      const routes: RouteObject[] = [
        { path: '/service-locations/:id', element: <ServiceLocationDetailPage /> },
        // eslint-disable-next-line i18next/no-literal-string
        { path: '/work-orders/:id', element: <div>Work order stub</div> },
      ];
      renderWithProviders(<ServiceLocationDetailPage />, {
        routes,
        initialPath: '/service-locations/location-1',
      });
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /invoice/i }));

      const row = (await screen.findByText('INV-1001')).closest('tr')!;
      await user.click(row);
      await waitFor(() => expect(screen.getByText('Work order stub')).toBeInTheDocument());
    });

    it('strikes through and mutes the amount on a void invoice', async () => {
      const voided = makeInvoice({ id: 'inv-2', invoiceNumber: 'INV-2002', status: 'VOID', totalAmount: 100 });
      mockApiResponses(mockLocation, [], [], workOrders, undefined, [voided], summary);
      await openInvoicesTab();

      const amount = await screen.findByText('$100.00');
      expect(amount.className).toContain('line-through');
      expect(amount.className).toContain('text-fg-muted');
    });

    it('shows an empty state when the location has no invoices', async () => {
      mockApiResponses(mockLocation, [], [], [], undefined, [], summary);
      await openInvoicesTab();
      await waitFor(() =>
        expect(screen.getByText(/for work at this site will appear here/i)).toBeInTheDocument()
      );
    });

    it('renders the server-derived overdue flag as the status pill', async () => {
      // status still SENT but `overdue: true` (open + strictly past due) —
      // the row badge follows the server flag, not the stored status.
      const lagging = makeInvoice({ overdue: true, status: 'SENT' });
      mockApiResponses(mockLocation, [], [], workOrders, undefined, [lagging], summary);
      await openInvoicesTab();
      await waitFor(() => expect(screen.getByText('Overdue')).toBeInTheDocument());
      expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    });

    it('searches the location’s invoices via the q param', async () => {
      mockApiResponses(mockLocation, [], [], workOrders, undefined, [makeInvoice()], summary);
      const user = await openInvoicesTab();
      await waitFor(() => expect(screen.getByText('INV-1001')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText(/search invoice/i), '1001');
      await waitFor(() => {
        const sentQ = vi
          .mocked(apiClient.get)
          .mock.calls.some(
            ([u, cfg]) =>
              u === '/financial/invoices' &&
              (cfg as { params?: { q?: string; serviceLocationId?: string } } | undefined)?.params?.q === '1001' &&
              (cfg as { params?: { serviceLocationId?: string } } | undefined)?.params?.serviceLocationId === 'location-1',
          );
        expect(sentQ).toBe(true);
      });
    });
  });

  // ── Jobs (Work Orders) tab ──────────────────────────────────────────────
  describe('jobs tab', () => {
    const makeJobWO = (over: Partial<WorkOrderSummary>): WorkOrderSummary => ({
      id: 'wo-7',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      workOrderNumber: 'WO-7001',
      lifecycleState: 'ACTIVE',
      progressCategory: 'IN_PROGRESS',
      priority: 'NORMAL',
      workItemCount: 1,
      workItems: [{ description: 'No cooling' } as WorkOrderSummary['workItems'][number]],
      scheduledDate: '2026-07-01T00:00:00Z',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      ...over,
    });

    it('renders the filterable work-order list with the New action', async () => {
      mockApiResponses(mockLocation, [], [], [makeJobWO({})]);
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /work order/i }));

      await waitFor(() => expect(screen.getByText('WO-7001')).toBeInTheDocument());
      expect(screen.getByPlaceholderText(/search wo#/i)).toBeInTheDocument();
    });

    it('searches within the location’s work orders via the q param', async () => {
      mockApiResponses(mockLocation, [], [], [makeJobWO({})]);
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /work order/i }));
      await waitFor(() => expect(screen.getByText('WO-7001')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText(/search wo#/i), 'cooling');
      await waitFor(() => {
        const sentQ = vi
          .mocked(apiClient.get)
          .mock.calls.some(
            ([u, cfg]) =>
              u === '/work-orders' &&
              (cfg as { params?: { q?: string } } | undefined)?.params?.q === 'cooling',
          );
        expect(sentQ).toBe(true);
      });
    });
  });

  it('scopes the work-orders fetch to serviceLocationId only (not customerId)', async () => {
    // Regression: passing both customerId and serviceLocationId caused the backend to
    // return all of the customer's work orders, leaking sibling locations' WOs.
    mockApiResponses();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    const calls = vi.mocked(apiClient.get).mock.calls;
    const workOrdersCall = calls.find(([url]) => typeof url === 'string' && url === '/work-orders');
    expect(workOrdersCall).toBeDefined();
    const params = (workOrdersCall![1] as { params?: Record<string, unknown> })?.params ?? {};
    expect(params).toHaveProperty('serviceLocationId', 'location-1');
    expect(params).not.toHaveProperty('customerId');
  });

  // ── Header actions / dialogs ────────────────────────────────────────────
  it('flips the header into inline edit (no modal) from the header', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    // Header "Edit" is the first Edit-labelled button (before the right-rail card links).
    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    await user.click(editButtons[0]);

    // Edits in place — the address field becomes editable, no dialog opens.
    await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument());
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('collapses the inline editor on cancel', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
  });

  it('opens the new-work-order dialog with the service location pre-selected', async () => {
    mockApiResponses();
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    // Header + Jobs-in-flight card both expose a "New Work Order" button; either opens
    // the same dialog. Click the first.
    await user.click(screen.getAllByRole('button', { name: /new work order/i })[0]);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByDisplayValue(/Main Office.*123 Main St.*Springfield/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /existing customer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /new customer/i })).not.toBeInTheDocument();
  });

  // ── Lifecycle footer ────────────────────────────────────────────────────
  it('confirms before closing the location', async () => {
    mockApiResponses();
    const closeSpy = vi.mocked(apiClient.post).mockResolvedValue({ data: mockLocation });
    const user = userEvent.setup();
    renderDetailPage();
    await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());

    // Footer "Close location" → confirmation dialog → confirm.
    await user.click(screen.getByRole('button', { name: /^close location$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /close location/i }));

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledWith('/service-locations/location-1/close');
    });
  });

  // ── Equipment tab ────────────────────────────────────────────────────────
  describe('equipment tab', () => {
    const equipmentList = [
      {
        id: 'eq-1',
        name: 'Upstairs Furnace',
        equipmentTypeName: 'HVAC',
        equipmentCategoryName: 'Furnace',
        make: 'Carrier',
        model: 'C-100',
        serialNumber: 'SN1',
        locationOnSite: 'Basement',
      },
      {
        id: 'eq-2',
        name: 'Walk-in Cooler',
        equipmentTypeName: null,
        equipmentCategoryName: null,
        make: null,
        model: null,
        serialNumber: 'SN2',
        locationOnSite: null,
      },
    ];

    it('renders equipment grouped by type', async () => {
      mockApiResponses(mockLocation, [], equipmentList);
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /equipment/i }));

      await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());
      expect(screen.getByText('Carrier')).toBeInTheDocument();
      expect(screen.getByText('C-100')).toBeInTheDocument();
      expect(screen.getByText('Basement')).toBeInTheDocument();
      expect(screen.getByText('Walk-in Cooler')).toBeInTheDocument();
    });

    it('shows the empty state when there is no equipment', async () => {
      mockApiResponses();
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /equipment/i }));

      await waitFor(() => expect(screen.getByText(/no.*equipment.*yet/i)).toBeInTheDocument());
    });

    it('opens the equipment form dialog in create mode when Add is clicked', async () => {
      mockApiResponses();
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /equipment/i }));
      await user.click(await screen.findByRole('button', { name: /add equipment/i }));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      expect(screen.queryByLabelText(/customer/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Location \*$/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    });

    it('opens the edit dialog with the full record when Edit is selected', async () => {
      const fullRecord = { ...equipmentList[0], serviceLocationId: 'location-1', status: 'ACTIVE', attributes: '{}' };
      mockApiResponses(mockLocation, [], [fullRecord]);
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /equipment/i }));
      await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

      // Scope to the equipment row — the header also has a "More options" kebab.
      const row = screen.getByText('Upstairs Furnace').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /more options/i }));
      await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    });

    it('confirms before deleting and calls the delete endpoint', async () => {
      mockApiResponses(mockLocation, [], equipmentList);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteSpy = vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Main Office')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /equipment/i }));
      await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

      // Scope to the equipment row — the header also has a "More options" kebab.
      const row = screen.getByText('Upstairs Furnace').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /more options/i }));
      await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled();
        expect(deleteSpy).toHaveBeenCalledWith('/equipment/eq-1');
      });
      confirmSpy.mockRestore();
    });
  });

  // ── Notes card ───────────────────────────────────────────────────────────
  describe('notes card', () => {
    // Walk up from a note body to the enclosing Card root. getByText only
    // matches an element's own direct text, so the body div is the hit.
    const notesCardFor = (bodyText: RegExp): HTMLElement => {
      let el: HTMLElement | null = screen.getByText(bodyText);
      while (el && !(typeof el.className === 'string' && /rounded-\[10px\]/.test(el.className))) {
        el = el.parentElement;
      }
      if (!el) throw new Error('Notes card not found');
      return el;
    };

    const pinnedFirstLocation: ServiceLocationDetailDto = {
      ...mockLocation,
      notes: [
        {
          id: 'n-pin',
          body: 'Roof access via rear ladder',
          pinned: true,
          authorName: 'Dispatch',
          createdAt: '2024-05-01T00:00:00Z',
          updatedAt: '2024-05-01T00:00:00Z',
        },
        {
          id: 'note-1',
          body: 'Important client',
          pinned: false,
          authorName: 'Jane CSR',
          createdAt: '2024-01-02T10:30:00Z',
          updatedAt: '2024-01-02T10:30:00Z',
        },
      ],
    };

    it('renders the pinned count, the pinned treatment, and the author', async () => {
      mockApiResponses(pinnedFirstLocation);
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Roof access via rear ladder')).toBeInTheDocument());

      expect(screen.getByText(/1 pinned/)).toBeInTheDocument();
      expect(screen.getByText('Pinned ·')).toBeInTheDocument();
      expect(screen.getByText(/Jane CSR/)).toBeInTheDocument();
    });

    it('opens the add-note dialog from + Add and POSTs the new note', async () => {
      mockApiResponses();
      const postSpy = vi.mocked(apiClient.post).mockResolvedValue({
        data: { id: 'new', body: 'New note', pinned: false, authorName: null, createdAt: '', updatedAt: '' },
      });
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Important client')).toBeInTheDocument());

      await user.click(within(notesCardFor(/Important client/)).getByRole('button', { name: '+ Add' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/add note/i)).toBeInTheDocument();

      await user.type(within(dialog).getByRole('textbox'), 'New note');
      await user.click(within(dialog).getByRole('button', { name: /save/i }));

      await waitFor(() =>
        expect(postSpy).toHaveBeenCalledWith('/service-locations/location-1/notes', {
          body: 'New note',
          pinned: false,
        })
      );
    });

    it('toggles pin via the row action (partial PATCH)', async () => {
      mockApiResponses();
      const patchSpy = vi.mocked(apiClient.patch).mockResolvedValue({
        data: { id: 'note-1', pinned: true },
      });
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Important client')).toBeInTheDocument());

      await user.click(within(notesCardFor(/Important client/)).getByRole('button', { name: /^pin$/i }));

      await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('/notes/note-1', { pinned: true }));
    });

    it('confirms before deleting a note, then DELETEs', async () => {
      mockApiResponses();
      const deleteSpy = vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Important client')).toBeInTheDocument());

      await user.click(within(notesCardFor(/Important client/)).getByRole('button', { name: /^delete$/i }));
      expect(await screen.findByText(/delete note\?/i)).toBeInTheDocument();

      // The confirm button is the last "Delete"-labelled button (the row's is first).
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      await user.click(deleteButtons[deleteButtons.length - 1]);

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/notes/note-1'));
    });

    it('opens the edit dialog prefilled with the note body', async () => {
      mockApiResponses();
      const user = userEvent.setup();
      renderDetailPage();
      await waitFor(() => expect(screen.getByText('Important client')).toBeInTheDocument());

      await user.click(within(notesCardFor(/Important client/)).getByRole('button', { name: /^edit$/i }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/edit note/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('textbox')).toHaveValue('Important client');
    });
  });
});
