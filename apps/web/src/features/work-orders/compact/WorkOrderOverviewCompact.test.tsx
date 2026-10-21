import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import WorkOrderOverviewCompact from './WorkOrderOverviewCompact';
import { apiClient } from '../../../api/setup';
import type { DispatchBoardRow, Invoice, WorkOrder, WorkOrderFinancialSummary } from '../../../api/setup';

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
  };

  const render = (props: Partial<React.ComponentProps<typeof WorkOrderOverviewCompact>> = {}) =>
    renderWithProviders(
      <WorkOrderOverviewCompact
        workOrder={workOrder}
        statuses={[]}
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
    expect(screen.getByText(/Carrier 24ACC6 · system of 3/)).toBeInTheDocument();
    expect(screen.getByText('Run capacitor failed')).toBeInTheDocument();
    expect(screen.getByText(/— Ray T\./)).toBeInTheDocument();
    expect(screen.getByText('2 open · 3 total')).toBeInTheDocument();
  });

  it('shows only links with something behind them — Parts always', async () => {
    render();
    const row = rowOf('Upstairs condenser');
    // History waits on the equipment's job list (1 earlier job).
    expect(await within(row).findByRole('button', { name: /history/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^equipment$/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /units\s*3/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /parts\s*1/i })).toBeInTheDocument();
    // No notes and no photos on file → no links.
    expect(within(row).queryByRole('button', { name: /notes/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /photos/i })).not.toBeInTheDocument();

    // No equipment needed: a quiet tile, and Parts is the only link.
    const drain = rowOf('Clear condensate drain');
    expect(within(drain).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Parts0',
      expect.stringMatching(/1/), // trip chip (unscoped completed visit)
      expect.stringMatching(/2/), // trip chip (unscoped scheduled visit)
      'Open →',
    ]);
  });

  it('opens an open item on its equipment profile', () => {
    render();
    const row = rowOf('Upstairs condenser');
    expect(within(row).getByRole('button', { name: /^equipment$/i })).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).getByText('System profile')).toBeInTheDocument();
  });

  it('expands a panel in place and collapses it from the same link', async () => {
    const user = userEvent.setup();
    render();
    const row = rowOf('Upstairs condenser');
    const units = within(row).getByRole('button', { name: /units\s*3/i });
    await user.click(units);
    expect(units).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).getByText('Air handler')).toBeInTheDocument();
    expect(within(row).getByText('Evaporator coil')).toBeInTheDocument();
    await user.click(units);
    expect(within(row).queryByText('Air handler')).not.toBeInTheDocument();
  });

  it('opens the item on the Work items tab from "Open →"', async () => {
    const user = userEvent.setup();
    render();
    await user.click(within(rowOf('Upstairs condenser')).getByRole('button', { name: 'Open →' }));
    expect(handlers.onOpenWorkItem).toHaveBeenCalledWith('wi-1');
  });

  it('keeps finished items behind the Done bar, with the attach tile when equipment is still needed', async () => {
    const user = userEvent.setup();
    render();
    expect(screen.queryByText('Replace thermostat')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /done · 1/i }));
    expect(screen.getByText('Replace thermostat')).toBeInTheDocument();
    expect(within(rowOf('Replace thermostat')).getByRole('button', { name: /attach equipment/i })).toBeInTheDocument();
  });

  it('offers no attach tile when read-only', async () => {
    const user = userEvent.setup();
    render({ readOnly: true });
    await user.click(screen.getByRole('button', { name: /done · 1/i }));
    expect(within(rowOf('Replace thermostat')).queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /schedule/i })).not.toBeInTheDocument();
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
});
