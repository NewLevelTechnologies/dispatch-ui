import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AssignTechnicianDialog from './AssignTechnicianDialog';
import type { Dispatch, User } from '../api/setup';

const mockDispatchesCreate = vi.fn();
const mockDispatchesUpdate = vi.fn();
const mockUserGetAll = vi.fn();

vi.mock('@dispatch/api/src/schedulingApi', () => ({
  dispatchesApi: {
    create: (...args: unknown[]) => mockDispatchesCreate(...args),
    update: (...args: unknown[]) => mockDispatchesUpdate(...args),
  },
}));
vi.mock('@dispatch/api/src/userApi', () => ({
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

describe('AssignTechnicianDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([
      mockUser('u1', 'Jason', 'Smith'),
      mockUser('u2', 'Maria', 'Lopez'),
      mockUser('u3', 'Disabled', 'User', false),
    ]);
  });

  it('does not render the form when closed', () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={false} onClose={vi.fn()} workOrderId="wo-1" />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the form fields when open', async () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Technician')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrival Window Start')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrival Window End')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Estimated Duration (optional, minutes)')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('only lists enabled users in the technician picker', async () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      // Sorted by lastName asc — Lopez before Smith.
      expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    });
    expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    expect(screen.queryByText('Disabled User')).not.toBeInTheDocument();
  });

  it('seeds window end to two hours after the default start', async () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    const start = (await screen.findByLabelText(
      'Arrival Window Start'
    )) as HTMLInputElement;
    const end = (await screen.findByLabelText(
      'Arrival Window End'
    )) as HTMLInputElement;

    expect(start.value).toBeTruthy();
    expect(end.value).toBeTruthy();
    const startMs = new Date(start.value).getTime();
    const endMs = new Date(end.value).getTime();
    expect(endMs - startMs).toBe(2 * 60 * 60 * 1000);
  });

  it('preserves the window width when the dispatcher changes the start', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    const start = (await screen.findByLabelText(
      'Arrival Window Start'
    )) as HTMLInputElement;
    const end = (await screen.findByLabelText(
      'Arrival Window End'
    )) as HTMLInputElement;
    const initialWidthMs = new Date(end.value).getTime() - new Date(start.value).getTime();

    await user.clear(start);
    await user.type(start, '2026-06-01T09:00');

    // After the user moves start, end should track by the same width.
    const newWidthMs = new Date(end.value).getTime() - new Date(start.value).getTime();
    expect(newWidthMs).toBe(initialWidthMs);
  });

  it('disables submit until a tech is selected', async () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const submit = screen.getByRole('button', { name: /^assign$/i });
    expect(submit).toBeDisabled();
  });

  it('disables submit and surfaces a hint when window end is not after start', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');

    // Force end to equal start — degenerate window. Use clear+type so the
    // change handler fires (datetime-local needs full ISO-ish string).
    const startInput = screen.getByLabelText(
      'Arrival Window Start'
    ) as HTMLInputElement;
    const endInput = screen.getByLabelText(
      'Arrival Window End'
    ) as HTMLInputElement;
    await user.clear(endInput);
    await user.type(endInput, startInput.value);

    expect(
      screen.getByText(/window end must be after window start/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^assign$/i })).toBeDisabled();
  });

  it('submits a create request with the selected tech and window', async () => {
    mockDispatchesCreate.mockResolvedValue({ id: 'd-new' });
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={onClose} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');

    // Set a deterministic window so the assertion doesn't drift across runs.
    const start = screen.getByLabelText('Arrival Window Start');
    const end = screen.getByLabelText('Arrival Window End');
    await user.clear(start);
    await user.type(start, '2026-05-15T08:00');
    await user.clear(end);
    await user.type(end, '2026-05-15T10:00');

    await user.type(screen.getByLabelText('Notes'), 'Bring ladder');

    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() => {
      expect(mockDispatchesCreate).toHaveBeenCalledTimes(1);
    });
    const payload = mockDispatchesCreate.mock.calls[0][0];
    expect(payload.workOrderId).toBe('wo-1');
    expect(payload.assignedUserId).toBe('u1');
    expect(payload.notes).toBe('Bring ladder');
    expect(typeof payload.arrivalWindowStart).toBe('string');
    expect(typeof payload.arrivalWindowEnd).toBe('string');
    expect(payload.arrivalWindowStart).toMatch(/2026-05-15T/);
    expect(payload.arrivalWindowEnd).toMatch(/2026-05-15T/);
    // Duration is optional; not provided in this test, must be omitted.
    expect(payload.estimatedDuration).toBeUndefined();
    // Default is "schedule silently"; payload should omit notifyAssignedUser.
    expect(payload.notifyAssignedUser).toBeUndefined();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('includes estimatedDuration in the payload when set', async () => {
    mockDispatchesCreate.mockResolvedValue({ id: 'd-new' });
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');
    await user.type(
      screen.getByLabelText('Estimated Duration (optional, minutes)'),
      '90'
    );
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() => {
      expect(mockDispatchesCreate).toHaveBeenCalled();
    });
    expect(mockDispatchesCreate.mock.calls[0][0].estimatedDuration).toBe(90);
  });

  it('omits notes from the payload when blank', async () => {
    mockDispatchesCreate.mockResolvedValue({ id: 'd-new' });
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() => {
      expect(mockDispatchesCreate).toHaveBeenCalled();
    });
    const payload = mockDispatchesCreate.mock.calls[0][0];
    expect(payload.notes).toBeUndefined();
  });

  it('alerts on create error and keeps the dialog open', async () => {
    mockDispatchesCreate.mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={onClose} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('sets notifyAssignedUser true when the dispatcher ticks the checkbox', async () => {
    mockDispatchesCreate.mockResolvedValue({ id: 'd-new' });
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Technician'), 'u1');
    await user.click(screen.getByLabelText('Send SMS to technician now'));
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() => {
      expect(mockDispatchesCreate).toHaveBeenCalled();
    });
    expect(mockDispatchesCreate.mock.calls[0][0].notifyAssignedUser).toBe(true);
  });

  it('resets the notify checkbox when the dialog is reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Jason Smith')).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText('Send SMS to technician now');
    await user.click(checkbox);
    // Headless UI checkbox uses aria-checked, not the input checked attribute.
    await waitFor(() => {
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    // Close + reopen — fresh draft, fresh default OFF.
    rerender(
      <AssignTechnicianDialog isOpen={false} onClose={vi.fn()} workOrderId="wo-1" />
    );
    rerender(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    const reopened = await screen.findByLabelText('Send SMS to technician now');
    expect(reopened).toHaveAttribute('aria-checked', 'false');
  });

  it('renders in edit mode with prefilled values, no notify checkbox', async () => {
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u2',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: 75,
      status: 'SCHEDULED',
      arrivedAt: null,
      departedAt: null,
      notes: 'Side door',
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    // Title flips to edit copy.
    await waitFor(() => {
      expect(screen.getByText('Edit dispatch')).toBeInTheDocument();
    });
    // Tech preselected — wait for the users query to populate options first
    // so the select can hold a non-empty value.
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Technician') as HTMLSelectElement).value
      ).toBe('u2');
    });
    // Numeric fields preserved.
    expect(
      (screen.getByLabelText(
        'Estimated Duration (optional, minutes)'
      ) as HTMLInputElement).value
    ).toBe('75');
    // Notes preserved.
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      'Side door'
    );
    // No notify checkbox in edit mode — resend lives on the row.
    expect(
      screen.queryByLabelText('Send SMS to technician now')
    ).not.toBeInTheDocument();
  });

  it('submits an update via dispatchesApi.update in edit mode', async () => {
    mockDispatchesUpdate.mockResolvedValue({ id: 'd-edit' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u1',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: null,
      status: 'SCHEDULED',
      arrivedAt: null,
      departedAt: null,
      notes: null,
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={onClose}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit dispatch')).toBeInTheDocument();
    });
    // Wait for the users query to resolve so the picker has the second tech.
    await waitFor(() => {
      expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    });

    // Reassign mid-flight: u1 → u2.
    await user.selectOptions(screen.getByLabelText('Technician'), 'u2');
    // Submit button copy is "Save" in edit mode.
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = mockDispatchesUpdate.mock.calls[0];
    expect(id).toBe('d-edit');
    expect(payload.assignedUserId).toBe('u2');
    // Window is preserved.
    expect(payload.arrivalWindowStart).toMatch(/2026-06-01T/);
    // Create wasn't called.
    expect(mockDispatchesCreate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('cancel triggers onClose without submitting', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={onClose} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
    expect(mockDispatchesCreate).not.toHaveBeenCalled();
  });

  it('omits the Status select in create mode', async () => {
    renderWithProviders(
      <AssignTechnicianDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // No Status label / select in create mode — backend defaults to SCHEDULED
    // and the row's forward-only actions handle the rest until edit is needed.
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('renders the Status select in edit mode prefilled with the dispatch status', async () => {
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u1',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: null,
      status: 'IN_PROGRESS',
      arrivedAt: '2026-06-01T15:05:00Z',
      departedAt: null,
      notes: null,
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    const statusSelect = (await screen.findByLabelText('Status')) as HTMLSelectElement;
    expect(statusSelect.value).toBe('IN_PROGRESS');
  });

  it('sends the new status in the update payload when the dispatcher changes it', async () => {
    mockDispatchesUpdate.mockResolvedValue({ id: 'd-edit' });
    const user = userEvent.setup();
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u1',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: null,
      status: 'IN_PROGRESS',
      arrivedAt: '2026-06-01T15:05:00Z',
      departedAt: null,
      notes: null,
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    // Reset back to SCHEDULED — undoing an accidental Mark arrived.
    const statusSelect = await screen.findByLabelText('Status');
    await user.selectOptions(statusSelect, 'SCHEDULED');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalled();
    });
    const [, payload] = mockDispatchesUpdate.mock.calls[0];
    expect(payload.status).toBe('SCHEDULED');
  });

  it('omits status from the update payload when unchanged', async () => {
    mockDispatchesUpdate.mockResolvedValue({ id: 'd-edit' });
    const user = userEvent.setup();
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u1',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: null,
      status: 'SCHEDULED',
      arrivedAt: null,
      departedAt: null,
      notes: null,
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    // Touch a different field (notes) so the form submits, but leave status alone.
    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });
    const notes = screen.getByLabelText('Notes');
    await user.type(notes, 'arriving soon');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalled();
    });
    const [, payload] = mockDispatchesUpdate.mock.calls[0];
    // Unchanged status → omitted from payload (backend treats undefined as
    // "no change," keeping the audit/event log honest).
    expect(payload.status).toBeUndefined();
    expect(payload.notes).toBe('arriving soon');
  });

  it('supports cancelling a dispatch via the Status select', async () => {
    mockDispatchesUpdate.mockResolvedValue({ id: 'd-edit' });
    const user = userEvent.setup();
    const existing: Dispatch = {
      id: 'd-edit',
      workOrderId: 'wo-1',
      assignedUserId: 'u1',
      arrivalWindowStart: '2026-06-01T15:00:00Z',
      arrivalWindowEnd: '2026-06-01T17:00:00Z',
      estimatedDuration: null,
      status: 'SCHEDULED',
      arrivedAt: null,
      departedAt: null,
      notes: null,
      createdAt: '2026-05-30T00:00:00Z',
      updatedAt: '2026-05-30T00:00:00Z',
    };

    renderWithProviders(
      <AssignTechnicianDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        dispatch={existing}
      />
    );

    const statusSelect = await screen.findByLabelText('Status');
    await user.selectOptions(statusSelect, 'CANCELLED');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockDispatchesUpdate).toHaveBeenCalled();
    });
    const [, payload] = mockDispatchesUpdate.mock.calls[0];
    expect(payload.status).toBe('CANCELLED');
  });
});
