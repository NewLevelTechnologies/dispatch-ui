import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import WorkOrderOverview from './WorkOrderOverview';
import apiClient from '../../api/client';
import type {
  DispatchBoardRow,
  ServiceLocationDetailDto,
  WorkOrder,
  WorkOrderFinancialSummary,
} from '../../api';

vi.mock('../../api/client');

const workOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-1',
  customerId: 'cust-1',
  serviceLocationId: 'loc-1',
  lifecycleState: 'ACTIVE',
  progressCategory: 'IN_PROGRESS',
  priority: 'HIGH',
  customer: { id: 'cust-1', name: 'Reyes Residence Inc.', phone: '5551230000', email: 'a@b.com' },
  workItemCount: 2,
  workItems: [
    {
      id: 'wi-1',
      statusId: null,
      statusCategory: 'BLOCKED',
      description: 'No cooling — upstairs',
      equipmentId: null,
      equipment: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'wi-2',
      statusId: null,
      statusCategory: 'NOT_STARTED',
      description: 'Thermostat unresponsive',
      equipmentId: null,
      equipment: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ],
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
} as unknown as WorkOrder;

const location: ServiceLocationDetailDto = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Reyes Residence Inc.',
  premiseType: 'RESIDENCE',
  dispatchRegionId: 'r-1',
  locationName: 'Reyes Residence',
  address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' },
  additionalContacts: [],
  siteContactName: 'Tanya Reyes',
  siteContactPhone: '5559876543',
  accessInstructions: 'Side gate, dog in yard',
  arrivalFacts: [
    { id: 'f1', label: 'Gate', value: '4821', mono: true, multiline: false, authorName: null, authorUserId: null, displayOrder: 0, createdAt: 'x', updatedAt: 'x' },
  ],
  notes: [{ id: 'n1', body: 'Two small kids — offer same-day.', pinned: true, authorName: 'Maria', createdAt: 'x', updatedAt: 'x' }],
  status: 'ACTIVE',
  createdAt: 'x',
  updatedAt: 'x',
  version: 1,
};

const liveDispatch: DispatchBoardRow = {
  id: 'd-1',
  workOrderId: 'wo-1',
  assignedUserId: 'u-1',
  arrivalWindowStart: '2026-05-15T19:00:00Z',
  arrivalWindowEnd: '2026-05-15T21:00:00Z',
  estimatedDuration: null,
  status: 'IN_PROGRESS',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: 'x',
  updatedAt: 'x',
  workOrderNumber: 'WO-1',
  workOrderTypeId: null,
  workOrderTypeName: null,
  workOrderSummary: null,
  customerId: 'cust-1',
  customerName: 'Reyes',
  serviceLocationId: 'loc-1',
  serviceLocationCity: null,
  serviceLocationState: null,
  assignedUserName: 'Daniel Park',
};

const summary: WorkOrderFinancialSummary = {
  quoted: '742.67',
  invoiced: '742.67',
  paid: '0.00',
  balance: '150.00',
  currency: 'USD',
};

describe('WorkOrderOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // NotesCard (work-order notes) + ActivityTeaser both read via apiClient.get.
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.match(/\/activity/)) return Promise.resolve({ data: { content: [], nextCursor: null } });
      return Promise.resolve({ data: [] });
    });
  });

  const render = (props: Partial<React.ComponentProps<typeof WorkOrderOverview>> = {}) =>
    renderWithProviders(
      <WorkOrderOverview
        workOrder={workOrder}
        location={location}
        financialSummary={summary}
        dispatches={[liveDispatch]}
        onOpenTab={vi.fn()}
        onAddWorkItem={vi.fn()}
        onOpenFinancial={vi.fn()}
        onSelectDispatch={vi.fn()}
        {...props}
      />
    );

  it('derives the attention strip: live dispatch, blocked item, and balance due', () => {
    render();
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    expect(screen.getByText(/Daniel P\. on site/)).toBeInTheDocument(); // live
    expect(screen.getByText(/balance due/i)).toBeInTheDocument(); // money
    expect(screen.getByText('$150.00')).toBeInTheDocument();
  });

  it('renders the work-items peek and the trip strip with the tech', () => {
    render();
    // "No cooling…" also appears as the blocked-attention sub, so allow both.
    expect(screen.getAllByText('No cooling — upstairs').length).toBeGreaterThan(0);
    expect(screen.getByText('Thermostat unresponsive')).toBeInTheDocument();
    expect(screen.getAllByText(/Daniel P\./).length).toBeGreaterThan(0); // trip strip cell
  });

  it('renders the Location card (address, gate, access, pinned note) and Money card', () => {
    render();
    expect(screen.getByText(/4821 E Indian School Rd/i)).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument(); // gate arrival fact
    expect(screen.getByText(/side gate, dog in yard/i)).toBeInTheDocument();
    expect(screen.getByText(/two small kids/i)).toBeInTheDocument();
    expect(screen.getByText(/bills to/i)).toBeInTheDocument();
    expect(screen.getByText('Reyes Residence Inc.')).toBeInTheDocument();
  });

  it('routes attention + card actions through the callbacks', async () => {
    const onOpenTab = vi.fn();
    const onOpenFinancial = vi.fn();
    const onAddWorkItem = vi.fn();
    const user = userEvent.setup();
    render({ onOpenTab, onOpenFinancial, onAddWorkItem });

    // The money attention row's action label is "View {invoice-plural}".
    await user.click(screen.getByRole('button', { name: /view invoices/i }));
    expect(onOpenFinancial).toHaveBeenCalledWith('invoices');

    // Peek "+ Work item" → onAddWorkItem; a peek row → items tab.
    await user.click(screen.getByRole('button', { name: /\+ work item/i }));
    expect(onAddWorkItem).toHaveBeenCalled();
    await user.click(screen.getByText('Thermostat unresponsive').closest('button')!);
    expect(onOpenTab).toHaveBeenCalledWith('items');

    // The Quoted rollup (quoted > 0) routes to the quotes tab.
    await user.click(screen.getByText('$742.67').closest('button')!);
    expect(onOpenFinancial).toHaveBeenCalledWith('quotes');
  });

  it('drops the live attention row when there are no dispatches', () => {
    render({ dispatches: [] });
    // The live "{tech} on site" attention row is gone (blocked/balance remain).
    expect(screen.queryByText(/Daniel P\. on site/)).not.toBeInTheDocument();
  });
});
