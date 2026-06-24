import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import WorkOrderDetailPage from './WorkOrderDetailPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';
import type { WorkOrder, WorkOrderFinancialSummary } from '../api';

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
  workItemCount: 0,
  workItems: [],
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-23T14:46:00Z',
};

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
    invoices: unknown[] = [],
  ) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.match(/\/financial\/work-orders\/[^/]+\/summary$/)) {
        return Promise.resolve({ data: summary });
      }
      if (url.match(/\/financial\/work-orders\/[^/]+\/invoices$/)) {
        return Promise.resolve({ data: invoices });
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

  it('displays loading state', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
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

  it('hides the priority chip on the implicit default NORMAL', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    // NORMAL is the implicit default — showing it adds no information and
    // dilutes status visually. The chip renders only when the user has
    // explicitly set a non-default value (LOW / HIGH / URGENT).
    expect(screen.queryByText(/^normal$/i)).not.toBeInTheDocument();
  });

  it('renders the LOW priority chip when explicitly deprioritized', async () => {
    mockApiResponses({ ...mockWorkOrder, priority: 'LOW' });
    renderPage();
    await waitFor(() => {
      // ALL CAPS label, distinct from the sentence-case status pill.
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });

  it('renders an elevated priority chip in ALL CAPS with heat color when HIGH', async () => {
    mockApiResponses({ ...mockWorkOrder, priority: 'HIGH' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('HIGH')).toBeInTheDocument();
    });
  });

  it('renders an elevated priority chip in ALL CAPS when URGENT', async () => {
    mockApiResponses({ ...mockWorkOrder, priority: 'URGENT' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('URGENT')).toBeInTheDocument();
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

  it('hides derived money chips when the financial summary is all-zero', async () => {
    mockApiResponses();
    renderPage();
    // §5.3 reveal logic — when summary has no activity, derived chips don't
    // render. A row of zero-value chips communicates nothing.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /WO-/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/^quoted$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^invoiced$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Bal$/)).not.toBeInTheDocument();
  });

  describe('NTE header chip (Phase 7 §5.4)', () => {
    it('renders the NTE value compactly with the label when set', async () => {
      mockApiResponses({ ...mockWorkOrder, notToExceed: 12000 });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('$12K')).toBeInTheDocument();
      });
      // Compact value sits next to the "NTE" label in the chip.
      expect(screen.getByText(/^NTE$/)).toBeInTheDocument();
    });

    it('renders a ghost "+ Set NTE" affordance when unset and the row is revealed by derived activity', async () => {
      // NTE is unset but the WO has invoiced activity, so §5.3 reveals the
      // row and the NTE slot renders the ghost entry point.
      mockApiResponses(mockWorkOrder, {
        invoiced: '500.00',
        paid: '0.00',
        balance: '500.00',
        currency: 'USD',
      });
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /not to exceed|nte/i })
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/\+ Set NTE/i)).toBeInTheDocument();
    });

    it('renders both bootstrap ghosts on a fresh active WO (§5.3 Option B)', async () => {
      mockApiResponses(); // active WO, unset NTE, zero summary
      renderPage();
      // Post-drawer-shell the chip row is always rendered for active WOs —
      // typed ghost cluster provides the bootstrap entry to the drawer
      // even when there's no activity yet. Both the NTE ghost and the
      // [+ Invoice] typed ghost are present.
      await waitFor(() => {
        expect(screen.getByText(/\+ Set NTE/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/\+ Invoice/i)).toBeInTheDocument();
    });

    it('still hides the row on a frozen WO with no NTE and zero summary', async () => {
      mockApiResponses({
        ...mockWorkOrder,
        lifecycleState: 'CANCELLED',
        cancellationReason: 'no longer needed',
        cancelledAt: '2026-05-01T00:00:00Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /WO-/i })).toBeInTheDocument();
      });
      // Cancelled/archived WOs without NTE or activity have nothing to
      // show — no ghosts because the WO can't be invoiced anyway.
      expect(screen.queryByText(/\+ Set NTE/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\+ Invoice/i)).not.toBeInTheDocument();
    });

    it('removes the NTE row from the Order Info card', async () => {
      mockApiResponses({ ...mockWorkOrder, notToExceed: 1500 });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('PO-12345')).toBeInTheDocument();
      });
      // Order Info card used to render an "NTE" DescriptionTerm row. After
      // the §5.4 migration the field lives only in the header chip row, so
      // there's exactly one "NTE" surface on the page (the chip), not two.
      const nteOccurrences = screen.getAllByText(/^NTE$/);
      expect(nteOccurrences).toHaveLength(1);
    });

    it('renders read-only NTE (no edit affordance) on a cancelled WO', async () => {
      mockApiResponses({
        ...mockWorkOrder,
        notToExceed: 5000,
        lifecycleState: 'CANCELLED',
        cancellationReason: 'customer canceled',
        cancelledAt: '2026-05-01T00:00:00Z',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('$5K')).toBeInTheDocument();
      });
      // No button (would be the EditableField edit affordance) for the NTE
      // value — cancelled WOs are frozen.
      expect(
        screen.queryByRole('button', { name: /not to exceed|nte/i })
      ).not.toBeInTheDocument();
    });

    it('saves a new NTE value via the inline-edit chip', async () => {
      const user = userEvent.setup();
      // Use a WO that already has NTE set, so the chip is rendered and
      // editable without depending on derived activity to reveal the row.
      mockApiResponses({ ...mockWorkOrder, notToExceed: 100 });
      vi.mocked(apiClient.patch).mockResolvedValue({
        data: { ...mockWorkOrder, notToExceed: 750 },
      });
      renderPage();

      const chip = await screen.findByRole('button', {
        name: /not to exceed|nte/i,
      });
      await user.click(chip);

      const input = await screen.findByRole('textbox', {
        name: /not to exceed|nte/i,
      });
      await user.clear(input);
      await user.type(input, '750');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
          expect.stringMatching(/\/work-orders\/wo-1$/),
          expect.objectContaining({ notToExceed: 750 })
        );
      });
    });
  });

  describe('Derived financial chips (Phase 7 §5.1–5.3)', () => {
    it('renders invoiced · paid · Bal chips when the summary has activity', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '3245.00',
        paid: '1000.00',
        balance: '2245.00',
        currency: 'USD',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('invoiced')).toBeInTheDocument();
      });
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('Bal')).toBeInTheDocument();
      // Compact values per §5.1 formatter.
      expect(screen.getByText('$3.2K')).toBeInTheDocument();
      expect(screen.getByText('$1K')).toBeInTheDocument();
      expect(screen.getByText('$2.2K')).toBeInTheDocument();
    });

    it('renders $0 paid alongside invoiced when paid is zero (cluster reveals together per §5.3)', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '500.00',
        paid: '0.00',
        balance: '500.00',
        currency: 'USD',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('invoiced')).toBeInTheDocument();
      });
      // Zero-paid chip still renders — the whole cluster appears once any
      // member has activity, so partial states aren't hidden.
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('$0')).toBeInTheDocument();
    });

    it('reveals the row when summary has activity even when NTE is unset', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '500.00',
        paid: '0.00',
        balance: '500.00',
        currency: 'USD',
      });
      renderPage();
      // Derived chips are present AND the ghost NTE entry point appears.
      await waitFor(() => {
        expect(screen.getByText('invoiced')).toBeInTheDocument();
      });
      expect(screen.getByText(/\+ Set NTE/i)).toBeInTheDocument();
    });

    it('does not render the typed [+ Invoice] ghost when invoice activity exists', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '500.00',
        paid: '0.00',
        balance: '500.00',
        currency: 'USD',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('invoiced')).toBeInTheDocument();
      });
      // [+ Invoice] is bootstrap-only — retires once any invoice exists.
      // [+ Quote] still shows because no quote activity yet.
      expect(screen.queryByText(/\+ Invoice/i)).not.toBeInTheDocument();
      expect(screen.getByText(/\+ Quote/i)).toBeInTheDocument();
    });

    it('renders the $ quoted chip when summary.quoted > 0 (7b)', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '0.00',
        quoted: '9800.00',
        paid: '0.00',
        balance: '0.00',
        currency: 'USD',
      });
      renderPage();
      // $ quoted joins the live cluster. Once any derived field is
      // non-zero the whole cluster renders ($0 invoiced / $0 paid show
      // too) so the row reads as a coherent reconciliation story.
      await waitFor(() => {
        expect(screen.getByText('quoted')).toBeInTheDocument();
      });
      expect(screen.getByText('$9.8K')).toBeInTheDocument();
      expect(screen.getByText('invoiced')).toBeInTheDocument();
      expect(screen.getByText('paid')).toBeInTheDocument();
    });

    it('retires the [+ Quote] ghost once any quote exists on the WO', async () => {
      mockApiResponses(mockWorkOrder, {
        invoiced: '0.00',
        quoted: '9800.00',
        paid: '0.00',
        balance: '0.00',
        currency: 'USD',
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('quoted')).toBeInTheDocument();
      });
      // Quote ghost retires; Invoice ghost stays (no invoice yet).
      expect(screen.queryByText(/\+ Quote/i)).not.toBeInTheDocument();
      expect(screen.getByText(/\+ Invoice/i)).toBeInTheDocument();
    });
  });

  describe('Bal chip color signal (Phase 7 §5.2)', () => {
    const summaryWithBalance = {
      invoiced: '500.00',
      paid: '0.00',
      balance: '500.00',
      currency: 'USD',
    };
    const sentInvoice = {
      id: 'inv-sent',
      invoiceNumber: 'INV-A',
      status: 'SENT',
      totalAmount: '500.00',
      amountPaid: '0.00',
      balanceDue: '500.00',
      invoiceDate: '2026-05-01T00:00:00Z',
      dueDate: '2026-05-31T00:00:00Z',
      lineItems: [],
      payments: [],
    };
    const overdueInvoice = { ...sentInvoice, id: 'inv-overdue', status: 'OVERDUE' };

    it('renders Bal in amber when invoiced > 0 and paid = 0 with no overdue', async () => {
      mockApiResponses(mockWorkOrder, summaryWithBalance, [sentInvoice]);
      renderPage();
      const bal = await screen.findByRole('button', {
        name: /balance/i,
      });
      expect(bal.className).toMatch(/bg-amber-50/);
      expect(bal.className).not.toMatch(/bg-rose-50/);
    });

    it('renders Bal in rose when ANY invoice on the WO is OVERDUE', async () => {
      mockApiResponses(mockWorkOrder, summaryWithBalance, [
        sentInvoice,
        overdueInvoice,
      ]);
      renderPage();
      const bal = await screen.findByRole('button', {
        name: /balance/i,
      });
      expect(bal.className).toMatch(/bg-rose-50/);
      // Rose takes priority over amber — once an invoice is late, that's
      // the headline state.
      expect(bal.className).not.toMatch(/bg-amber-50/);
    });

    it('renders Bal in zinc when balance is non-zero, paid > 0, and nothing overdue (partial-pay in progress)', async () => {
      mockApiResponses(
        mockWorkOrder,
        {
          invoiced: '500.00',
          paid: '200.00',
          balance: '300.00',
          currency: 'USD',
        },
        [sentInvoice],
      );
      renderPage();
      const bal = await screen.findByRole('button', {
        name: /balance/i,
      });
      expect(bal.className).toMatch(/bg-zinc-100/);
    });
  });

  describe('Chip → financial drawer routing (Phase 7 §3.2)', () => {
    const summaryWithActivity = {
      invoiced: '3245.00',
      paid: '1000.00',
      balance: '2245.00',
      currency: 'USD',
    };

    it('opens the drawer on the Invoices tab when $ invoiced is clicked', async () => {
      const user = userEvent.setup();
      mockApiResponses(mockWorkOrder, summaryWithActivity);
      renderPage();
      const invoicedChip = await screen.findByRole('button', { name: /invoices/i });
      await user.click(invoicedChip);
      // Drawer title surfaces the WO number; Invoices tab is selected.
      expect(await screen.findByText(/Financials · WO/i)).toBeInTheDocument();
      const invoicesTab = screen.getByRole('tab', { name: 'Invoices' });
      expect(invoicesTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders $ paid as plain text, not a button (no Payments tab to route to)', async () => {
      // §3.2 / §5.1: payments fold into invoice expansions, so $ paid has
      // no dedicated tab to navigate to. The chip stays for visual
      // reconciliation but is non-interactive.
      mockApiResponses(mockWorkOrder, summaryWithActivity);
      renderPage();
      // Wait for chips to render.
      await screen.findByText('$3.2K');
      // No button labeled "Payments" — the previous design routed there.
      expect(
        screen.queryByRole('button', { name: /^payments$/i }),
      ).not.toBeInTheDocument();
      // The paid value + label are still in the DOM as plain text.
      expect(screen.getByText('$1K')).toBeInTheDocument();
      expect(screen.getByText('paid')).toBeInTheDocument();
    });

    it('opens the drawer on the Invoices tab AND auto-opens the create dialog when the [+ Invoice] ghost is clicked', async () => {
      const user = userEvent.setup();
      mockApiResponses(); // fresh active WO — typed ghost is the entry point
      renderPage();
      const ghost = await screen.findByText(/\+ Invoice/i);
      await user.click(ghost);
      // Drawer opens at Invoices tab AND the New Invoice dialog auto-opens
      // — one CSR action, one click (§3.2 routing). The inner dialog
      // (aria-modal) hides the rest of the DOM from accessibility queries
      // once visible; presence of the New Invoice dialog itself implies
      // we landed on the Invoices tab (only that tab mounts the dialog).
      const dialog = await screen.findByRole('dialog', { name: /new invoice/i });
      expect(dialog.textContent).toMatch(/WO-00010/);
    });
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

  it('renders the header-right action cluster (Activity + Edit + overflow) and no top-of-page +CTAs', async () => {
    mockApiResponses();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });
    // Activity drawer trigger + Edit WO live in the header (§5d). The three
    // big +CTAs are gone — `+ Work Item` lives at the work items table head,
    // `+ Dispatch` lands in phase 6 next to the dispatch surface, `+ Note`
    // lives inside the activity drawer.
    expect(screen.getAllByRole('button', { name: /activity/i }).length).toBeGreaterThan(0);
    const editButton = screen.getByRole('button', { name: /^edit$/i });
    expect(editButton).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /add dispatch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument();
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
