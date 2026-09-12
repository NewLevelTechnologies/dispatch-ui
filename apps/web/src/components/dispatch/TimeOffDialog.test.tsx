import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TimeOffDialog from './TimeOffDialog';
import type { BoardTech } from '../../api/setup';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    availabilityApi: {
      list: (...a: unknown[]) => mockList(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  };
});

vi.mock('@dispatch/api/src/client');

vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return {
    ...actual,
    showSuccess: (...a: unknown[]) => mockShowSuccess(...a),
    showError: (...a: unknown[]) => mockShowError(...a),
  };
});

const tech: BoardTech = {
  id: 'u1',
  name: 'Robert Chen',
  regionIds: ['r1'],
  primaryRegionId: 'r1',
  stopCount: 3,
};

const DATE = '2026-03-18';

const emptyPage = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
};

const span = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  userId: 'u1',
  startsAt: '2026-03-18T07:00:00Z',
  endsAt: '2026-03-19T07:00:00Z',
  allDay: true,
  status: 'OFF',
  label: 'Vacation',
  reason: null,
  notes: null,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  ...over,
});

const render = (over: Record<string, unknown> = {}) =>
  renderWithProviders(
    <TimeOffDialog
      tech={tech}
      date={DATE}
      bookedVisits={0}
      timeZone="UTC"
      onClose={vi.fn()}
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(emptyPage);
  mockCreate.mockResolvedValue(span());
  mockDelete.mockResolvedValue(undefined);
});

describe('TimeOffDialog', () => {
  it('renders nothing without a technician', () => {
    render({ tech: null });
    expect(screen.queryByText(/Time off/)).not.toBeInTheDocument();
  });

  // The label is required by the server on purpose: a hatched row has to say
  // something rather than being a silent gap in the day.
  it('will not save without a reason', async () => {
    render();
    await screen.findByText(/Time off · Robert Chen/);
    expect(screen.getByRole('button', { name: 'Mark time off' })).toBeDisabled();
  });

  // The 6:40am case: someone called out, they are gone for the day.
  it('marks an all-day absence for the viewed date', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render({ onClose });

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Called out');
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      allDay: true,
      status: 'OFF',
      label: 'Called out',
    });
    expect(onClose).toHaveBeenCalled();
  });

  // "Out all next week" is ONE row — the whole point of the span shape, and
  // the reason the entity was reshaped.
  it('spans several days in a single row', async () => {
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Vacation');
    const through = screen.getByLabelText('Through');
    await user.clear(through);
    await user.type(through, '2026-03-22');
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const { startsAt, endsAt } = mockCreate.mock.calls[0][0];
    // Half-open: through the 22nd means up to the start of the 23rd.
    expect(startsAt.slice(0, 10) <= '2026-03-18').toBe(true);
    expect(new Date(endsAt).getTime()).toBeGreaterThan(new Date('2026-03-22T12:00:00').getTime());
  });

  it('marks a partial day when all-day is switched off', async () => {
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Dentist');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].allDay).toBe(false);
  });

  // The date field and the start-time field both read "From" until they were
  // named apart, which made the partial-day form ambiguous to say out loud.
  it('names the date and the start time apart', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('switch'));

    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('From')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('To')).toHaveAttribute('type', 'time');
  });

  it('refuses a span that ends before it starts', async () => {
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Dentist');
    await user.click(screen.getByRole('switch'));
    const end = screen.getByLabelText('To');
    await user.clear(end);
    await user.type(end, '07:00');

    expect(screen.getByRole('button', { name: 'Mark time off' })).toBeDisabled();
  });

  // Marking someone off never moves their work: the dispatcher has jobs to
  // reassign and nothing else on the board will say so.
  it('says what is still booked on the row', async () => {
    const user = userEvent.setup();
    render({ bookedVisits: 3 });

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Called out');
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(mockShowSuccess.mock.calls[0][0]).toContain('3');
    expect(mockShowSuccess.mock.calls[0][0]).toMatch(/reassign/);
  });

  it('just confirms when the row is empty', async () => {
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Called out');
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(mockShowSuccess.mock.calls[0][0]).not.toMatch(/reassign/);
  });

  // A 6:40am mis-click has to be reversible on the surface that made it.
  it('lists what is already there and clears it by id', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue({ ...emptyPage, content: [span()], totalElements: 1 });
    render();

    expect(await screen.findByText('Vacation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a1'));
  });

  // Sliced straight out of the ISO string, an 8am absence would print as
  // whatever UTC makes of it.
  it('shows a partial span in the tenant’s own hours', async () => {
    mockList.mockResolvedValue({
      ...emptyPage,
      content: [
        span({
          allDay: false,
          startsAt: '2026-03-18T08:00:00Z',
          endsAt: '2026-03-18T12:00:00Z',
          label: 'Dentist',
        }),
      ],
      totalElements: 1,
    });
    render();
    expect(await screen.findByText('8a–12p')).toBeInTheDocument();
  });

  // Only OFF makes someone unavailable; the rest of the enum predates the
  // board and must not show up as an absence.
  it('ignores availability rows that are not absences', async () => {
    mockList.mockResolvedValue({
      ...emptyPage,
      content: [span({ id: 'a2', status: 'BUSY', label: 'Training' })],
      totalElements: 1,
    });
    render();

    await screen.findByText(/Time off · Robert Chen/);
    expect(screen.queryByText('Training')).not.toBeInTheDocument();
  });

  it('surfaces a failure instead of closing on it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockCreate.mockRejectedValue(new Error('nope'));
    render({ onClose });

    await user.type(await screen.findByPlaceholderText('Sick day'), 'Called out');
    await user.click(screen.getByRole('button', { name: 'Mark time off' }));

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
