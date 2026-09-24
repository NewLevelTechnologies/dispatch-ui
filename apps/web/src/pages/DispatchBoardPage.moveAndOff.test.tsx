// Moving a visit to another day (§3.6) and marking a technician off (§0b),
// end to end through the page — the two board verbs whose cost depends on
// who has already been told.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchBoardPage from './DispatchBoardPage';

const mockGetBoard = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();
const mockLogs = vi.fn();
const mockAvailList = vi.fn();
const mockAvailCreate = vi.fn();
const mockAvailDelete = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockShowUndo = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    dispatchBoardApi: {
      ...actual.dispatchBoardApi,
      getBoard: (...a: unknown[]) => mockGetBoard(...a),
      getUnscheduled: () =>
        Promise.resolve({
          content: [],
          page: 0,
          size: 50,
          totalElements: 0,
          totalPages: 0,
          first: true,
          last: true,
        }),
    },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: () => Promise.resolve([]) },
    divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([]) },
    dispatchesApi: {
      ...actual.dispatchesApi,
      update: (...a: unknown[]) => mockUpdate(...a),
      notify: (...a: unknown[]) => mockNotify(...a),
    },
    notificationApi: {
      ...actual.notificationApi,
      getNotificationLogs: (...a: unknown[]) => mockLogs(...a),
    },
    availabilityApi: {
      list: (...a: unknown[]) => mockAvailList(...a),
      create: (...a: unknown[]) => mockAvailCreate(...a),
      delete: (...a: unknown[]) => mockAvailDelete(...a),
    },
  };
});

vi.mock('@dispatch/api/src/client');

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return {
    ...actual,
    showSuccess: (...a: unknown[]) => mockShowSuccess(...a),
    showError: (...a: unknown[]) => mockShowError(...a),
    showUndo: (...a: unknown[]) => mockShowUndo(...a),
  };
});

// A Friday — so next business day is Monday and Tomorrow is a Saturday.
const FRIDAY = '2026-03-20';

const tech = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Robert Chen',
  regionIds: ['r1'],
  stopCount: 1,
  committedCount: 1,
  divisionIds: [],
  ...over,
});

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  seq: 1,
  status: 'SCHEDULED',
  arrivalWindowStart: `${FRIDAY}T09:00:00Z`,
  arrivalWindowEnd: `${FRIDAY}T11:00:00Z`,
  estimatedDuration: null,
  releasedAt: null,
  divisionId: null,
  version: 4,
  assignedUserId: 'u1',
  assignedUserName: 'Robert Chen',
  workOrderId: 'wo1',
  workOrderNumber: 'WO-1',
  workOrderTypeId: null,
  workOrderSummary: 'No cooling',
  customerId: 'c1',
  customerName: 'Reyes Residence',
  priority: 'NORMAL',
  recurring: false,
  serviceLocationId: 'l1',
  serviceLocationName: null,
  serviceLocationStreet: null,
  serviceLocationCity: null,
  serviceLocationState: null,
  serviceLocationZip: null,
  latitude: null,
  longitude: null,
  driveMinFromPrev: null,
  arrivedAt: null,
  departedAt: null,
  addressedWorkItemIds: [],
  ...over,
});

const board = (techs: unknown[], dispatches: unknown[]) => ({
  date: FRIDAY,
  timeZone: 'UTC',
  techs,
  dispatches,
  commitments: [],
  techsHiddenByDivisionFilter: 0,
  dispatchesMissingCoordinates: 0,
});

const logsPage = (content: unknown[]) => ({ content, totalElements: content.length });

const renderBoard = () =>
  renderWithProviders(<DispatchBoardPage />, { initialPath: `/dispatch?date=${FRIDAY}` });

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.pointer({
    keys: '[MouseRight]',
    target: await screen.findByRole('link', { name: /No cooling/ }),
  });
  return screen.findByRole('menu');
};

// Pinned: moves can't land in the past, so a fixture date that the real
// calendar has overtaken would silently lose its quick targets. Tuesday the
// 17th, three days before the Friday on the board.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-17T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBoard.mockResolvedValue(board([tech()], [visit()]));
  mockUpdate.mockResolvedValue({ id: 'd1', version: 5 });
  mockNotify.mockResolvedValue(undefined);
  mockLogs.mockResolvedValue(logsPage([]));
  mockAvailCreate.mockResolvedValue({ id: 'new' });
  mockAvailDelete.mockResolvedValue(undefined);
});

describe('Move to another day', () => {
  it('offers next business day first, then a visible-weekend Tomorrow, keeping the window', async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user);

    expect(within(menu).getByText('Move to · keeps 9a–11a')).toBeInTheDocument();
    const next = within(menu).getByRole('menuitem', { name: /Next business day/ });
    const tomorrow = within(menu).getByRole('menuitem', { name: /Tomorrow/ });
    expect(next).toHaveTextContent('Mon, Mar 23');
    expect(tomorrow).toHaveTextContent('Sat, Mar 21');
    expect(within(menu).getByText(/Drag it to the rail instead/)).toBeInTheDocument();
  });

  // Viewing a future day and pulling the visit in — the floor is today, not
  // the day after the one on screen.
  it('lets a date earlier than the viewed day be picked, but not the past', async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /Pick a date/ }));
    const field = within(menu).getByLabelText('Pick a date…');
    expect(field).toHaveAttribute('min', '2026-03-17');

    fireEvent.change(field, { target: { value: '2026-03-16' } });
    expect(within(menu).getByRole('button', { name: 'Move' })).toBeDisabled();

    fireEvent.change(field, { target: { value: '2026-03-18' } });
    await user.click(within(menu).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ arrivalWindowStart: '2026-03-18T09:00:00.000Z' }),
      ),
    );
  });

  it('only moves SCHEDULED work', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue(board([tech()], [visit({ status: 'EN_ROUTE' })]));
    renderBoard();
    const menu = await openMenu(user);
    expect(within(menu).queryByText(/Move to/)).not.toBeInTheDocument();
  });

  // Unreleased: nobody has been told, so it commits like any drag, with Undo.
  it('moves an unreleased visit silently, same window, and Undo puts it back', async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /Next business day/ }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('d1', {
        arrivalWindowStart: '2026-03-23T09:00:00.000Z',
        arrivalWindowEnd: '2026-03-23T11:00:00.000Z',
        version: 4,
      }),
    );
    // Nobody was told, so there is nothing to look up.
    expect(mockLogs).not.toHaveBeenCalled();
    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    const [message, , onUndo] = mockShowUndo.mock.calls[0];
    expect(message).toBe('WO-1 → Mon, Mar 23, 9a–11a');

    onUndo();
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenLastCalledWith('d1', {
        arrivalWindowStart: `${FRIDAY}T09:00:00Z`,
        arrivalWindowEnd: `${FRIDAY}T11:00:00Z`,
        version: 5,
      }),
    );
  });

  it('snaps a window that is no longer a preset', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue(
      board(
        [tech()],
        [visit({ arrivalWindowStart: `${FRIDAY}T09:30:00Z`, arrivalWindowEnd: `${FRIDAY}T11:30:00Z` })],
      ),
    );
    renderBoard();
    const menu = await openMenu(user);
    expect(within(menu).getByText('Move to · keeps 9a–11a')).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: /Tomorrow/ }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ arrivalWindowStart: '2026-03-21T09:00:00.000Z' }),
      ),
    );
  });

  it('names the tech when a released visit moves and the customer was never told', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue(
      board([tech()], [visit({ releasedAt: `${FRIDAY}T07:00:00Z` })]),
    );
    mockLogs.mockResolvedValue(logsPage([{ audience: 'TECH', status: 'DELIVERED', createdAt: `${FRIDAY}T07:01:00Z` }]));
    renderBoard();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /Next business day/ }));

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    expect(mockShowUndo.mock.calls[0][0]).toBe(
      "WO-1 → Mon, Mar 23, 9a–11a · Robert Chen's schedule updated",
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  describe('when the customer was told', () => {
    beforeEach(() => {
      mockGetBoard.mockResolvedValue(
        board([tech()], [visit({ releasedAt: `${FRIDAY}T07:00:00Z` })]),
      );
      mockLogs.mockResolvedValue(logsPage([{ audience: 'CUSTOMER', status: 'SENT', createdAt: `${FRIDAY}T07:03:00Z` }]));
    });

    const moveToMonday = async (user: ReturnType<typeof userEvent.setup>) => {
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: /Next business day/ }));
      return screen.findByRole('dialog', { name: /already knows about/ });
    };

    it('asks first, in the customer’s terms, and writes nothing yet', async () => {
      const user = userEvent.setup();
      renderBoard();
      const dialog = await moveToMonday(user);
      expect(
        within(dialog).getByText(/Reyes Residence was told Fri, Mar 20, 9a–11a/),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox')).toBeChecked();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('keeping the date writes nothing', async () => {
      const user = userEvent.setup();
      renderBoard();
      const dialog = await moveToMonday(user);
      await user.click(within(dialog).getByRole('button', { name: 'Keep Fri, Mar 20' }));
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    // An Undo that can't un-send a text is a lie.
    it('notifies the customer and offers no Undo', async () => {
      const user = userEvent.setup();
      renderBoard();
      const dialog = await moveToMonday(user);
      await user.click(within(dialog).getByRole('button', { name: 'Move to Mon, Mar 23' }));

      await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d1', 'CUSTOMER'));
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Reyes Residence notified · WO-1 → Mon, Mar 23, 9a–11a',
        ),
      );
      expect(mockShowUndo).not.toHaveBeenCalled();
    });

    it('declining to notify is undoable and says the customer was not told', async () => {
      const user = userEvent.setup();
      renderBoard();
      const dialog = await moveToMonday(user);
      await user.click(within(dialog).getByRole('checkbox'));
      expect(within(dialog).getByText(/still expect Fri, Mar 20/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Move to Mon, Mar 23' }));

      await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
      expect(mockShowUndo.mock.calls[0][0]).toBe(
        'WO-1 → Mon, Mar 23, 9a–11a · customer not yet told',
      );
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });
});

// windowChangedAt: a notice only counts for the date it was about.
describe('Move to, after an earlier move nobody was told about', () => {
  beforeEach(() => {
    mockGetBoard.mockResolvedValue(
      board(
        [tech()],
        [visit({ releasedAt: `${FRIDAY}T07:00:00Z`, windowChangedAt: `${FRIDAY}T08:00:00Z` })],
      ),
    );
    mockLogs.mockResolvedValue(
      logsPage([{ audience: 'CUSTOMER', status: 'SENT', sentAt: '2026-03-18T12:00:00Z' }]),
    );
  });

  // They still hold an older promise, so it still asks — but it must not
  // claim they were told the date on the board.
  it('still asks, and says the customer never heard about this date', async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /Next business day/ }));
    const dialog = await screen.findByRole('dialog', { name: /already knows about/ });
    expect(
      within(dialog).getByText(/Reyes Residence hasn't been told about Fri, Mar 20, 9a–11a/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/was told/)).not.toBeInTheDocument();
  });

  it('treats a notice sent after the change as about this date', async () => {
    const user = userEvent.setup();
    mockLogs.mockResolvedValue(
      logsPage([{ audience: 'CUSTOMER', status: 'SENT', sentAt: `${FRIDAY}T08:30:00Z` }]),
    );
    renderBoard();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: /Next business day/ }));
    const dialog = await screen.findByRole('dialog', { name: /already knows about/ });
    expect(within(dialog).getByText(/Reyes Residence was told Fri, Mar 20/)).toBeInTheDocument();
  });
});

describe('Time off from the board', () => {
  const offToday = { startsAt: `${FRIDAY}T00:00:00Z`, endsAt: '2026-03-21T00:00:00Z', allDay: true, label: 'Sick' };

  it('opens Mark time off from the row menu with the live work counted', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(await screen.findByRole('button', { name: 'Actions for Robert Chen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark time off…' }));
    expect(await screen.findByText('Mark Robert Chen off')).toBeInTheDocument();
    expect(screen.getByText(/1 dispatch stay assigned to Robert/)).toBeInTheDocument();
  });

  it('links the row to the user record, carrying the board back', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(await screen.findByRole('button', { name: 'Actions for Robert Chen' }));
    expect(await screen.findByRole('menuitem', { name: 'Open profile' })).toHaveAttribute(
      'href',
      `/settings/access/users/u1?from=dispatch&back=date%3D${FRIDAY}`,
    );
  });

  // Never auto-moved: outlined in place and gathered under its own chip.
  it('flags live work on an off tech and filters to it', async () => {
    const user = userEvent.setup();
    mockGetBoard.mockResolvedValue(
      board(
        [tech({ timeOff: [offToday] }), tech({ id: 'u2', name: 'Maya Alvarez' })],
        [
          visit(),
          visit({ id: 'd2', assignedUserId: 'u2', workOrderSummary: 'Leaking valve' }),
          visit({ id: 'd3', status: 'COMPLETED', workOrderSummary: 'Filter swap' }),
        ],
      ),
    );
    renderBoard();

    const stranded = await screen.findByRole('link', { name: /No cooling/ });
    expect(stranded).toHaveClass('offtech');
    expect(screen.getByRole('link', { name: /Leaking valve/ })).not.toHaveClass('offtech');
    // History isn't stranded work.
    expect(screen.getByRole('link', { name: /Filter swap/ })).not.toHaveClass('offtech');

    const chip = screen.getByRole('button', { name: /Technician is off/ });
    expect(chip).toHaveTextContent('1');
    await user.click(chip);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Leaking valve/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /No cooling/ })).toBeInTheDocument();
  });

  it('clears the row’s time off, and Undo writes it back', async () => {
    const user = userEvent.setup();
    const span = {
      id: 'a1',
      userId: 'u1',
      startsAt: '2026-03-18T00:00:00Z',
      endsAt: '2026-03-23T00:00:00Z',
      allDay: true,
      status: 'OFF',
      label: 'Time off',
      reason: 'TIME_OFF',
      notes: null,
    };
    mockGetBoard.mockResolvedValue(board([tech({ timeOff: [offToday] })], []));
    mockAvailList.mockResolvedValue({ content: [span] });
    renderBoard();

    await user.click(await screen.findByRole('button', { name: 'Actions for Robert Chen' }));
    expect(screen.queryByRole('menuitem', { name: 'Mark time off…' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Clear time off' }));

    await waitFor(() => expect(mockAvailDelete).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    const [message, , onUndo] = mockShowUndo.mock.calls[0];
    // A span is one row — clearing Friday cleared the week, and it says so.
    expect(message).toBe("Robert Chen's time off cleared · Wed, Mar 18 – Sun, Mar 22");

    onUndo();
    await waitFor(() =>
      expect(mockAvailCreate).toHaveBeenCalledWith({
        userId: 'u1',
        startsAt: span.startsAt,
        endsAt: span.endsAt,
        allDay: true,
        status: 'OFF',
        label: 'Time off',
        reason: 'TIME_OFF',
        notes: null,
      }),
    );
  });

  describe('part of the day', () => {
    const dentist = {
      startsAt: `${FRIDAY}T13:00:00Z`,
      endsAt: `${FRIDAY}T15:00:00Z`,
      allDay: false,
      label: 'Sick',
    };

    it('says the absence on the tech cell instead of the regions', async () => {
      mockGetBoard.mockResolvedValue(board([tech({ timeOff: [dentist] })], []));
      renderBoard();
      expect(await screen.findByText('Sick 1p–3p')).toBeInTheDocument();
    });

    // Out 1–3 and leaving at 5 is two spans, so both verbs stay.
    it('offers both Mark and Clear on a partly-off row', async () => {
      const user = userEvent.setup();
      mockGetBoard.mockResolvedValue(board([tech({ timeOff: [dentist] })], []));
      renderBoard();
      await user.click(await screen.findByRole('button', { name: 'Actions for Robert Chen' }));
      expect(await screen.findByRole('menuitem', { name: 'Mark time off…' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Clear time off' })).toBeInTheDocument();
    });

    it('outlines only the visits the absence overlaps', async () => {
      mockGetBoard.mockResolvedValue(
        board(
          [tech({ timeOff: [dentist] })],
          [
            visit(),
            visit({
              id: 'd2',
              workOrderSummary: 'Leaking valve',
              arrivalWindowStart: `${FRIDAY}T14:00:00Z`,
              arrivalWindowEnd: `${FRIDAY}T16:00:00Z`,
            }),
          ],
        ),
      );
      renderBoard();
      expect(await screen.findByRole('link', { name: /Leaking valve/ })).toHaveClass('offtech');
      expect(screen.getByRole('link', { name: /No cooling/ })).not.toHaveClass('offtech');
      expect(screen.getByRole('button', { name: /Technician is off/ })).toHaveTextContent('1');
    });
  });
});

