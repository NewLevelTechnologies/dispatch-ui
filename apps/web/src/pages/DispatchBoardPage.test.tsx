import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchBoardPage from './DispatchBoardPage';

const mockGetBoard = vi.fn();
const mockGetUnscheduled = vi.fn();
const mockGetWeek = vi.fn();
const mockRegionsGetAll = vi.fn();
const mockRelease = vi.fn();
const mockReleaseOne = vi.fn();
const mockDeleteDispatch = vi.fn();
const mockGetWorkOrder = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    dispatchBoardApi: {
      ...actual.dispatchBoardApi,
      getBoard: (...a: unknown[]) => mockGetBoard(...a),
      getUnscheduled: (...a: unknown[]) => mockGetUnscheduled(...a),
      getWeek: (...a: unknown[]) => mockGetWeek(...a),
      release: (...a: unknown[]) => mockRelease(...a),
    },
    dispatchRegionApi: {
      ...actual.dispatchRegionApi,
      getAll: (...a: unknown[]) => mockRegionsGetAll(...a),
    },
    dispatchesApi: {
      ...actual.dispatchesApi,
      release: (...a: unknown[]) => mockReleaseOne(...a),
      delete: (...a: unknown[]) => mockDeleteDispatch(...a),
    },
    workOrderApi: {
      ...actual.workOrderApi,
      getById: (...a: unknown[]) => mockGetWorkOrder(...a),
    },
  };
});

vi.mock('@dispatch/api/src/client');

// Toasts render through the <Toaster> in App.tsx, which isn't in this
// harness — so assert the call, which is the intent anyway.
vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return {
    ...actual,
    showSuccess: (...a: unknown[]) => mockShowSuccess(...a),
    showError: (...a: unknown[]) => mockShowError(...a),
  };
});

const tech = (id: string, name: string, regionIds: string[]) => ({
  id,
  name,
  regionIds,
  primaryRegionId: regionIds[0] ?? null,
  stopCount: 0,
});

const railWorkOrder = (over: Record<string, unknown> = {}) => ({
  workOrderId: 'wo-1',
  workOrderNumber: 'WO-3911',
  workOrderSummary: 'No cooling — full system',
  workOrderTypeId: null,
  customerId: 'c1',
  customerName: 'Pham, A.',
  serviceLocationId: 'l1',
  serviceLocationCity: 'Phoenix',
  serviceLocationState: 'AZ',
  latitude: null,
  longitude: null,
  priority: 'NORMAL',
  itemCount: 1,
  recurring: false,
  dispatchRegionId: 'r1',
  divisionId: null,
  createdAt: new Date(Date.now() - 41 * 60_000).toISOString(),
  ...over,
});

const railWith = (rows: Record<string, unknown>[]) => ({
  ...emptyRail,
  content: rows,
  totalElements: rows.length,
  totalPages: 1,
});

const emptyRail = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
};

describe('DispatchBoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBoard.mockResolvedValue({ techs: [], dispatches: [] });
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockRegionsGetAll.mockResolvedValue([]);
  });

  // The sidebar item and the page heading share one i18n key, so they render
  // the same string and cannot drift apart. Assert both by role rather than by
  // text — a bare text query matches both, which is the point.
  it('titles the page from the glossary and matches the nav label', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(
      await screen.findByRole('heading', { name: 'Dispatch Board', level: 1 })
    ).toBeInTheDocument();

    const navLink = screen.getByRole('link', { name: 'Dispatch Board' });
    expect(navLink).toHaveAttribute('href', '/dispatch');
  });

  // The structural empty state: no rows at all, which is different from
  // "nothing is scheduled today". It names the rule rather than diagnosing,
  // because the client can't tell a tenant with no field staff from a cache
  // that hasn't synced.
  it('shows the no-technicians state when the board has no rows', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText('No technicians on this board')).toBeInTheDocument();
    expect(
      screen.getByText(/A user appears here when one of their roles is marked/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review roles' })).toBeInTheDocument();
  });

  // Rows ARE the board: they're the drop targets and they say who's free.
  // An empty state here would hide both and leave nowhere to drop work.
  it('renders the rows, with a note, when nothing is scheduled', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText('Maya Alvarez')).toBeInTheDocument();
    expect(screen.getByText(/are scheduled for this day/)).toBeInTheDocument();
    expect(screen.queryByText('No technicians on this board')).not.toBeInTheDocument();
  });

  it('distinguishes a filtered board from an unscheduled one, keeping the rows', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?region=r1' });

    expect(await screen.findByText('No dispatches match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    // The lanes survive the filter.
    expect(screen.getByText('Maya Alvarez')).toBeInTheDocument();
  });

  it('surfaces a failed board read without blanking the rail', async () => {
    mockGetBoard.mockRejectedValue(new Error('boom'));

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText("Couldn't load the board")).toBeInTheDocument();
    // The rail is a separate read and must still render its own state.
    expect(screen.getByText('Unscheduled')).toBeInTheDocument();
    expect(screen.getByText('Nothing unscheduled')).toBeInTheDocument();
  });

  // Self-hide (§3.1): the control keys off regions actually COVERED by the
  // board's techs, not the tenant's region registry — so a one-region shop
  // never sees it.
  it('hides the region filter when only one region is covered', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Maya Alvarez');
    expect(screen.queryByRole('button', { name: 'Region' })).not.toBeInTheDocument();
  });

  it('shows the region filter once a second region is covered', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1']), tech('u2', 'Kenji Tran', ['r2'])],
      dispatches: [],
    });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Maya Alvarez');
    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
  });

  // Coverage, not primary: a tech whose PRIMARY is Phoenix but who also
  // covers Tucson makes this a two-region board for filtering purposes.
  it('counts covered regions, not just primaries', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'Phoenix' },
      { id: 'r2', name: 'Tucson' },
    ]);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1', 'r2'])],
      dispatches: [],
    });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('Maya Alvarez');
    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
  });

  it('scopes the board read to the region in the URL', async () => {
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?region=r2' });

    await screen.findByText('No dispatches match these filters');
    expect(mockGetBoard).toHaveBeenCalledWith(
      expect.objectContaining({ regionIds: ['r2'] })
    );
  });

  it('reads the date from the URL and steps it a day at a time', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-15' });

    await screen.findByText('No technicians on this board');
    expect(mockGetBoard).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-03-15' }));

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-03-16' })
    );

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-03-14' })
    );
  });

  // Month/DST boundaries: local-midnight arithmetic drifts here, UTC parts
  // math does not.
  it('steps across a month boundary without drifting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-01' });

    await screen.findByText('No technicians on this board');
    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(mockGetBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: '2026-02-28' })
    );
  });

  it('ignores a malformed date param rather than querying garbage', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=not-a-date' });

    await screen.findByText('No technicians on this board');
    expect(mockGetBoard).toHaveBeenCalledWith(
      expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    );
  });
});

// The rail's whole job is to be the work-order picker: a count with no cards
// is the bug this suite exists to prevent.
describe('DispatchBoardPage unscheduled rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });
    mockRegionsGetAll.mockResolvedValue([{ id: 'r1', name: 'Phoenix' }]);
    mockGetUnscheduled.mockResolvedValue(emptyRail);
  });

  it('renders a card per work order, not just a count', async () => {
    mockGetUnscheduled.mockResolvedValue(
      railWith([
        railWorkOrder(),
        railWorkOrder({
          workOrderId: 'wo-2',
          workOrderNumber: 'WO-3912',
          workOrderSummary: 'Capacitor / contactor',
          customerName: 'Eastlake HOA',
        }),
      ])
    );

    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    expect(await screen.findByText('WO-3911')).toBeInTheDocument();
    expect(screen.getByText('WO-3912')).toBeInTheDocument();
    expect(screen.getByText('No cooling — full system')).toBeInTheDocument();
    expect(screen.getByText('Pham, A.')).toBeInTheDocument();
  });

  it('shows the age, which is the rail\u2019s tiebreak after priority', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText('41m')).toBeInTheDocument();
  });

  it('flags an urgent card', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder({ priority: 'URGENT' })]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText('Urgent')).toBeInTheDocument();
  });

  it('joins the region id to a name client-side', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText('Phoenix')).toBeInTheDocument();
  });

  // "1 item" on every card is noise; the count only matters when it implies
  // more than one visit might be needed.
  it('names the item count only above one', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder({ itemCount: 1 })]));
    const { unmount } = renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    await screen.findByText('WO-3911');
    expect(screen.queryByText(/item/)).not.toBeInTheDocument();
    unmount();

    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder({ itemCount: 3 })]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText('3 items')).toBeInTheDocument();
  });

  it('falls back to the number when the summary has not synced', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder({ workOrderSummary: null })]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    // Once as the identifier, once as the title — never a blank card.
    expect(await screen.findAllByText('WO-3911')).toHaveLength(2);
  });

  // A coloured bar on every card — info-blue for the routine majority —
  // flattens the one distinction that has to be instant.
  it('draws the priority bar only when priority means something', async () => {
    mockGetUnscheduled.mockResolvedValue(
      railWith([
        railWorkOrder(),
        railWorkOrder({ workOrderId: 'wo-2', workOrderNumber: 'WO-3912', priority: 'URGENT' }),
        railWorkOrder({ workOrderId: 'wo-3', workOrderNumber: 'WO-3913', priority: 'HIGH' }),
      ]),
    );
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('WO-3911');
    const cards = Array.from(document.querySelectorAll('.db-wo'));
    expect(cards[0].className).toBe('db-wo');
    expect(cards[1]).toHaveClass('urgent');
    expect(cards[2]).toHaveClass('high');
  });

  // City, not street address: an address only routes for someone holding a
  // mental map of the metro, and it answers "where is the job" rather than
  // "who is already going near it".
  it('shows the city on the card', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText(/Phoenix/)).toBeInTheDocument();
  });

  // Tenant region names frequently ARE city names, and "Phoenix · Phoenix"
  // burns a slot to say one word twice.
  it('drops the region when it only repeats the city', async () => {
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await screen.findByText('WO-3911');
    expect(screen.queryByText(/Phoenix · Phoenix/)).not.toBeInTheDocument();
  });

  it('shows the region when it adds a word', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'East Valley' },
      { id: 'r2', name: 'North' },
    ]);
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText(/Phoenix · East Valley/)).toBeInTheDocument();
  });

  // Printing one region on all eleven cards of an already-filtered board is
  // noise — the board scope already said it.
  it('drops the region entirely when the board is scoped to one', async () => {
    mockRegionsGetAll.mockResolvedValue([
      { id: 'r1', name: 'East Valley' },
      { id: 'r2', name: 'North' },
    ]);
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?region=r1' });

    await screen.findByText('WO-3911');
    expect(screen.queryByText(/East Valley/)).not.toBeInTheDocument();
  });

  it('keeps the empty message when there is genuinely nothing waiting', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByText('Nothing unscheduled')).toBeInTheDocument();
  });
});

// "Stage the morning, release at 7am" — the reason on-deck is first-class,
// and the one thing the board could render but not act on.
describe('DispatchBoardPage release', () => {
  const held = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T08:00:00Z',
    arrivalWindowEnd: '2026-03-15T10:00:00Z',
    estimatedDuration: null,
    releasedAt: null,
    version: 1,
    assignedUserId: 'u1',
    assignedUserName: 'Maya Alvarez',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'No cooling',
    customerId: 'c1',
    customerName: 'Pham, A.',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l1',
    serviceLocationCity: null,
    serviceLocationState: null,
    latitude: null,
    longitude: null,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockRelease.mockResolvedValue({ released: 2 });
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [held(), held({ id: 'd2' })],
    });
  });

  it('offers the action only when something is unreleased', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByRole('button', { name: 'Release 2' })).toBeInTheDocument();
  });

  it('hides the action when everything is released', async () => {
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [held({ releasedAt: '2026-03-15T07:00:00Z' })],
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    await screen.findByText('Maya Alvarez');
    expect(screen.queryByRole('button', { name: /^Release/ })).not.toBeInTheDocument();
  });

  // Texting N technicians can't be un-sent, so unlike the drag operations
  // this one asks before acting.
  it('confirms before texting anyone, and does nothing on cancel', async () => {
    const u = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await u.click(await screen.findByRole('button', { name: 'Release 2' }));
    expect(await screen.findByText('Release 2 dispatches?')).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRelease).not.toHaveBeenCalled();
  });

  // Scope, not an id list — the server recomputes the unreleased set, so this
  // can't reach outside the caller's regions or act on a stale board.
  it('sends the date and scope, never a list of ids', async () => {
    const u = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?date=2026-03-15&region=r1',
    });

    await u.click(await screen.findByRole('button', { name: 'Release 2' }));
    await u.click(screen.getByRole('button', { name: 'Release' }));

    expect(mockRelease).toHaveBeenCalledWith({ date: '2026-03-15', regionIds: ['r1'] });
  });

  it('reports the count the SERVER released, not the one on screen', async () => {
    const u = userEvent.setup();
    // The server recomputes, so its answer can differ from a stale board.
    mockRelease.mockResolvedValue({ released: 5 });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await u.click(await screen.findByRole('button', { name: 'Release 2' }));
    await u.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('5 dispatches released'));
  });

  it('surfaces a failure instead of pretending it worked', async () => {
    const u = userEvent.setup();
    mockRelease.mockRejectedValue(new Error('nope'));
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await u.click(await screen.findByRole('button', { name: 'Release 2' }));
    await u.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith("Couldn't release", expect.anything())
    );
  });
});

// A dispatch is a VISIT; the work order is the job — and "what is actually
// happening with this job" is a question the board gets constantly, usually
// with a customer on the phone. So the job is one action away from every place
// a dispatch appears, and always as a real link.
describe('DispatchBoardPage reaching the work order', () => {
  const scheduled = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T08:00:00Z',
    arrivalWindowEnd: '2026-03-15T10:00:00Z',
    estimatedDuration: null,
    releasedAt: null,
    version: 1,
    assignedUserId: 'u1',
    assignedUserName: 'Maya Alvarez',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'No cooling',
    customerId: 'c1',
    customerName: 'Pham, A.',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l1',
    serviceLocationCity: null,
    serviceLocationState: null,
    latitude: null,
    longitude: null,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  });

  const block = () => screen.findByRole('link', { name: /No cooling/ });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(railWith([railWorkOrder()]));
    mockReleaseOne.mockResolvedValue({});
    mockDeleteDispatch.mockResolvedValue(undefined);
    mockGetWorkOrder.mockResolvedValue({ id: 'wo-1', workItems: [] });
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [scheduled()],
    });
  });

  // Smart back carries the board's own query, so the dispatcher returns to the
  // day and scope they were working rather than a reset board.
  it('links a block to its work order and carries the board back', async () => {
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?date=2026-03-15&region=r1',
    });
    expect(await block()).toHaveAttribute(
      'href',
      '/work-orders/wo1?from=dispatch&back=date%3D2026-03-15%26region%3Dr1',
    );
  });

  it('links the rail card number to the work order', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    expect(await screen.findByRole('link', { name: 'WO-3911' })).toHaveAttribute(
      'href',
      '/work-orders/wo-1?from=dispatch',
    );
  });

  // The card body still schedules — the number is the only part that navigates.
  it('keeps the rail card itself opening the composer, from the keyboard too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    const card = (await screen.findByText('No cooling — full system')).closest(
      '[role="button"]',
    ) as HTMLElement;
    card.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(mockGetWorkOrder).toHaveBeenCalledWith('wo-1'));
  });

  it('opens the work order first in the right-click menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });

    const items = await screen.findAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Open Work Order');
    expect(items[0]).toHaveAttribute('href', '/work-orders/wo1?from=dispatch');
  });

  it('releases just that visit from the menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });
    await user.click(await screen.findByRole('menuitem', { name: /Release to/ }));

    await waitFor(() => expect(mockReleaseOne).toHaveBeenCalledWith('d1'));
    // Never the bulk endpoint: that one takes a scope and would release the
    // whole day.
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('drops release from the menu once the visit is already released', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [scheduled({ releasedAt: '2026-03-15T07:00:00Z' })],
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: /Release to/ })).not.toBeInTheDocument();
  });

  // A tech already driving has a real-world commitment; retracting it is a
  // cancellation, which is a different verb with different consequences.
  it('drops unschedule from the menu once the tech is en route', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [scheduled({ status: 'EN_ROUTE' })],
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Unschedule' })).not.toBeInTheDocument();
  });

  it('unschedules from the menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });
    await user.click(await screen.findByRole('menuitem', { name: 'Unschedule' }));

    await waitFor(() => expect(mockDeleteDispatch).toHaveBeenCalledWith('d1'));
  });

  it('closes the menu on Escape without acting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.pointer({ keys: '[MouseRight]', target: await block() });
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(mockReleaseOne).not.toHaveBeenCalled();
    expect(mockDeleteDispatch).not.toHaveBeenCalled();
  });
});

// Week is a different GRANULARITY on the same rows — a separate read, because
// seven days of a 60-tech shop is ~2,000 dispatches and the grid renders none
// of them individually.
describe('DispatchBoardPage week', () => {
  const DAYS = [
    '2026-03-16',
    '2026-03-17',
    '2026-03-18',
    '2026-03-19',
    '2026-03-20',
    '2026-03-21',
    '2026-03-22',
  ];

  const weekCell = (date: string, over: Record<string, unknown> = {}) => ({
    date,
    stopCount: 0,
    hasUrgent: false,
    hasUnreleased: false,
    off: false,
    ...over,
  });

  const weekTech = (over: Record<string, unknown> = {}) => ({
    id: 'u1',
    name: 'Maya Alvarez',
    regionIds: ['r1'],
    primaryRegionId: 'r1',
    cells: DAYS.map((d) => weekCell(d)),
    ...over,
  });

  const weekResponse = (over: Record<string, unknown> = {}) => ({
    weekStart: DAYS[0],
    weekEnd: '2026-03-23',
    timeZone: 'America/Phoenix',
    days: DAYS,
    defaultStopsPerDay: 6,
    techs: [weekTech()],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockGetBoard.mockResolvedValue({ techs: [tech('u1', 'Maya Alvarez', ['r1'])], dispatches: [] });
    mockGetWeek.mockResolvedValue(weekResponse());
  });

  // Two reads, and only ever one of them: the day grid and the week grid
  // answer different questions at different volumes.
  it('runs the week read instead of the day read', async () => {
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?view=week&date=2026-03-18',
    });

    await screen.findByText('Mon 16');
    expect(mockGetBoard).not.toHaveBeenCalled();
    expect(mockGetWeek).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: '2026-03-16' }),
    );
  });

  // The backend takes whatever first day it is handed, so the client owns the
  // convention — Monday, with the weekend at the end of the work week.
  it('snaps any day in the week back to its Monday', async () => {
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?view=week&date=2026-03-22',
    });

    await screen.findByText('Mon 16');
    expect(mockGetWeek).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: '2026-03-16' }),
    );
  });

  it('stays on the day read in day view', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    await screen.findByText('Maya Alvarez');
    expect(mockGetWeek).not.toHaveBeenCalled();
  });

  it('switches granularity from the toggle, and keeps the date', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-18' });

    await screen.findByText('Maya Alvarez');
    await user.click(screen.getByRole('radio', { name: 'Week' }));

    await waitFor(() =>
      expect(mockGetWeek).toHaveBeenCalledWith(
        expect.objectContaining({ weekStart: '2026-03-16' }),
      ),
    );
  });

  // The week's job is to route you to the right day.
  it('opens a day’s board when its cell is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?view=week&date=2026-03-18',
    });

    await screen.findByText('Mon 16');
    await user.click(screen.getByRole('button', { name: /Maya Alvarez, Wed 18/ }));

    await waitFor(() =>
      expect(mockGetBoard).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-03-18' }),
      ),
    );
  });

  // Every chip is a predicate over individual dispatches, and release takes a
  // single day's scope — neither can act on an aggregate.
  it('drops the exception chips and the release action in week view', async () => {
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [],
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?view=week' });

    await screen.findByText('Mon 16');
    expect(screen.queryByRole('button', { name: /Urgent/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Release/ })).not.toBeInTheDocument();
  });

  it('steps a week at a time', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, {
      initialPath: '/dispatch?view=week&date=2026-03-18',
    });

    await screen.findByText('Mon 16');
    await user.click(screen.getByRole('button', { name: 'Next week' }));

    await waitFor(() =>
      expect(mockGetWeek).toHaveBeenCalledWith(
        expect.objectContaining({ weekStart: '2026-03-23' }),
      ),
    );
  });
});

// The board never said which day it was showing: stepping forward with a
// chevron left the dispatcher guessing.
describe('DispatchBoardPage date label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [],
      timeZone: 'America/Phoenix',
    });
  });

  it('names the day being shown', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-18' });
    expect(await screen.findByText('Wed, Mar 18')).toBeInTheDocument();
  });

  it('says Today rather than the date when it is today', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });
    await screen.findByText('Maya Alvarez');
    // Both the label and the reset button read "Today"; the reset is disabled
    // because there is nowhere to reset to.
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});

// The rail's routing signal: who is ALREADY going to be near this today.
// Computed client-side, site-to-site, over the technicians in scope.
describe('DispatchBoardPage rail proximity', () => {
  const SITE = { latitude: 33.45, longitude: -112.07 };
  const NEAR = { latitude: 33.4645, longitude: -112.07 };

  const booked = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T12:00:00Z',
    arrivalWindowEnd: '2026-03-15T14:00:00Z',
    estimatedDuration: null,
    releasedAt: '2026-03-15T07:00:00Z',
    version: 1,
    assignedUserId: 'u1',
    assignedUserName: 'Jordan Wei',
    workOrderId: 'wo-other',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'Tune-up',
    customerId: 'c2',
    customerName: 'Other',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l2',
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    latitude: NEAR.latitude,
    longitude: NEAR.longitude,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(
      railWith([railWorkOrder({ latitude: SITE.latitude, longitude: SITE.longitude })]),
    );
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Jordan Wei', ['r1'])],
      dispatches: [booked()],
      timeZone: 'UTC',
    });
  });

  it('names who is already going near the site, and when', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-15' });

    expect(await screen.findByText(/Nearest/)).toBeInTheDocument();
    expect(screen.getByText('Jordan W.')).toBeInTheDocument();
    expect(screen.getByText(/1\.0 mi · 12p/)).toBeInTheDocument();
  });

  // Absent, not zero, not a placeholder. Early on a fresh day every card is
  // bare, and that is the honest rendering.
  it('shows no line when nothing is booked yet', async () => {
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Jordan Wei', ['r1'])],
      dispatches: [],
      timeZone: 'UTC',
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-15' });

    await screen.findByText('WO-3911');
    expect(screen.queryByText(/Nearest/)).not.toBeInTheDocument();
  });

  // The signal is honest only once the location cache carries coordinates —
  // ship without the line rather than with a fabricated one.
  it('shows no line when the site never geocoded', async () => {
    mockGetUnscheduled.mockResolvedValue(
      railWith([railWorkOrder({ latitude: null, longitude: null })]),
    );
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?date=2026-03-15' });

    await screen.findByText('WO-3911');
    expect(screen.queryByText(/Nearest/)).not.toBeInTheDocument();
  });

  // The week read carries aggregates, not stops — there is nothing to measure
  // against, so the line self-hides rather than going stale.
  it('shows no line in week view', async () => {
    mockGetWeek.mockResolvedValue({
      weekStart: '2026-03-16',
      weekEnd: '2026-03-23',
      timeZone: 'UTC',
      days: ['2026-03-16'],
      defaultStopsPerDay: 6,
      techs: [],
    });
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?view=week' });

    await screen.findByText('WO-3911');
    expect(screen.queryByText(/Nearest/)).not.toBeInTheDocument();
  });
});

// The open visit lives in the URL for the same reason the date and the region
// do: "look at this one" has to be a link someone can send.
describe('DispatchBoardPage visit deep link', () => {
  const visit = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T08:00:00Z',
    arrivalWindowEnd: '2026-03-15T10:00:00Z',
    estimatedDuration: null,
    releasedAt: null,
    version: 1,
    assignedUserId: 'u1',
    assignedUserName: 'Maya Alvarez',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'No cooling',
    customerId: 'c1',
    customerName: 'Pham, A.',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l1',
    serviceLocationCity: null,
    serviceLocationState: null,
    latitude: null,
    longitude: null,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetUnscheduled.mockResolvedValue(emptyRail);
    mockGetBoard.mockResolvedValue({
      techs: [tech('u1', 'Maya Alvarez', ['r1'])],
      dispatches: [visit()],
    });
  });

  it('opens the drawer straight from the link', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?d=d1' });
    expect(await screen.findByRole('link', { name: 'WO-1' })).toBeInTheDocument();
  });

  it('leaves the drawer shut for a visit that is not on this board', async () => {
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch?d=nope' });
    await screen.findByText('Maya Alvarez');
    expect(screen.queryByRole('link', { name: 'WO-1' })).not.toBeInTheDocument();
  });

  it('puts the visit in the URL when a block is opened', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchBoardPage />, { initialPath: '/dispatch' });

    await user.click(await screen.findByRole('link', { name: /No cooling/ }));
    expect(await screen.findByRole('link', { name: 'WO-1' })).toBeInTheDocument();
  });
});
