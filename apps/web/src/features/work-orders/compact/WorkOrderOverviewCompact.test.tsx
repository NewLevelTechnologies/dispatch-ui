import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import WorkOrderOverviewCompact from './WorkOrderOverviewCompact';
import { apiClient } from '../../../api/setup';
import type { DispatchBoardRow, Invoice, WorkItemStatus, WorkOrder, WorkOrderFinancialSummary } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const filesPage = (photos = 0) => ({
  content: [],
  counts: { all: photos, photos, videos: 0, documents: 0 },
  totalElements: photos,
  totalPages: 1,
  number: 0,
  size: 50,
  first: true,
  last: true,
});

const workOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-1',
  customerId: 'cust-1',
  serviceLocationId: 'loc-1',
  lifecycleState: 'ACTIVE',
  progressCategory: 'IN_PROGRESS',
  customer: { id: 'cust-1', name: 'Reyes Residence Inc.' },
  workItemCount: 3,
  workItems: [
    {
      id: 'wi-1',
      sequence: 1,
      statusId: null,
      statusCategory: 'IN_PROGRESS',
      description: 'No cooling upstairs',
      diagnosis: 'Run capacitor failed',
      diagnosedByName: 'Ray T.',
      diagnosedAt: '2026-05-14T17:00:00Z',
      equipmentId: 'eq-1',
      equipment: {
        id: 'eq-1',
        name: 'Upstairs condenser',
        make: 'Carrier',
        model: '24ACC6',
        serialNumber: 'SN-111',
        equipmentCategoryName: 'Condenser',
        descendantCount: 2,
        descendants: [
          { id: 'u-1', name: 'Air handler' },
          { id: 'u-2', name: 'Evaporator coil' },
        ],
        noteCount: 0,
      },
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'wi-2',
      sequence: 2,
      statusId: null,
      statusCategory: 'NOT_STARTED',
      description: 'Clear condensate drain',
      equipmentId: null,
      equipment: null,
      equipmentNeeded: false,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'wi-3',
      sequence: 3,
      statusId: null,
      statusCategory: 'COMPLETED',
      description: 'Replace thermostat',
      equipmentId: null,
      equipment: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ],
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
} as unknown as WorkOrder;

const completedVisit = {
  id: 'd-1',
  workOrderId: 'wo-1',
  assignedUserId: 'u-1',
  assignedUserName: 'Ray Torres',
  arrivalWindowStart: '2026-05-14T15:00:00Z',
  arrivalWindowEnd: '2026-05-14T17:00:00Z',
  status: 'COMPLETED',
  arrivedAt: '2026-05-14T16:00:00Z',
  departedAt: '2026-05-14T17:30:00Z',
  addressedWorkItemIds: [],
} as unknown as DispatchBoardRow;

const scheduledVisit = {
  ...completedVisit,
  id: 'd-2',
  assignedUserName: 'Dana Park',
  arrivalWindowStart: '2026-05-20T15:00:00Z',
  arrivalWindowEnd: '2026-05-20T17:00:00Z',
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
} as unknown as DispatchBoardRow;

const zeroSummary: WorkOrderFinancialSummary = {
  quotedAccepted: '0.00',
  quotedAwaiting: '0.00',
  inDraft: '0.00',
  invoiced: '0.00',
  paid: '0.00',
  balance: '0.00',
  currency: 'USD',
};

const invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-3302',
  status: 'SENT',
  totalAmount: 400,
  amountPaid: 0,
  balanceDue: 400,
  lineItems: [],
} as unknown as Invoice;

describe('WorkOrderOverviewCompact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/inventory/purchase-orders') {
        return Promise.resolve({
          data: {
            content: [
              { id: 'po-1', poNumber: 'PO-2104', vendorName: 'Ferguson', status: 'RECEIVED', totalCost: 60, itemCount: 1, workItemId: 'wi-1', workOrderId: 'wo-1', type: 'ORDER', vendorId: null, createdAt: 'x' },
            ],
            totalElements: 1,
          },
        });
      }
      if (url === '/work-orders/wo-1/files') return Promise.resolve({ data: filesPage() });
      if (url === '/equipment/eq-1/files') return Promise.resolve({ data: filesPage() });
      if (url === '/work-orders') {
        // The equipment's jobs: this one + one earlier.
        return Promise.resolve({
          data: {
            content: [
              { id: 'wo-1', workOrderNumber: 'WO-1', createdAt: '2026-05-01T00:00:00Z' },
              { id: 'wo-0', workOrderNumber: 'WO-0', summary: 'Annual tune-up', createdAt: '2025-06-01T00:00:00Z' },
            ],
            totalElements: 2,
          },
        });
      }
      if (url === '/scheduling/dispatches/d-2') {
        return Promise.resolve({
          data: {
            ...scheduledVisit,
            label: 'Repair',
            lifecycle: { scheduled: '2026-05-15T12:00:00Z', notified: '2026-05-15T13:05:00Z', enroute: null, arrived: null, departed: null },
          },
        });
      }
      if (url === '/financial/labor-rates') {
        return Promise.resolve({
          data: [{ id: 'r-1', name: 'Regular', role: 'REGULAR', billRate: 120, costRate: 40, sortOrder: 0, active: true }],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const handlers = {
    onOpenTab: vi.fn(),
    onOpenFinancial: vi.fn(),
    onOpenWorkItem: vi.fn(),
    onSelectDispatch: vi.fn(),
    onOpenEquipment: vi.fn(),
    onAttachEquipment: vi.fn(),
    onSetEquipmentNeeded: vi.fn(),
    onSaveDiagnosis: vi.fn().mockResolvedValue(undefined),
    onScheduleDispatch: vi.fn(),
  };

  // The tenant's seeded statuses the primary action targets.
  const status = (id: string, code: string, statusCategory: string, name: string) =>
    ({ id, code, name, statusCategory, isActive: true }) as unknown as WorkItemStatus;
  const statuses = [
    status('st-prog', 'IN_PROGRESS', 'IN_PROGRESS', 'In progress'),
    status('st-parts', 'PENDING_PARTS', 'BLOCKED', 'Pending parts'),
    status('st-arrived', 'PARTS_ARRIVED', 'IN_PROGRESS', 'Parts arrived'),
    status('st-done', 'COMPLETE', 'COMPLETED', 'Complete'),
  ];

  const render = (props: Partial<React.ComponentProps<typeof WorkOrderOverviewCompact>> = {}) =>
    renderWithProviders(
      <WorkOrderOverviewCompact
        workOrder={workOrder}
        statuses={statuses}
        transitions={[]}
        enforceWorkflow={false}
        financialSummary={zeroSummary}
        dispatches={[completedVisit, scheduledVisit]}
        quotes={[]}
        invoices={[]}
        readOnly={false}
        canEditNotes
        canSeeCost={false}
        {...handlers}
        {...props}
      />,
    );

  // First match: an open row's equipment panel repeats the name in its head.
  const rowOf = (text: string) => screen.getAllByText(text)[0].closest('.ovc-item') as HTMLElement;

  it('leads each row with its equipment, the findings with their author, and the open count', async () => {
    render();
    expect(screen.getAllByText('Upstairs condenser').length).toBeGreaterThan(0);
    expect(screen.getByText(/Carrier 24ACC6 · 2 units/)).toBeInTheDocument();
    expect(screen.getByText('Run capacitor failed')).toBeInTheDocument();
    expect(screen.getByText(/— Ray T\./)).toBeInTheDocument();
    expect(screen.getByText('2 open · 3 total')).toBeInTheDocument();
  });

  it('opens an open item on its equipment profile', () => {
    render();
    const row = rowOf('Upstairs condenser');
    expect(within(row).getByRole('button', { name: /^equipment$/i })).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).getByText('System profile')).toBeInTheDocument();
  });

  it('shows each link with something behind it — Parts always; Notes, Photos and Units whenever equipment is attached', async () => {
    render();
    const row = rowOf('Upstairs condenser');
    // History waits on the equipment's job list (1 earlier job).
    expect(await within(row).findByRole('button', { name: /history/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^equipment$/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /units\s*2/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /parts\s*1/i })).toBeInTheDocument();
    // At zero, but there so a note / photo can be added.
    expect(within(row).getByRole('button', { name: /notes\s*0/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /photos\s*0/i })).toBeInTheDocument();

    // No equipment needed: a quiet tile, and Parts is the only link.
    const drain = rowOf('Clear condensate drain');
    const links = drain.querySelector('.ovc-links') as HTMLElement;
    expect(within(links).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Parts0',
      expect.stringMatching(/1/), // trip chip (unscoped completed visit)
      expect.stringMatching(/2/), // trip chip (unscoped scheduled visit)
      'Open →',
    ]);
  });

  it('never lists the equipment as its own unit; with none, Units reads 0 and offers Add unit', async () => {
    const user = userEvent.setup();
    const solo = {
      ...workOrder,
      workItems: [
        { ...workOrder.workItems![0], equipment: { ...workOrder.workItems![0].equipment!, descendantCount: 0, descendants: [] } },
      ],
    } as unknown as WorkOrder;
    render({ workOrder: solo });
    const row = rowOf('Upstairs condenser');
    expect(within(row).queryByText(/· \d+ units?/)).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /units\s*0/i }));
    expect(within(row).getByText('No units yet.')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '+ Add Unit' })).toBeInTheDocument();
  });

  it('hides Units on read-only equipment that has none', () => {
    const solo = {
      ...workOrder,
      workItems: [
        { ...workOrder.workItems![0], equipment: { ...workOrder.workItems![0].equipment!, descendantCount: 0, descendants: [] } },
      ],
    } as unknown as WorkOrder;
    render({ workOrder: solo, readOnly: true });
    expect(within(rowOf('Upstairs condenser')).queryByRole('button', { name: /units/i })).not.toBeInTheDocument();
  });

  it('adds a unit under the equipment: kind + serial required', async () => {
    const user = userEvent.setup();
    const base = vi.mocked(apiClient.get).getMockImplementation()!;
    vi.mocked(apiClient.get).mockImplementation((url: string, ...rest) => {
      if (url === '/equipment/eq-1') return Promise.resolve({ data: { id: 'eq-1', name: 'Upstairs condenser', equipmentTypeId: 'type-hvac' } });
      if (url === '/equipment/config/categories') {
        return Promise.resolve({ data: [{ id: 'cat-ah', equipmentTypeId: 'type-hvac', name: 'Air handler' }] });
      }
      return base(url, ...rest);
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'u-new' } });
    render({ workOrder: { ...workOrder, serviceLocationId: 'loc-1' } as WorkOrder });
    const row = rowOf('Upstairs condenser');
    await user.click(within(row).getByRole('button', { name: /units\s*2/i }));
    await user.click(within(row).getByRole('button', { name: '+ Add Unit' }));

    const add = within(row).getByRole('button', { name: 'Add Unit' });
    expect(add).toBeDisabled();
    await user.selectOptions(await within(row).findByRole('combobox', { name: 'Unit type' }), 'cat-ah');
    expect(add).toBeDisabled(); // still needs a serial
    await user.type(within(row).getByRole('textbox', { name: 'Serial' }), 'AH-778');
    await user.click(add);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/equipment',
      expect.objectContaining({
        name: 'Air handler',
        parentId: 'eq-1',
        equipmentCategoryId: 'cat-ah',
        equipmentTypeId: 'type-hvac',
        serialNumber: 'AH-778',
        serviceLocationId: 'loc-1',
      }),
    );
  });

  it('adds an equipment note tagged with this job', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'n-1' } });
    render();
    const row = rowOf('Upstairs condenser');
    await user.click(within(row).getByRole('button', { name: /notes\s*0/i }));
    expect(await within(row).findByText(/no notes on this equipment yet/i)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Add Note' }));
    await user.type(within(row).getByRole('textbox', { name: 'Note' }), 'Pad is sinking');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/notes', { body: 'Pad is sinking', workOrderId: 'wo-1' });
  });

  it('keeps finished items in full under a Done label, with the attach tile when equipment is still needed', () => {
    render();
    expect(screen.getByText('Done · 1')).toBeInTheDocument();
    expect(screen.getByText('Replace thermostat')).toBeInTheDocument();
    expect(within(rowOf('Replace thermostat')).getByRole('button', { name: /attach equipment/i })).toBeInTheDocument();
  });

  it('offers no attach tile or Change link when read-only', () => {
    render({ readOnly: true });
    expect(within(rowOf('Replace thermostat')).queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('opens the equipment picker under the row header from the tile or Change', async () => {
    const user = userEvent.setup();
    render();
    const done = rowOf('Replace thermostat');
    await user.click(within(done).getByRole('button', { name: /attach equipment/i }));
    expect(done.querySelector('.ovc-panel')).toBeNull();
    expect(within(done).getByRole('button', { name: /attach equipment/i })).toHaveAttribute('aria-expanded', 'true');

    const row = rowOf('Upstairs condenser');
    const change = within(row).getByRole('button', { name: 'Change' });
    await user.click(change);
    expect(change).toHaveAttribute('aria-expanded', 'true');
    // It already has findings, so swapping warns first.
    expect(within(row).getByText(/findings move to this item only/i)).toBeInTheDocument();
  });

  it('expands a panel in place and collapses it from the same link', async () => {
    const user = userEvent.setup();
    render();
    const row = rowOf('Upstairs condenser');
    const units = within(row).getByRole('button', { name: /units\s*2/i });
    await user.click(units);
    expect(units).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).getByText('Air handler')).toBeInTheDocument();
    expect(within(row).getByText('Evaporator coil')).toBeInTheDocument();
    // The equipment itself isn't repeated as one of its units.
    const panel = row.querySelector('.ovc-panel') as HTMLElement;
    expect(within(panel).getAllByRole('button').map((b) => b.textContent)).not.toContain('Upstairs condenser');
    await user.click(units);
    expect(within(row).queryByText('Air handler')).not.toBeInTheDocument();
  });

  it('opens the item on the Work items tab from "Open →"', async () => {
    const user = userEvent.setup();
    render();
    await user.click(within(rowOf('Upstairs condenser')).getByRole('button', { name: 'Open →' }));
    expect(handlers.onOpenWorkItem).toHaveBeenCalledWith('wi-1');
  });

  it('makes the next scheduled visit the Dispatch hero, with lifecycle stamps and the other visit below', async () => {
    render();
    expect(screen.getByText('Dana Park')).toBeInTheDocument();
    // Label from the by-id read; stamps fill as they happen, "—" until then.
    expect(await screen.findByText(/Dispatch 2 of 2 · Repair/)).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
    // The completed visit's actual time on site.
    expect(screen.getByText(/Ray Torres · 1h 30m on site/)).toBeInTheDocument();
  });

  it('says to schedule from the board when there are no visits — no schedule button', () => {
    render({ dispatches: [] });
    expect(screen.getByText(/not scheduled yet · schedule from the dispatch board/i)).toBeInTheDocument();
    // The rail itself offers no scheduling (rows may, for their own item).
    const rail = screen.getByText(/not scheduled yet/i).closest('.card') as HTMLElement;
    expect(within(rail).queryByRole('button', { name: /schedule/i })).not.toBeInTheDocument();
  });

  it('opens Money on Invoices when there are any, and hides Cost without cost visibility', () => {
    render({ invoices: [invoice] });
    expect(screen.getByRole('tab', { name: /invoices/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('INV-3302')).toBeInTheDocument();
    expect(screen.getByText('$400.00 due')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /cost/i })).not.toBeInTheDocument();
  });

  it('shows job cost and margin to cost-visible users', async () => {
    const user = userEvent.setup();
    render({ invoices: [invoice], canSeeCost: true });
    await user.click(screen.getByRole('tab', { name: /cost/i }));
    // 1.5 h × $40 = $60 labor + $60 received parts = $120 direct on $400 invoiced → 70%.
    expect(await screen.findAllByText('$60.00')).toHaveLength(2); // labor, parts used
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(screen.getByText('70%')).toHaveClass('text-success-500');
  });

  it('shows attention chips only when something needs attention', () => {
    const { unmount } = render();
    expect(document.querySelector('.ovc-attn')).toBeNull();
    unmount();
    render({ financialSummary: { ...zeroSummary, balance: '150.00' } });
    expect(screen.getByRole('button', { name: /balance due · \$150\.00/i })).toBeInTheDocument();
  });

  // ── Working items in place ─────────────────────────────────────────
  it('offers the one next step: Add findings, else Mark complete; Schedule when nothing covers it', async () => {
    const user = userEvent.setup();
    render();
    // Scheduled, no findings → Add findings opens the composer in the row.
    const drain = rowOf('Clear condensate drain');
    expect(within(drain).getByText(/No findings yet/)).toBeInTheDocument();
    await user.click(within(drain).getAllByRole('button', { name: 'Add findings' })[0]);
    await user.type(within(drain).getByRole('textbox', { name: 'Findings' }), 'Trap clogged');
    await user.click(within(drain).getByRole('button', { name: 'Save' }));
    expect(handlers.onSaveDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-2' }), 'Trap clogged');

    // Findings + a visit → Mark complete.
    expect(within(rowOf('Upstairs condenser')).getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
  });

  it('schedules with the item preselected when no visit covers it', async () => {
    const user = userEvent.setup();
    render({ dispatches: [] });
    await user.click(within(rowOf('Clear condensate drain')).getByRole('button', { name: 'Schedule dispatch' }));
    expect(handlers.onScheduleDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-2' }));
  });

  it('offers Parts arrived while an item waits on parts', () => {
    const waiting = {
      ...workOrder,
      workItems: [{ ...workOrder.workItems![1], statusId: 'st-parts', statusCategory: 'BLOCKED' }],
    } as unknown as WorkOrder;
    render({ workOrder: waiting });
    expect(screen.getByRole('button', { name: 'Parts arrived' })).toBeInTheDocument();
  });

  it('edits existing findings in place, marked edited once changed', async () => {
    const user = userEvent.setup();
    const edited = {
      ...workOrder,
      workItems: [{ ...workOrder.workItems![0], diagnosisEditedAt: '2026-05-15T00:00:00Z' }],
    } as unknown as WorkOrder;
    render({ workOrder: edited });
    const row = rowOf('Upstairs condenser');
    expect(within(row).getByText(/· edited/)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(within(row).getByRole('textbox', { name: 'Findings' })).toHaveValue('Run capacitor failed');
  });

  it('renders nothing writable when read-only', () => {
    render({ readOnly: true });
    expect(
      screen.queryByRole('button', { name: /^(mark complete|add findings|schedule dispatch|parts arrived)$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No findings yet/)).not.toBeInTheDocument();
  });

  it('lists every visit in a drawer from "All →", grouped, and swaps to the trip drawer on pick', async () => {
    const user = userEvent.setup();
    const live = { ...scheduledVisit, id: 'd-3', status: 'EN_ROUTE', assignedUserName: 'Lee Ng' } as DispatchBoardRow;
    render({ dispatches: [completedVisit, scheduledVisit, live] });
    await user.click(screen.getByRole('button', { name: 'All →' }));
    const drawer = await screen.findByRole('dialog');
    const groups = within(drawer).getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups).toEqual(['Happening now', 'Upcoming', 'Completed']);
    await user.click(within(drawer).getByRole('button', { name: /Ray Torres/ }));
    expect(handlers.onSelectDispatch).toHaveBeenCalledWith(completedVisit);
  });
});
