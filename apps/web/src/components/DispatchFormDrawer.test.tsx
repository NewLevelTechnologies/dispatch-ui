import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchFormDrawer from './DispatchFormDrawer';
import type { Dispatch, User, WorkItemResponse } from '../api/setup';

const mockUserGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();

vi.mock('@dispatch/api/src/userApi', () => ({
  userApi: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
  default: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
}));

vi.mock('@dispatch/api/src/schedulingApi', async () => {
  const actual = await vi.importActual<typeof import('../api/setup')>('@dispatch/api/src/schedulingApi');
  return {
    ...actual,
    dispatchesApi: {
      ...actual.dispatchesApi,
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      notify: (...args: unknown[]) => mockNotify(...args),
    },
  };
});

const tech = (id: string, first: string, last: string): User =>
  ({
    id,
    tenantId: 't1',
    cognitoSub: `sub-${id}`,
    email: `${first.toLowerCase()}@example.com`,
    firstName: first,
    lastName: last,
    enabled: true,
  }) as User;

const wi = (
  id: string,
  description: string,
  statusCategory: WorkItemResponse['statusCategory'],
  sequence: number,
): WorkItemResponse => ({ id, description, statusCategory, sequence }) as WorkItemResponse;

const NEEDY_ITEM = wi('wi-1', 'No cooling upstairs', 'AWAITING_SCHEDULE', 1);
const DONE_ITEM = wi('wi-2', 'Replaced capacitor', 'COMPLETED', 2);
const BLOCKED_ITEM = wi('wi-3', 'Compressor swap', 'BLOCKED', 3);

const editDispatch: Dispatch = {
  id: 'd-1',
  workOrderId: 'wo-1',
  assignedUserId: 'u-1',
  arrivalWindowStart: '2026-05-18T16:00:00Z',
  arrivalWindowEnd: '2026-05-18T18:00:00Z',
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  addressedWorkItemIds: ['wi-1'],
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const render = (props: Partial<React.ComponentProps<typeof DispatchFormDrawer>> = {}) =>
  renderWithProviders(
    <DispatchFormDrawer
      open
      onClose={props.onClose ?? vi.fn()}
      workOrderId="wo-1"
      workItems={props.workItems ?? [NEEDY_ITEM, DONE_ITEM]}
      dispatch={props.dispatch}
      {...props}
    />,
  );

describe('DispatchFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([tech('u-1', 'Daniel', 'Park'), tech('u-2', 'Marcus', 'Lee')]);
    mockCreate.mockResolvedValue(editDispatch);
    mockUpdate.mockResolvedValue(editDispatch);
    mockNotify.mockResolvedValue(undefined);
  });

  it('renders create mode with the needy work item pre-selected', async () => {
    render({ dispatch: null });
    // Needy item chip is selected (renders a check); completed one is not.
    const needyChip = await screen.findByRole('button', { name: /No cooling upstairs/ });
    expect(needyChip.querySelector('svg')).not.toBeNull();
    // Chip carries the per-WO work-item identifier (sequence 1 → WI-01).
    expect(within(needyChip).getByText('WI-01')).toBeInTheDocument();
    const doneChip = screen.getByRole('button', { name: /Replaced capacitor/ });
    expect(doneChip.querySelector('svg')).toBeNull();
  });

  it('reflects the release choice in the primary button label', async () => {
    const user = userEvent.setup();
    render({ dispatch: null });
    expect(await screen.findByRole('button', { name: /schedule dispatch/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hold on deck/i }));
    expect(screen.getAllByRole('button', { name: /hold on deck/i }).length).toBeGreaterThan(0);
  });

  it('prefills edit mode and saves via update with window + addressed items', async () => {
    const user = userEvent.setup();
    render({ dispatch: editDispatch });
    expect(await screen.findByText(/edit dispatch/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({ assignedUserId: 'u-1', addressedWorkItemIds: ['wi-1'] }),
      ),
    );
    // Edit defaults to "hold" — no re-notify unless the dispatcher releases.
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('fires /notify when an edit releases the tech now', async () => {
    const user = userEvent.setup();
    render({ dispatch: editDispatch });
    await screen.findByText(/edit dispatch/i);
    await user.click(screen.getByRole('button', { name: /notify .* now/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    // Edit + release "now", customer text off → TECH audience.
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d-1', 'TECH'));
  });

  it('texts both tech and customer when both are on in edit', async () => {
    const user = userEvent.setup();
    render({ dispatch: editDispatch });
    await screen.findByText(/edit dispatch/i);
    await user.click(screen.getByRole('button', { name: /notify .* now/i }));
    await user.click(screen.getByRole('switch', { name: /text the customer/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d-1', 'BOTH'));
  });

  it('warns when a parts-blocked item is in the addressed set', async () => {
    render({ dispatch: null, workItems: [BLOCKED_ITEM] });
    // BLOCKED is "needy" → pre-selected → warning shows.
    expect(await screen.findByText(/parts-blocked/i)).toBeInTheDocument();
  });

  it('cancels the dispatch through the confirm dialog', async () => {
    const user = userEvent.setup();
    render({ dispatch: editDispatch });
    // Footer trigger opens the shared ConfirmDialog (no native window.confirm).
    await user.click(await screen.findByRole('button', { name: /^cancel dispatch$/i }));
    const dialog = await screen.findByRole('dialog', { name: /cancel dispatch\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^cancel dispatch$/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('d-1', { status: 'CANCELLED' }));
  });

  it('keeps the primary action disabled until a tech is chosen', async () => {
    render({ dispatch: null, workItems: [NEEDY_ITEM] });
    expect(await screen.findByRole('button', { name: /schedule dispatch/i })).toBeDisabled();
  });

  it('filters the technician list from the picker search', async () => {
    const user = userEvent.setup();
    render({ dispatch: null });
    await user.click(await screen.findByRole('button', { name: /^technician$/i }));
    expect(screen.getByRole('option', { name: /Daniel Park/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Marcus Lee/ })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /search technicians/i }), 'Marcus');
    expect(screen.queryByRole('option', { name: /Daniel Park/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Marcus Lee/ })).toBeInTheDocument();
  });

  it('creates a dispatch with the chosen tech, needy items, and notifications', async () => {
    const user = userEvent.setup();
    render({ dispatch: null, workItems: [NEEDY_ITEM] });
    // Pick a technician through the searchable picker.
    await user.click(await screen.findByRole('button', { name: /^technician$/i }));
    await user.click(await screen.findByRole('option', { name: /Daniel Park/ }));
    await user.click(screen.getByRole('button', { name: /schedule dispatch/i }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          workOrderId: 'wo-1',
          assignedUserId: 'u-1',
          addressedWorkItemIds: ['wi-1'],
        }),
      ),
    );
    // Both default on for a new dispatch (release "now" + customer text) → one
    // explicit notify covering BOTH, via /notify (not the create flag), so the
    // tech notification is logged like the customer's.
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d-1', 'BOTH'));
  });

  it('notifies only the tech on create when the customer text is off', async () => {
    const user = userEvent.setup();
    render({ dispatch: null, workItems: [NEEDY_ITEM] });
    await user.click(await screen.findByRole('button', { name: /^technician$/i }));
    await user.click(await screen.findByRole('option', { name: /Daniel Park/ }));
    await user.click(screen.getByRole('switch', { name: /text the customer/i }));
    await user.click(screen.getByRole('button', { name: /schedule dispatch/i }));
    // Release still "now" → TECH only (no CUSTOMER/BOTH).
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d-1', 'TECH'));
  });
});
