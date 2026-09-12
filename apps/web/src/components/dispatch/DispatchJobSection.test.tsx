import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import DispatchJobSection from './DispatchJobSection';

const mockGetWorkOrder = vi.fn();
const mockGetFinancial = vi.fn();
const mockListForWorkOrder = vi.fn();
const mockListForLocation = vi.fn();
const mockListNotes = vi.fn();
const mockGetUsers = vi.fn();
const mockGetDivisions = vi.fn();

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    workOrderApi: { ...actual.workOrderApi, getById: (...a: unknown[]) => mockGetWorkOrder(...a) },
    financialSummaryApi: { getByWorkOrder: (...a: unknown[]) => mockGetFinancial(...a) },
    dispatchesApi: {
      ...actual.dispatchesApi,
      listForWorkOrder: (...a: unknown[]) => mockListForWorkOrder(...a),
      listForServiceLocation: (...a: unknown[]) => mockListForLocation(...a),
    },
    notesApi: { ...actual.notesApi, list: (...a: unknown[]) => mockListNotes(...a) },
    userApi: { ...actual.userApi, getAll: (...a: unknown[]) => mockGetUsers(...a) },
    divisionsApi: { ...actual.divisionsApi, getAll: (...a: unknown[]) => mockGetDivisions(...a) },
  };
});

vi.mock('@dispatch/api/src/client');

const workOrder = (over: Record<string, unknown> = {}) => ({
  id: 'wo1',
  workOrderNumber: 'WO-3857',
  summary: 'No cooling — RTU 2',
  lifecycleState: 'ACTIVE',
  progressCategory: 'IN_PROGRESS',
  priority: 'NORMAL',
  divisionId: 'div-1',
  workItemCount: 1,
  workItems: [],
  customer: { id: 'c1', name: 'Reyes Residence', phone: '5205550173' },
  serviceLocation: { id: 'l1', address: { streetAddress: '1284 W PALM LN', city: 'PHOENIX', state: 'AZ', zipCode: '85007' } },
  createdAt: '2026-03-10T13:41:00Z',
  updatedAt: '2026-03-10T13:41:00Z',
  ...over,
});

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  workOrderId: 'wo1',
  assignedUserId: 'u1',
  arrivalWindowStart: '2026-03-15T17:00:00Z',
  arrivalWindowEnd: '2026-03-15T19:00:00Z',
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-03-10T13:41:00Z',
  updatedAt: '2026-03-10T13:41:00Z',
  ...over,
});

const render = (over: Record<string, unknown> = {}) =>
  renderWithProviders(
    <DispatchJobSection
      workOrderId="wo1"
      workOrderNumber="WO-3857"
      href="/work-orders/wo1?from=dispatch"
      serviceLocationId="l1"
      currentDispatchId="d1"
      currentWindowStart="2026-03-15T17:00:00Z"
      {...over}
    />,
  );

const page = (total: number) => ({
  content: [],
  page: 0,
  size: 1,
  totalElements: total,
  totalPages: total,
  first: true,
  last: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkOrder.mockResolvedValue(workOrder());
  mockGetFinancial.mockResolvedValue({ invoiced: '0.00', paid: '0.00', balance: '0.00', currency: 'USD' });
  mockListForWorkOrder.mockResolvedValue([visit()]);
  mockListForLocation.mockResolvedValue(page(0));
  mockListNotes.mockResolvedValue([]);
  mockGetUsers.mockResolvedValue([
    { id: 'u1', firstName: 'Jordan', lastName: 'Wei' },
    { id: 'u2', firstName: 'Maya', lastName: 'Alvarez' },
  ]);
  mockGetDivisions.mockResolvedValue([{ id: 'div-1', name: 'HVAC' }]);
});

describe('DispatchJobSection', () => {
  it('names the job, the customer and the division, and links out', async () => {
    render();

    expect(await screen.findByText('No cooling — RTU 2')).toBeInTheDocument();
    expect(screen.getByText('Reyes Residence · HVAC')).toBeInTheDocument();
    // Through the shared formatter: the app's language is `en_US`, which is
    // not a valid BCP 47 tag and throws if handed to Intl directly.
    // Matched loosely because the shared formatter drops the year inside the
    // current one — the point is that it formatted at all.
    expect(screen.getByText(/Mar 10/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open WO-3857/ })).toHaveAttribute(
      'href',
      '/work-orders/wo1?from=dispatch',
    );
  });

  it('falls back to the first work item when the summary has not been derived', async () => {
    mockGetWorkOrder.mockResolvedValue(
      workOrder({ summary: null, workItems: [{ id: 'wi1', description: 'Secondary complaint' }] }),
    );
    render();
    expect(await screen.findByText('Secondary complaint')).toBeInTheDocument();
  });

  // BLOCKED is the state a dispatcher has to act on — it is what the mock
  // called "awaiting parts", and it is the one progress value that must not
  // read like every other.
  it('tones a blocked job as a warning', async () => {
    mockGetWorkOrder.mockResolvedValue(workOrder({ progressCategory: 'BLOCKED' }));
    render();
    expect(await screen.findByText('Blocked')).toHaveClass('pill', 'warning');
  });

  it('shows an outstanding balance, and does not call it past due', async () => {
    mockGetFinancial.mockResolvedValue({
      invoiced: '1240.00',
      paid: '0.00',
      balance: '1240.00',
      currency: 'USD',
    });
    render();
    expect(await screen.findByText('$1,240.00 outstanding')).toBeInTheDocument();
  });

  // The summary read returns zeroes for a work order with no invoices, so a
  // chip at zero would claim money is owed on every job.
  it('shows no balance chip when nothing is outstanding', async () => {
    render();
    await screen.findByText('No cooling — RTU 2');
    expect(screen.queryByText(/outstanding/)).not.toBeInTheDocument();
  });

  it('reaches the contact as a real tel: link', async () => {
    render();
    expect(await screen.findByRole('link', { name: '(520) 555-0173' })).toHaveAttribute(
      'href',
      'tel:5205550173',
    );
  });

  // "Have we been here before?" — counted strictly before this visit's window,
  // so the visit on screen can never inflate its own history.
  it('counts prior visits at the site before this window only', async () => {
    mockListForLocation.mockResolvedValue(page(3));
    render();

    expect(await screen.findByText('3 at this site · 12 mo')).toBeInTheDocument();
    expect(mockListForLocation).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ to: '2026-03-15T17:00:00Z', size: 1 }),
    );
  });

  it('omits prior visits when this is the first', async () => {
    render();
    await screen.findByText('No cooling — RTU 2');
    expect(screen.queryByText(/at this site/)).not.toBeInTheDocument();
  });

  // The reason the list exists: a second visit, often with a different tech.
  it('lists the other visits on the job and names their techs', async () => {
    mockListForWorkOrder.mockResolvedValue([
      visit({ label: 'Diagnosis' }),
      visit({ id: 'd2', label: 'Repair', assignedUserId: 'u2' }),
    ]);
    render();

    expect(await screen.findByText('Repair')).toBeInTheDocument();
    expect(screen.getByText('Maya Alvarez')).toBeInTheDocument();
    expect(screen.getByText('Jordan Wei · this visit')).toBeInTheDocument();
  });

  it('does not list a single visit back at the dispatcher', async () => {
    render();
    await screen.findByText('No cooling — RTU 2');
    expect(screen.queryByText(/All dispatches/i)).not.toBeInTheDocument();
  });

  it('drops a cancelled visit from the list rather than counting it', async () => {
    mockListForWorkOrder.mockResolvedValue([
      visit({ label: 'Diagnosis' }),
      visit({ id: 'd2', label: 'Repair', status: 'CANCELLED' }),
    ]);
    render();
    await screen.findByText('No cooling — RTU 2');
    expect(screen.queryByText('Repair')).not.toBeInTheDocument();
  });

  // Pinned-first is the server's order, and the pinned note is the one that
  // carries the gate code.
  it('shows the first note and says how many more there are', async () => {
    mockListNotes.mockResolvedValue([
      { id: 'n1', body: 'Gate code 4417.', pinned: true },
      { id: 'n2', body: 'Older note', pinned: false },
    ]);
    render();

    expect(await screen.findByText('Gate code 4417.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 more note/ })).toBeInTheDocument();
  });

  it('renders no note block when the job has none', async () => {
    render();
    await screen.findByText('No cooling — RTU 2');
    expect(screen.queryByText(/note/i)).not.toBeInTheDocument();
  });
});
