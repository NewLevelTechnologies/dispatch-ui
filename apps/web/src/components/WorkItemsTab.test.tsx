import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemsTab from './WorkItemsTab';
import { apiClient } from '../api/setup';
import type {
  DispatchBoardRow,
  PurchaseOrderListItem,
  WorkItemResponse,
  WorkItemStatus,
} from '../api/setup';

vi.mock('@dispatch/api/src/client');

const wi = (id: string, sequence: number, description: string, overrides: Partial<WorkItemResponse> = {}): WorkItemResponse => ({
  id,
  sequence,
  statusId: 's-new',
  statusCategory: 'NOT_STARTED',
  description,
  equipmentId: null,
  equipment: null,
  createdAt: '2026-05-14T13:40:00Z',
  updatedAt: '2026-05-14T13:40:00Z',
  ...overrides,
});

const status = (id: string, code: string, statusCategory: WorkItemStatus['statusCategory'], sortOrder: number) =>
  ({ id, code, name: code === 'PENDING_PARTS' ? 'Awaiting parts' : code, statusCategory, sortOrder, isActive: true }) as WorkItemStatus;

const STATUSES = [
  status('s-new', 'NEW', 'NOT_STARTED', 1),
  status('s-wip', 'IN_PROGRESS', 'IN_PROGRESS', 2),
  status('s-parts', 'PENDING_PARTS', 'BLOCKED', 3),
  status('s-arrived', 'PARTS_ARRIVED', 'AWAITING_SCHEDULE', 4),
  status('s-done', 'COMPLETE', 'COMPLETED', 5),
];

const dispatch = (id: string, workItemIds: string[], overrides: Partial<DispatchBoardRow> = {}) =>
  ({
    id,
    workOrderId: 'wo-1',
    assignedUserId: 'u-1',
    assignedUserName: 'Daniel Park',
    arrivalWindowStart: '2026-05-14T14:00:00Z',
    arrivalWindowEnd: '2026-05-14T16:00:00Z',
    status: 'SCHEDULED',
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: workItemIds,
    ...overrides,
  }) as DispatchBoardRow;

const handlers = () => ({
  onSaveDescription: vi.fn().mockResolvedValue(undefined),
  onSaveDiagnosis: vi.fn().mockResolvedValue(undefined),
  onAttachEquipment: vi.fn(),
  onSetEquipmentNeeded: vi.fn(),
  onOpenEquipment: vi.fn(),
  onSelectDispatch: vi.fn(),
  onScheduleDispatch: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
});

const baseProps = {
  workOrderId: 'wo-1',
  serviceLocationId: 'loc-1',
  statuses: STATUSES,
  transitions: [],
  enforceWorkflow: false,
};

let pos: PurchaseOrderListItem[] = [];
let audit: unknown[] = [];
let docs: unknown[] = [];
let woQuotes: unknown[] = [];

describe('WorkItemsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pos = [];
    audit = [];
    docs = [];
    woQuotes = [];
    window.history.replaceState(null, '', '/work-orders/wo-1?tab=items');
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/inventory/purchase-orders') return { data: { content: pos } };
      if (url.startsWith('/audit/')) return { data: audit };
      if (url === '/financial/work-orders/wo-1/work-item-documents') return { data: docs };
      if (url === '/financial/work-orders/wo-1/quotes') return { data: woQuotes };
      if (url === '/financial/labor-rates')
        return { data: [{ id: 'rate-reg', name: 'Regular', role: 'REGULAR', billRate: 120, active: true }] };
      if (url === '/financial/quotes/q-draft') return { data: { id: 'q-draft', quoteNumber: 'Q-1900', version: 4 } };
      if (url.endsWith('/notes')) return { data: [] };
      if (url.match(/^\/equipment\/[^/]+$/)) return { data: { id: 'eq-1', name: 'Upstairs Furnace' } };
      return { data: { content: [], totalElements: 0, counts: {} } };
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('shows the empty state with an Add button when the job has no items', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[]} />);
    expect(screen.getByText(/no work items yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add work item/i })).toBeInTheDocument();
  });

  it('lists open items first with a Done group, and shows the first open item in the detail', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[
          wi('wi-1', 1, 'Thermostat replaced', { statusId: 's-done', statusCategory: 'COMPLETED' }),
          wi('wi-2', 2, 'No cooling upstairs'),
        ]}
      />,
    );
    const list = screen.getByRole('complementary', { name: /work items/i });
    const rows = within(list).getAllByRole('button').filter((b) => b.hasAttribute('data-wi-row'));
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('No cooling upstairs'),
      expect.stringContaining('Thermostat replaced'),
    ]);
    expect(within(list).getByText('Done · 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'No cooling upstairs' })).toBeInTheDocument();
  });

  it('selecting a row updates the detail and the #WI hash', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling'), wi('wi-2', 2, 'Loud rattle')]} />,
    );
    await user.click(screen.getByText('Loud rattle'));
    expect(screen.getByRole('heading', { level: 2, name: 'Loud rattle' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#WI-02');
  });

  it('deep-links #WI-02 to that item', () => {
    window.history.replaceState(null, '', '/work-orders/wo-1?tab=items#WI-02');
    renderWithProviders(
      <WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling'), wi('wi-2', 2, 'Loud rattle')]} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Loud rattle' })).toBeInTheDocument();
  });

  it('shows the detail full width with no list for a single item', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(screen.queryByRole('complementary', { name: /work items/i })).not.toBeInTheDocument();
    expect(screen.getByText(/1 work item on this work order/i)).toBeInTheDocument();
  });

  it('offers Schedule dispatch on an unscheduled item and seeds it with the item', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(<WorkItemsTab {...baseProps} {...h} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(screen.getByText(/not scheduled yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /schedule dispatch/i }));
    expect(h.onScheduleDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }));
  });

  it('counts an unscoped visit as covering the item, and ignores a no-show', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'No cooling')]}
        dispatches={[
          dispatch('d-1', ['wi-1'], { status: 'NO_SHOW', assignedUserName: 'Ana Ruiz' }),
          dispatch('d-2', [], { arrivalWindowStart: '2026-05-16T14:00:00Z', arrivalWindowEnd: '2026-05-16T16:00:00Z' }),
        ]}
      />,
    );
    expect(screen.getByText(/Daniel Park · Scheduled/)).toBeInTheDocument();
    expect(screen.queryByText(/Ana Ruiz/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not scheduled yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /schedule dispatch/i })).not.toBeInTheDocument();
  });

  it('shows who logged the item and the labor estimate on the meta line', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'No cooling', { createdByName: 'Maria Cruz', laborHoursEstimate: 1.5 })]}
      />,
    );
    expect(screen.getByText(/logged by Maria Cruz · est\. 1\.5 h/)).toBeInTheDocument();
  });

  it('bylines the findings with author, visit and edited', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[
          wi('wi-1', 1, 'No cooling', {
            diagnosis: 'Run capacitor failed',
            diagnosedByName: 'Daniel Park',
            diagnosedAt: '2026-05-14T22:14:00Z',
            diagnosisDispatchId: 'd-1',
            diagnosisEditedAt: '2026-05-15T10:00:00Z',
          }),
        ]}
        dispatches={[dispatch('d-1', ['wi-1'])]}
      />,
    );
    expect(screen.getByText(/^Daniel Park · .+ · Dispatch 1 · edited$/)).toBeInTheDocument();
  });

  it('shows findings recorded before authorship without a byline', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'No cooling', { diagnosis: 'Run capacitor failed' })]}
      />,
    );
    const heading = screen.getByText('Findings');
    expect(screen.getByText('Run capacitor failed')).toBeInTheDocument();
    expect(heading.nextElementSibling?.className).not.toContain('card-sub');
  });

  it('adds a labor estimate inline, snapped to the quarter hour', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: wi('wi-1', 1, 'No cooling') });
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    await user.click(screen.getByRole('button', { name: /labor estimate/i }));
    await user.type(screen.getByRole('spinbutton', { name: /labor hours/i }), '1.6{Enter}');
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1/work-items/wi-1', { laborHoursEstimate: 1.5 }),
    );
    expect(apiClient.patch).toHaveBeenCalledTimes(1);
  });

  it('clears the labor estimate when the hours are emptied', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: wi('wi-1', 1, 'No cooling') });
    renderWithProviders(
      <WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling', { laborHoursEstimate: 2 })]} />,
    );
    await user.click(screen.getByRole('button', { name: '2 h' }));
    await user.clear(screen.getByRole('spinbutton', { name: /labor hours/i }));
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1/work-items/wi-1', { laborHoursEstimate: null }),
    );
  });

  it('reopens a completed item through the server action', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: wi('wi-1', 1, 'No cooling') });
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'No cooling', { statusId: 's-done', statusCategory: 'COMPLETED' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /reopen/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/work-items/wi-1/reopen'));
  });

  it('offers no Reopen on a cancelled item', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'No cooling', { statusId: null, statusCategory: 'CANCELLED' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await screen.findByRole('menuitem', { name: /edit description/i });
    expect(screen.queryByRole('menuitem', { name: /reopen/i })).not.toBeInTheDocument();
  });

  it('lets delete through when a whole-job visit finished before the item was logged', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...h}
        workItems={[wi('wi-1', 1, 'Found on site', { createdAt: '2026-05-14T18:00:00Z' })]}
        dispatches={[dispatch('d-1', [], { status: 'COMPLETED', arrivedAt: '2026-05-14T14:00:00Z' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete work item/i }));
    expect(h.onDelete).toHaveBeenCalled();
  });

  it('refuses delete when a whole-job visit arrived after the item was logged', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...h}
        workItems={[wi('wi-1', 1, 'No cooling', { createdAt: '2026-05-14T10:00:00Z' })]}
        dispatches={[dispatch('d-1', [], { status: 'COMPLETED', arrivedAt: '2026-05-14T14:00:00Z' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete work item/i }));
    expect(await screen.findByText(/already worked this work item/i)).toBeInTheDocument();
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it("shows the item's edit history from audit", async () => {
    audit = [
      {
        id: 'a-1',
        userName: 'Maria Cruz',
        userEmail: 'maria@example.com',
        userRole: 'CSR',
        action: 'UPDATE',
        timestamp: '2026-05-14T15:00:00Z',
        changes: [{ field: 'description', label: 'Description', oldValue: 'No cool', newValue: 'No cooling', sensitive: false }],
      },
    ];
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(await screen.findByRole('region', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText('Maria Cruz')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/audit/WorkItem/wi-1', expect.anything());
  });

  it('shows the item on its quote and invoice, with the Approved step', async () => {
    docs = [
      { workItemId: 'wi-1', documentType: 'QUOTE', documentId: 'q-1', number: 'Q-1903', status: 'ACCEPTED', amount: 420, declined: false },
      { workItemId: 'wi-1', documentType: 'INVOICE', documentId: 'i-1', number: 'INV-3302', status: 'PAID', amount: 420, declined: false },
      { workItemId: 'wi-2', documentType: 'QUOTE', documentId: 'q-2', number: 'Q-1999', status: 'SENT', amount: 99, declined: false },
    ];
    renderWithProviders(
      <WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling', { diagnosis: 'x' }), wi('wi-2', 2, 'Other')]} />,
    );
    expect(await screen.findByRole('link', { name: 'Q-1903' })).toHaveAttribute('href', '/quotes/q-1');
    expect(screen.getByText('$420.00 for this item')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INV-3302' })).toHaveAttribute('href', '/invoices/i-1');
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Q-1999')).not.toBeInTheDocument();
  });

  it('holds Quote this work until there is a labor estimate', async () => {
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} customerId="c-1" workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(await screen.findByText(/not on a quote yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quote this work/i })).toBeDisabled();
    expect(screen.getByText(/add a labor estimate first/i)).toBeInTheDocument();
  });

  it('quotes the work: a new draft with the labor line tied to the item', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation(async (url: string) =>
      url === '/financial/quotes' ? { data: { id: 'q-new', version: 0 } } : { data: { id: 'q-new', version: 1 } },
    );
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        customerId="c-1"
        workItems={[wi('wi-1', 1, 'No cooling', { laborHoursEstimate: 1.5 })]}
      />,
    );
    const button = await screen.findByRole('button', { name: /quote this work/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-new/lines', {
        version: 0,
        laborRateTypeId: 'rate-reg',
        quantity: 1.5,
        workItemId: 'wi-1',
      }),
    );
    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes', {
      customerId: 'c-1',
      workOrderId: 'wo-1',
      title: 'No cooling',
    });
  });

  it('offers to add to the job\'s draft quote instead of starting another', async () => {
    const user = userEvent.setup();
    woQuotes = [{ id: 'q-draft', quoteNumber: 'Q-1900', status: 'DRAFT', createdAt: '2026-05-14T10:00:00Z' }];
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'q-draft', version: 5 } });
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        customerId="c-1"
        workItems={[wi('wi-1', 1, 'No cooling', { laborHoursEstimate: 2 })]}
      />,
    );
    const button = await screen.findByRole('button', { name: /quote this work/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await user.click(await screen.findByRole('button', { name: 'Add to Q-1900' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-draft/lines', {
        version: 4,
        laborRateTypeId: 'rate-reg',
        quantity: 2,
        workItemId: 'wi-1',
      }),
    );
    expect(apiClient.post).not.toHaveBeenCalledWith('/financial/quotes', expect.anything());
  });

  it('asks for findings on a scheduled item and saves them inline', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...h}
        workItems={[wi('wi-1', 1, 'No cooling')]}
        dispatches={[dispatch('d-1', ['wi-1'])]}
      />,
    );
    expect(screen.getByText(/no findings yet/i)).toBeInTheDocument();
    const [primary] = screen.getAllByRole('button', { name: /add findings/i });
    await user.click(primary);
    await user.type(screen.getByRole('textbox', { name: /findings/i }), 'Run capacitor failed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(h.onSaveDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), 'Run capacitor failed');
  });

  it('shows the dispatch row with tech and time on site, and opens it on click', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...h}
        workItems={[wi('wi-1', 1, 'No cooling', { diagnosis: 'Capacitor' })]}
        dispatches={[
          dispatch('d-1', ['wi-1'], {
            status: 'COMPLETED',
            arrivedAt: '2026-05-14T14:10:00Z',
            departedAt: '2026-05-14T15:51:00Z',
          }),
        ]}
      />,
    );
    const row = screen.getByText(/Daniel Park · 1h 41m on site/).closest('button')!;
    await user.click(row);
    expect(h.onSelectDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'd-1' }));
  });

  it('blocks Parts ready on an open PO for the item and offers Parts arrived', async () => {
    pos = [
      {
        id: 'po-1',
        poNumber: 'PO-2104',
        vendorName: 'Johnstone',
        status: 'ORDERED',
        eta: '2026-05-17',
        workItemId: 'wi-1',
        itemCount: 1,
      } as PurchaseOrderListItem,
      // A whole-job PO on the same WO isn't this item's.
      { id: 'po-2', poNumber: 'PO-2105', vendorName: 'Ferguson', status: 'ORDERED', workItemId: null } as PurchaseOrderListItem,
    ];
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        workItems={[wi('wi-1', 1, 'Blower wobble', { statusId: 's-parts', statusCategory: 'BLOCKED', diagnosis: 'Out of balance' })]}
        dispatches={[dispatch('d-1', ['wi-1'])]}
      />,
    );
    expect(await screen.findByText(/PO-2104 · ETA May 17/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PO-2104' })).toHaveAttribute('href', '/purchase-orders/po-1');
    expect(screen.queryByText('PO-2105')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /parts arrived/i })).toBeInTheDocument();
  });

  it('ties Record field purchase and Order parts to the item', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(screen.getByRole('link', { name: /record field purchase/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?workOrderId=wo-1&workItemId=wi-1&type=field',
    );
    expect(screen.getByRole('link', { name: /order parts/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?workOrderId=wo-1&workItemId=wi-1&type=order',
    );
  });

  it('refuses delete once a completed dispatch worked the item, and explains why', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...h}
        workItems={[wi('wi-1', 1, 'No cooling', { diagnosis: 'x' })]}
        dispatches={[dispatch('d-1', ['wi-1'], { status: 'COMPLETED' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete work item/i }));
    expect(await screen.findByText(/already worked this work item/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark complete instead/i })).toBeInTheDocument();
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it('hands delete to the page when no visit has worked the item', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(<WorkItemsTab {...baseProps} {...h} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete work item/i }));
    expect(h.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }));
  });

  it('shows the attach prompt when equipment is needed but not attached', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    expect(screen.getByText(/not attached\. attaching shows/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /attach equipment/i })).toBeInTheDocument();
  });

  it('hides every edit affordance when read-only', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        {...handlers()}
        readOnly
        workItems={[wi('wi-1', 1, 'No cooling'), wi('wi-2', 2, 'Loud rattle')]}
      />,
    );
    expect(screen.queryByRole('button', { name: /add work item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /schedule dispatch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /attach equipment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add findings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /record field purchase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
  });

  it('adds a work item from the inline composer and selects it', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: wi('wi-3', 3, 'Drain clog') });
    renderWithProviders(<WorkItemsTab {...baseProps} {...handlers()} workItems={[wi('wi-1', 1, 'No cooling')]} />);
    await user.click(screen.getByRole('button', { name: /add work item/i }));
    await user.type(screen.getByRole('textbox', { name: /complaint/i }), 'Drain clog');
    await user.click(screen.getByRole('button', { name: /^add work item$/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/work-items', { description: 'Drain clog' }),
    );
  });
});
