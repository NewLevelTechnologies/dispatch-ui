import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useBoardMutations } from './useBoardMutations';
import type { BoardDispatch, UnscheduledWorkOrder } from '../../api/setup';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReleaseOne = vi.fn();

vi.mock('@dispatch/api/src/schedulingApi', () => ({
  dispatchesApi: {
    create: (...a: unknown[]) => mockCreate(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
    release: (...a: unknown[]) => mockReleaseOne(...a),
  },
}));
vi.mock('@dispatch/api/src/client');

const mockShowUndo = vi.fn();
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return {
    ...actual,
    showUndo: (...a: unknown[]) => mockShowUndo(...a),
    showError: (...a: unknown[]) => mockShowError(...a),
    showSuccess: (...a: unknown[]) => mockShowSuccess(...a),
  };
});

const DATE = '2026-03-15';
// Deliberately NOT the runner's zone: windows are tenant-local, and building
// them from the browser's clock is the bug these assertions exist to catch.
const TZ = 'America/Phoenix';

const workOrder: UnscheduledWorkOrder = {
  workOrderId: 'wo-1',
  workOrderNumber: 'WO-3911',
  workOrderSummary: 'No cooling',
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
  createdAt: '2026-03-15T09:00:00Z',
};

function dispatch(over: Partial<BoardDispatch> = {}): BoardDispatch {
  return {
    id: 'd-1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T15:00:00Z',
    arrivalWindowEnd: '2026-03-15T17:00:00Z',
    estimatedDuration: null,
    releasedAt: null,
    version: 7,
    assignedUserId: 'u-1',
    assignedUserName: 'Maya Alvarez',
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-3841',
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
  };
}

const WINDOW = { startHour: 10, endHour: 12 };

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useBoardMutations(DATE, TZ), { wrapper });
  return { result, queryClient };
}

/** Seed both board caches so optimistic patches have something to patch. */
function seedCaches(queryClient: QueryClient, dispatches: BoardDispatch[] = []) {
  queryClient.setQueryData(['dispatch-board', DATE, undefined], {
    date: DATE,
    timeZone: 'UTC',
    techs: [],
    dispatches,
    dispatchesMissingCoordinates: 0,
  });
  queryClient.setQueryData(['dispatch-board', 'unscheduled', undefined], {
    content: [workOrder],
    page: 0,
    size: 50,
    totalElements: 1,
    totalPages: 1,
    first: true,
    last: true,
  });
}

const board = (qc: QueryClient) =>
  qc.getQueryData(['dispatch-board', DATE, undefined]) as { dispatches: BoardDispatch[] };
const rail = (qc: QueryClient) =>
  qc.getQueryData(['dispatch-board', 'unscheduled', undefined]) as {
    content: UnscheduledWorkOrder[];
  };

const assignInput = {
  workOrder,
  techId: 'u-2',
  techName: 'Kenji Tran',
  windowLabel: '10a–12p',
  window: WINDOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'd-new', version: 1 });
  mockUpdate.mockResolvedValue({ id: 'd-1', version: 8 });
  mockDelete.mockResolvedValue(undefined);
  mockReleaseOne.mockResolvedValue({ id: 'd-1', releasedAt: '2026-03-15T07:00:00Z' });
});

describe('assign', () => {
  it('creates the dispatch UNRELEASED — staging is not notifying', async () => {
    const { result } = setup();
    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        workOrderId: 'wo-1',
        assignedUserId: 'u-2',
        notifyAssignedUser: false,
      }),
    );
  });

  // The drop has to land where the pointer let go, not spring back until the
  // server answers.
  it('moves the card out of the rail and onto the grid immediately', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient);
    mockCreate.mockReturnValue(new Promise(() => {})); // never settles

    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(board(queryClient).dispatches).toHaveLength(1));
    expect(rail(queryClient).content).toHaveLength(0);
    // Provisional, and honest about it: on deck, like the real one will be.
    expect(board(queryClient).dispatches[0].releasedAt).toBeNull();
  });

  it('puts the card back when the create fails', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient);
    mockCreate.mockRejectedValue(new Error('nope'));

    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(rail(queryClient).content).toHaveLength(1);
    expect(board(queryClient).dispatches).toHaveLength(0);
  });

  // The inverse of a create is a delete — not a second write that "puts it
  // back", which would leave an orphan.
  it('undoes by deleting what it created', async () => {
    const { result } = setup();
    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    await act(async () => mockShowUndo.mock.calls[0][2]());
    expect(mockDelete).toHaveBeenCalledWith('d-new');
  });

  it('says so when undo itself fails rather than leaving a lie on screen', async () => {
    const { result } = setup();
    mockDelete.mockRejectedValue(new Error('gone'));
    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    await act(async () => mockShowUndo.mock.calls[0][2]());
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
  });
});

describe('move', () => {
  const moveInput = {
    dispatch: dispatch(),
    techId: 'u-2',
    techName: 'Kenji Tran',
    windowLabel: '10a–12p',
    window: WINDOW,
  };

  it('sends the version it read, so a stale board is caught', async () => {
    const { result } = setup();
    act(() => result.current.move.mutate(moveInput));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ version: 7 }));
  });

  it('moves the block before the server answers', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch()]);
    mockUpdate.mockReturnValue(new Promise(() => {}));

    act(() => result.current.move.mutate(moveInput));

    await waitFor(() => expect(board(queryClient).dispatches[0].assignedUserId).toBe('u-2'));
  });

  it('puts the block back when the move fails', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch()]);
    mockUpdate.mockRejectedValue(new Error('nope'));

    act(() => result.current.move.mutate(moveInput));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(board(queryClient).dispatches[0].assignedUserId).toBe('u-1');
  });

  // Our own write bumped the version, so replaying the one we opened with
  // would conflict with ourselves.
  it('undoes with the version the SERVER returned, not the one it opened with', async () => {
    const { result } = setup();
    act(() => result.current.move.mutate(moveInput));

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    await act(async () => mockShowUndo.mock.calls[0][2]());

    const undoBody = mockUpdate.mock.calls[1][1];
    expect(undoBody.version).toBe(8);
    expect(undoBody.assignedUserId).toBe('u-1');
    expect(undoBody.arrivalWindowStart).toBe('2026-03-15T15:00:00Z');
  });

  it('names a version conflict rather than reporting a generic failure', async () => {
    const { result } = setup();
    mockUpdate.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        response: { status: 409, data: { code: 'DISPATCH_VERSION_CONFLICT' } },
      }),
    );

    act(() => result.current.move.mutate(moveInput));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(mockShowError.mock.calls[0][0]).toMatch(/Someone else changed this/);
  });
});

describe('unschedule', () => {
  // Nobody was told, so there's nothing to explain and nothing worth keeping.
  it('deletes an unreleased dispatch', async () => {
    const { result } = setup();
    act(() => result.current.unschedule.mutate(dispatch({ releasedAt: null })));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('d-1'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // The technician has an SMS about this job — deleting it would leave them
  // holding a notification for a visit that exists nowhere.
  it('cancels a released one instead of deleting it', async () => {
    const { result } = setup();
    act(() =>
      result.current.unschedule.mutate(dispatch({ releasedAt: '2026-03-15T07:00:00Z' })),
    );

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ status: 'CANCELLED', version: 7 }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('offers undo for a cancel, which is reversible', async () => {
    const { result } = setup();
    act(() =>
      result.current.unschedule.mutate(dispatch({ releasedAt: '2026-03-15T07:00:00Z' })),
    );

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    await act(async () => mockShowUndo.mock.calls[0][2]());
    expect(mockUpdate.mock.calls[1][1]).toEqual(
      expect.objectContaining({ status: 'SCHEDULED' }),
    );
  });

  // A delete can't be undone and doesn't pretend to.
  it('offers no undo for a delete', async () => {
    const { result } = setup();
    act(() => result.current.unschedule.mutate(dispatch({ releasedAt: null })));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(mockShowUndo).not.toHaveBeenCalled();
  });

  it('removes the block immediately and restores it on failure', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch()]);
    mockDelete.mockRejectedValue(new Error('nope'));

    act(() => result.current.unschedule.mutate(dispatch()));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(board(queryClient).dispatches).toHaveLength(1);
  });
});

describe('release', () => {
  // Release is the one board write whose whole point is a change of
  // appearance, so the hatch clears on the click rather than on the round-trip.
  it('clears the hatch optimistically', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch({ id: 'd-1', releasedAt: null })]);

    act(() => result.current.release.mutate(dispatch({ id: 'd-1', releasedAt: null })));

    await waitFor(() => expect(board(queryClient).dispatches[0].releasedAt).not.toBeNull());
    expect(mockReleaseOne).toHaveBeenCalledWith('d-1');
  });

  // Releasing texts the technician and there is no un-send, so this write —
  // alone among the board's — offers no Undo it couldn't honour.
  it('offers no undo', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch({ id: 'd-1', releasedAt: null })]);

    act(() => result.current.release.mutate(dispatch({ id: 'd-1', releasedAt: null })));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(mockShowUndo).not.toHaveBeenCalled();
  });

  it('puts the hatch back when the release fails', async () => {
    mockReleaseOne.mockRejectedValue(new Error('nope'));
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch({ id: 'd-1', releasedAt: null })]);

    act(() => result.current.release.mutate(dispatch({ id: 'd-1', releasedAt: null })));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(board(queryClient).dispatches[0].releasedAt).toBeNull();
  });
});

// The board reads its day back in the TENANT's zone. If a write builds the
// instant from the browser's clock instead, the two halves agree only when
// those zones happen to match — and a window dragged to "8–10a" from a UTC
// browser lands at 1am for a Phoenix tenant, on the previous day's board.
//
// These assertions are absolute instants, so they hold whatever zone the test
// runner is in — and fail on any runner that is not in Phoenix if the
// conversion goes back to browser-local.
describe('tenant timezone', () => {
  it('writes an assigned window in the tenant’s zone', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient);

    act(() => result.current.assign.mutate(assignInput));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    // 10am Phoenix is 17:00Z, year round.
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      arrivalWindowStart: '2026-03-15T17:00:00.000Z',
      arrivalWindowEnd: '2026-03-15T19:00:00.000Z',
    });
  });

  it('writes a moved window in the tenant’s zone', async () => {
    const { result, queryClient } = setup();
    seedCaches(queryClient, [dispatch({ id: 'd-1' })]);

    act(() =>
      result.current.move.mutate({
        dispatch: dispatch({ id: 'd-1' }),
        techId: 'u-2',
        techName: 'Kenji Tran',
        windowLabel: '10a–12p',
        window: WINDOW,
      }),
    );

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({
      arrivalWindowStart: '2026-03-15T17:00:00.000Z',
    });
  });
});
