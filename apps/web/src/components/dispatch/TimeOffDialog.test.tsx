import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TimeOffDialog from './TimeOffDialog';
import { allDaySpan } from '../../lib/timeOff';
import type { BoardTech } from '../../api/setup';

const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockShowUndo = vi.fn();
const mockShowError = vi.fn();

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    availabilityApi: {
      list: vi.fn(),
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
    showUndo: (...a: unknown[]) => mockShowUndo(...a),
    showError: (...a: unknown[]) => mockShowError(...a),
  };
});

const tech: BoardTech = {
  id: 'u1',
  name: 'Robert Chen',
  regionIds: ['r1'],
  stopCount: 3,
  committedCount: 3,
  divisionIds: [],
};

// A Wednesday.
const DATE = '2026-03-18';

/** A live visit on the viewed day, in UTC hours. */
const visit = (startHour: number, endHour: number, status = 'SCHEDULED') => ({
  status,
  arrivalWindowStart: `${DATE}T${String(startHour).padStart(2, '0')}:00:00Z`,
  arrivalWindowEnd: `${DATE}T${String(endHour).padStart(2, '0')}:00:00Z`,
});

const render = (over: Record<string, unknown> = {}) =>
  renderWithProviders(
    <TimeOffDialog
      tech={tech}
      date={DATE}
      visits={[]}
      timeZone="UTC"
      onClose={vi.fn()}
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'a1' });
  mockDelete.mockResolvedValue(undefined);
});

describe('allDaySpan', () => {
  it('is half-open: through the 20th ends at midnight on the 21st', () => {
    expect(allDaySpan('2026-03-18', '2026-03-20', 'UTC')).toEqual({
      startsAt: '2026-03-18T00:00:00.000Z',
      endsAt: '2026-03-21T00:00:00.000Z',
    });
  });

  it('lands on the TENANT midnight, not UTC', () => {
    // Phoenix is UTC-7 year-round.
    expect(allDaySpan('2026-03-18', '2026-03-18', 'America/Phoenix')).toEqual({
      startsAt: '2026-03-18T07:00:00.000Z',
      endsAt: '2026-03-19T07:00:00.000Z',
    });
  });
});

describe('TimeOffDialog', () => {
  it('renders nothing without a technician', () => {
    render({ tech: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The 6:40am case: someone called out, they are gone for the day. One click.
  it('marks the viewed day off with the default reason', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render({ onClose });

    await screen.findByText('Mark Robert Chen off');
    expect(screen.getByText('All day, Wed, Mar 18')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark off' }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'u1',
        startsAt: '2026-03-18T00:00:00.000Z',
        endsAt: '2026-03-19T00:00:00.000Z',
        allDay: true,
        status: 'OFF',
        label: 'Time off',
        reason: 'TIME_OFF',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('prints the chosen reason as the row label', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('radio', { name: 'Sick' }));
    await user.click(screen.getByRole('button', { name: 'Mark off' }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Sick', reason: 'SICK' }),
      ),
    );
  });

  // "Out all next week" is ONE row — the whole point of the span shape.
  it('saves a multi-day range as a single span', async () => {
    const user = userEvent.setup();
    render();
    const through = await screen.findByLabelText('Through');
    fireEvent.change(through, { target: { value: '2026-03-20' } });
    expect(screen.getByText('Wed, Mar 18 – Fri, Mar 20')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark off' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      startsAt: '2026-03-18T00:00:00.000Z',
      endsAt: '2026-03-21T00:00:00.000Z',
    });
  });

  it('never lets the range end before the viewed day', async () => {
    render();
    const through = await screen.findByLabelText('Through');
    fireEvent.change(through, { target: { value: '2026-03-10' } });
    expect(through).toHaveValue(DATE);
  });

  // "Dentist 9–11": one row with real instants, the rest of the day bookable.
  it('saves part of the day as a single timed span', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('radio', { name: 'Part of day' }));
    await user.selectOptions(screen.getByLabelText('From'), '9');
    await user.selectOptions(screen.getByLabelText('Until'), '10.5');
    expect(screen.getByText('Wed, Mar 18, 9a–10:30a')).toBeInTheDocument();
    // Single-day: no through-date to widen it with.
    expect(screen.queryByLabelText('Through')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark off' }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'u1',
        startsAt: '2026-03-18T09:00:00.000Z',
        endsAt: '2026-03-18T10:30:00.000Z',
        allDay: false,
        status: 'OFF',
        label: 'Time off',
        reason: 'TIME_OFF',
      }),
    );
  });

  it('never offers an end at or before the start', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('radio', { name: 'Part of day' }));
    await user.selectOptions(screen.getByLabelText('From'), '13');
    const until = screen.getByLabelText('Until') as HTMLSelectElement;
    expect(until.value).toBe('13.5');
    expect(Array.from(until.options).every((o) => Number(o.value) > 13)).toBe(true);
  });

  // "Every afternoon this week" is a recurrence, not a span.
  it('disables part of day, and says why, when the range spans days', async () => {
    render();
    fireEvent.change(await screen.findByLabelText('Through'), { target: { value: '2026-03-20' } });
    expect(screen.getByRole('radio', { name: 'Part of day' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/one day at a time/)).toBeInTheDocument();
  });

  it('counts only the visits a part-day absence overlaps', async () => {
    const user = userEvent.setup();
    render({ visits: [visit(8, 10), visit(10, 12), visit(14, 16)] });
    expect(await screen.findByText(/^3 dispatches stay assigned/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Part of day' }));
    await user.selectOptions(screen.getByLabelText('From'), '9');
    await user.selectOptions(screen.getByLabelText('Until'), '11');
    expect(screen.getByText(/^2 dispatches stay assigned/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('From'), '17');
    await user.selectOptions(screen.getByLabelText('Until'), '18');
    expect(screen.queryByText(/stay assigned/)).not.toBeInTheDocument();
  });

  // Said BEFORE saving: nothing is moved automatically.
  it('warns about live work before saving', async () => {
    render({ visits: [visit(8, 10), visit(10, 12), visit(14, 16), visit(12, 14, 'COMPLETED')] });
    expect(
      await screen.findByText(/3 dispatches stay assigned to Robert — nothing is moved automatically/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Technician is off/)).toBeInTheDocument();
  });

  it('says nothing about work when there is none', async () => {
    render();
    await screen.findByText('Mark Robert Chen off');
    expect(screen.queryByText(/nothing is moved automatically/)).not.toBeInTheDocument();
  });

  it('Undo deletes the span it just created', async () => {
    const user = userEvent.setup();
    render({ visits: [visit(8, 10), visit(14, 16)] });
    await user.click(await screen.findByRole('button', { name: 'Mark off' }));

    await waitFor(() => expect(mockShowUndo).toHaveBeenCalled());
    const [message, , onUndo] = mockShowUndo.mock.calls[0];
    expect(message).toMatch(/Robert Chen marked off · 2 dispatches still assigned/);
    onUndo();
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a1'));
  });

  it('reports a failed save and stays open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockCreate.mockRejectedValueOnce(new Error('nope'));
    render({ onClose });
    await user.click(await screen.findByRole('button', { name: 'Mark off' }));
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
