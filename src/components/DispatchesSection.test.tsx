import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchesSection from './DispatchesSection';
import type { Dispatch, DispatchStatus, User } from '../api';

const mockDispatchesGetAll = vi.fn();
const mockDispatchesUpdate = vi.fn();
const mockDispatchesNotify = vi.fn();
const mockDispatchesDelete = vi.fn();
const mockUserGetAll = vi.fn();

vi.mock('../api/schedulingApi', () => ({
  dispatchesApi: {
    // The component reads the WO-scoped list via listForWorkOrder, which
    // returns a plain array — tests resolve bare arrays, so pass through.
    listForWorkOrder: (...args: unknown[]) => mockDispatchesGetAll(...args),
    update: (...args: unknown[]) => mockDispatchesUpdate(...args),
    notify: (...args: unknown[]) => mockDispatchesNotify(...args),
    delete: (...args: unknown[]) => mockDispatchesDelete(...args),
  },
}));
vi.mock('../api/userApi', () => ({
  userApi: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
  default: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
}));

const mockUser = (id: string, first: string, last: string, enabled = true): User => ({
  id,
  tenantId: 't1',
  cognitoSub: `sub-${id}`,
  email: `${first.toLowerCase()}@example.com`,
  firstName: first,
  lastName: last,
  phoneNumber: null,
  enabled,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const mockDispatch = (overrides: Partial<Dispatch> = {}): Dispatch => ({
  id: 'd1',
  workOrderId: 'wo-1',
  assignedUserId: 'u1',
  arrivalWindowStart: '2099-05-15T14:00:00Z',
  arrivalWindowEnd: '2099-05-15T16:00:00Z',
  estimatedDuration: 90,
  status: 'SCHEDULED' as DispatchStatus,
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-05-09T00:00:00Z',
  updatedAt: '2026-05-09T00:00:00Z',
  ...overrides,
});

describe('DispatchesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([mockUser('u1', 'Jason', 'Smith')]);
  });

  it('renders empty state with assign button when no dispatches', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);
    const onAssign = vi.fn();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={onAssign} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/no technician assigned yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /assign technician/i })
    ).toBeInTheDocument();
  });

  it('hides the assign button in read-only mode', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" readOnly onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/no technician assigned yet/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /assign technician/i })
    ).not.toBeInTheDocument();
  });

  it('invokes onAssign when the assign button is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue([]);
    const onAssign = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={onAssign} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const button = await screen.findByRole('button', {
      name: /assign technician/i,
    });
    await user.click(button);

    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it('renders a populated row with tech name and status', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch()]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('formats a same-day arrival window as a single date with a time range', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        arrivalWindowStart: '2099-05-15T16:00:00Z',
        arrivalWindowEnd: '2099-05-15T18:00:00Z',
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      // "Fri, May 15 · 12:00 PM – 2:00 PM" — exact wall time depends on the
      // runner TZ, so just assert the structure: a date prefix joined to a
      // time range with the en-dash separator.
      expect(screen.getByText(/May 15.*·.*–/)).toBeInTheDocument();
    });
  });

  it('renders notes underneath the tech name when present', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({ notes: 'Customer prefers AM' }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Customer prefers AM')).toBeInTheDocument();
    });
  });

  it('renders an "On site since" timestamp for IN_PROGRESS dispatches', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        status: 'IN_PROGRESS',
        arrivedAt: '2099-05-15T14:05:00Z',
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/on site since/i)).toBeInTheDocument();
    });
  });

  it('falls back to email when tech has no first/last name', async () => {
    mockUserGetAll.mockResolvedValue([
      {
        ...mockUser('u1', '', ''),
        firstName: '',
        lastName: '',
        email: 'fallback@example.com',
      },
    ]);
    mockDispatchesGetAll.mockResolvedValue([mockDispatch()]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('fallback@example.com')).toBeInTheDocument();
    });
  });

  it('renders an em dash when the assigned user is not in the user list', async () => {
    mockUserGetAll.mockResolvedValue([]);
    mockDispatchesGetAll.mockResolvedValue([mockDispatch()]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('advances SCHEDULED → IN_PROGRESS via the Mark arrived menu item', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesUpdate.mockResolvedValue(mockDispatch({ status: 'IN_PROGRESS' }));
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    // Mark arrived moved into the kebab — Notify is the primary inline action
    // for SCHEDULED. Open kebab, click menuitem.
    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);
    const arriveItem = await screen.findByRole('menuitem', {
      name: /mark arrived/i,
    });
    await user.click(arriveItem);

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalledWith('d1', {
        status: 'IN_PROGRESS',
      });
    });
  });

  it('advances IN_PROGRESS → COMPLETED via the Mark completed button', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({ status: 'IN_PROGRESS', arrivedAt: '2099-05-15T14:05:00Z' }),
    ]);
    mockDispatchesUpdate.mockResolvedValue(mockDispatch({ status: 'COMPLETED' }));
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const completeBtn = await screen.findByRole('button', {
      name: /mark completed/i,
    });
    await user.click(completeBtn);

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalledWith('d1', {
        status: 'COMPLETED',
      });
    });
  });

  it('does not show advance buttons for terminal statuses (Past rows)', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        status: 'COMPLETED',
        arrivedAt: '2099-05-15T14:05:00Z',
        departedAt: '2099-05-15T15:30:00Z',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    // Past section is collapsed by default — expand it first.
    const pastTrigger = await screen.findByRole('button', { name: /past \(1\)/i });
    await user.click(pastTrigger);

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /mark arrived/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark completed/i })
    ).not.toBeInTheDocument();
    // Notify also shouldn't render on past rows.
    expect(
      screen.queryByRole('button', { name: /^notify$/i })
    ).not.toBeInTheDocument();
  });

  it('hides primary action button in read-only mode', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" readOnly onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^notify$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark completed/i })
    ).not.toBeInTheDocument();
  });

  it('alerts on advance error and does not throw', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesUpdate.mockRejectedValue(new Error('boom'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);
    const arriveItem = await screen.findByRole('menuitem', {
      name: /mark arrived/i,
    });
    await user.click(arriveItem);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    alertSpy.mockRestore();
  });

  it('sorts active dispatches by window start ascending', async () => {
    mockUserGetAll.mockResolvedValue([
      mockUser('u1', 'Alice', 'A'),
      mockUser('u2', 'Bob', 'B'),
    ]);
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        id: 'd-late',
        assignedUserId: 'u2',
        arrivalWindowStart: '2099-05-16T10:00:00Z',
        arrivalWindowEnd: '2099-05-16T12:00:00Z',
      }),
      mockDispatch({
        id: 'd-early',
        assignedUserId: 'u1',
        arrivalWindowStart: '2099-05-15T08:00:00Z',
        arrivalWindowEnd: '2099-05-15T10:00:00Z',
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Alice A')).toBeInTheDocument();
    });
    // No header row anymore — first data row is rows[0].
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveTextContent('Alice A');
    expect(rows[1]).toHaveTextContent('Bob B');
  });

  it('pins overdue SCHEDULED dispatches above on-track dispatches', async () => {
    mockUserGetAll.mockResolvedValue([
      mockUser('u1', 'Onsite', 'Now'),
      mockUser('u2', 'Overdue', 'Tech'),
    ]);
    mockDispatchesGetAll.mockResolvedValue([
      // On-track future dispatch.
      mockDispatch({
        id: 'd-on-track',
        assignedUserId: 'u1',
        arrivalWindowStart: '2099-06-01T08:00:00Z',
        arrivalWindowEnd: '2099-06-01T10:00:00Z',
        status: 'SCHEDULED',
      }),
      // Overdue dispatch — windowEnd in the past, still SCHEDULED.
      mockDispatch({
        id: 'd-overdue',
        assignedUserId: 'u2',
        arrivalWindowStart: '2020-01-01T08:00:00Z',
        arrivalWindowEnd: '2020-01-01T10:00:00Z',
        status: 'SCHEDULED',
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Overdue Tech')).toBeInTheDocument();
    });
    const rows = screen.getAllByRole('row');
    // Overdue pinned to top regardless of window start ordering.
    expect(rows[0]).toHaveTextContent('Overdue Tech');
    expect(rows[1]).toHaveTextContent('Onsite Now');
  });

  it('marks an overdue dispatch row with an Overdue aria-label on its dot', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        arrivalWindowStart: '2020-01-01T08:00:00Z',
        arrivalWindowEnd: '2020-01-01T10:00:00Z',
        status: 'SCHEDULED',
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    // Dot is a span with aria-label="Overdue" on overdue rows.
    await waitFor(() => {
      expect(screen.getByLabelText(/overdue/i)).toBeInTheDocument();
    });
  });

  it('shows the Notify button on SCHEDULED rows and calls dispatchesApi.notify', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesNotify.mockResolvedValue(undefined);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const notifyBtn = await screen.findByRole('button', { name: /^notify$/i });
    await user.click(notifyBtn);

    await waitFor(() => {
      expect(mockDispatchesNotify).toHaveBeenCalledWith('d1');
    });
    await waitFor(() => {
      expect(screen.getByText('Sent')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^notify$/i })).not.toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('hides the Notify button for non-SCHEDULED dispatches', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({ status: 'IN_PROGRESS', arrivedAt: '2099-05-15T14:05:00Z' }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^notify$/i })).not.toBeInTheDocument();
  });

  it('hides the Notify button in read-only mode', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" readOnly onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^notify$/i })).not.toBeInTheDocument();
  });

  it('alerts when notify fails', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesNotify.mockRejectedValue(new Error('boom'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const notifyBtn = await screen.findByRole('button', { name: /^notify$/i });
    await user.click(notifyBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    alertSpy.mockRestore();
  });

  it('opens the kebab menu and invokes onEdit with the dispatch', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    const onEdit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={onEdit} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    const kebab = screen.getByRole('button', { name: /more options/i });
    await user.click(kebab);

    const editItem = await screen.findByRole('menuitem', { name: /^edit$/i });
    await user.click(editItem);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][0].id).toBe('d1');
  });

  it('confirms before deleting and calls dispatchesApi.delete', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);

    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDispatchesDelete).toHaveBeenCalledWith('d1');
    });
    confirmSpy.mockRestore();
  });

  it('does not delete when the dispatcher cancels the confirm', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);

    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDispatchesDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('alerts when delete fails', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesDelete.mockRejectedValue(new Error('boom'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('shows the kebab on past dispatches once the section is expanded', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        status: 'COMPLETED',
        arrivedAt: '2099-05-15T14:05:00Z',
        departedAt: '2099-05-15T15:30:00Z',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const pastTrigger = await screen.findByRole('button', { name: /past \(1\)/i });
    await user.click(pastTrigger);

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
  });

  it('hides the kebab in read-only mode', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" readOnly onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /more options/i })
    ).not.toBeInTheDocument();
  });

  it('renders a Past (N) trigger when there are completed dispatches', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        id: 'd-active',
        status: 'SCHEDULED',
      }),
      mockDispatch({
        id: 'd-done-1',
        status: 'COMPLETED',
        arrivedAt: '2099-05-14T14:00:00Z',
        departedAt: '2099-05-14T15:30:00Z',
      }),
      mockDispatch({
        id: 'd-done-2',
        status: 'CANCELLED',
        arrivedAt: null,
        departedAt: null,
      }),
    ]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /past \(2\)/i })
      ).toBeInTheDocument();
    });
  });

  it('does not render a Past trigger when all dispatches are active', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /past \(/i })).not.toBeInTheDocument();
  });

  it('formats a completed past row as "On site X–Y (duration)"', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        status: 'COMPLETED',
        arrivedAt: '2099-05-15T14:00:00Z',
        departedAt: '2099-05-15T15:30:00Z',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const pastTrigger = await screen.findByRole('button', { name: /past \(1\)/i });
    await user.click(pastTrigger);

    // "On site 10:00 AM–11:30 AM (1h 30m)" — TZ shifts the wall time, so just
    // assert the structural pattern.
    await waitFor(() => {
      expect(screen.getByText(/on site .*–.*\(1h 30m\)/i)).toBeInTheDocument();
    });
  });

  it('renders a cancelled past row with strikethrough text', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({ status: 'CANCELLED' }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const pastTrigger = await screen.findByRole('button', { name: /past \(1\)/i });
    await user.click(pastTrigger);

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    // The tech name lives inside a div with `line-through` on cancelled rows.
    const techName = screen.getByText('Jason Smith');
    expect(techName.className).toMatch(/line-through/);
  });

  it('sorts past dispatches most-recent-first by departedAt', async () => {
    mockUserGetAll.mockResolvedValue([
      mockUser('u1', 'Older', 'Trip'),
      mockUser('u2', 'Newer', 'Trip'),
    ]);
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        id: 'd-older',
        assignedUserId: 'u1',
        status: 'COMPLETED',
        arrivedAt: '2099-05-10T14:00:00Z',
        departedAt: '2099-05-10T15:00:00Z',
      }),
      mockDispatch({
        id: 'd-newer',
        assignedUserId: 'u2',
        status: 'COMPLETED',
        arrivedAt: '2099-05-15T14:00:00Z',
        departedAt: '2099-05-15T15:00:00Z',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection workOrderId="wo-1" onAssign={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} />
    );

    const pastTrigger = await screen.findByRole('button', { name: /past \(2\)/i });
    await user.click(pastTrigger);

    await waitFor(() => {
      expect(screen.getByText('Older Trip')).toBeInTheDocument();
    });
    const rows = screen.getAllByRole('row');
    // First row is the Past trigger row (it's also a TableRow). Past rows
    // follow it; expand `within` each one to find the tech name.
    const techRows = rows.filter((r) => within(r).queryByText(/trip$/i));
    expect(techRows[0]).toHaveTextContent('Newer Trip');
    expect(techRows[1]).toHaveTextContent('Older Trip');
  });

  it('fires onSelect with the dispatch when the row body is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection
        workOrderId="wo-1"
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onSelect={onSelect}
      />
    );

    const techName = await screen.findByText('Jason Smith');
    await user.click(techName);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('d1');
  });

  it('does not fire onSelect when the kebab is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection
        workOrderId="wo-1"
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onSelect={onSelect}
      />
    );

    const kebab = await screen.findByRole('button', { name: /more options/i });
    await user.click(kebab);

    // Click on kebab opened the menu; onSelect must NOT have fired (the user
    // is acting on the control, not the row).
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not fire onSelect when the Notify button is clicked', async () => {
    mockDispatchesGetAll.mockResolvedValue([mockDispatch({ status: 'SCHEDULED' })]);
    mockDispatchesNotify.mockResolvedValue(undefined);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection
        workOrderId="wo-1"
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onSelect={onSelect}
      />
    );

    const notifyBtn = await screen.findByRole('button', { name: /^notify$/i });
    await user.click(notifyBtn);

    await waitFor(() => {
      expect(mockDispatchesNotify).toHaveBeenCalled();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires onSelect for past dispatches too (row click opens audit drawer)', async () => {
    mockDispatchesGetAll.mockResolvedValue([
      mockDispatch({
        status: 'COMPLETED',
        arrivedAt: '2099-05-15T14:00:00Z',
        departedAt: '2099-05-15T15:30:00Z',
      }),
    ]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <DispatchesSection
        workOrderId="wo-1"
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onSelect={onSelect}
      />
    );

    const pastTrigger = await screen.findByRole('button', { name: /past \(1\)/i });
    await user.click(pastTrigger);
    const techName = await screen.findByText('Jason Smith');
    await user.click(techName);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('d1');
  });
});
