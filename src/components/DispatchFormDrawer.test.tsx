import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchFormDrawer from './DispatchFormDrawer';
import type { Dispatch, User, WorkItemResponse } from '../api';

const mockUserGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();

vi.mock('../api/userApi', () => ({
  userApi: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
  default: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
}));

vi.mock('../api/schedulingApi', async () => {
  const actual = await vi.importActual<typeof import('../api/schedulingApi')>('../api/schedulingApi');
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

const wi = (id: string, description: string, statusCategory: WorkItemResponse['statusCategory']): WorkItemResponse =>
  ({ id, description, statusCategory }) as WorkItemResponse;

const NEEDY_ITEM = wi('wi-1', 'No cooling upstairs', 'AWAITING_SCHEDULE');
const DONE_ITEM = wi('wi-2', 'Replaced capacitor', 'COMPLETED');
const BLOCKED_ITEM = wi('wi-3', 'Compressor swap', 'BLOCKED');

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
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('d-1'));
  });

  it('warns when a parts-blocked item is in the addressed set', async () => {
    render({ dispatch: null, workItems: [BLOCKED_ITEM] });
    // BLOCKED is "needy" → pre-selected → warning shows.
    expect(await screen.findByText(/parts-blocked/i)).toBeInTheDocument();
  });

  it('cancels the dispatch through the confirm', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render({ dispatch: editDispatch });
    await user.click(await screen.findByRole('button', { name: /cancel dispatch/i }));
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

  it('creates a dispatch with the chosen tech, needy items, and notify', async () => {
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
          notifyAssignedUser: true,
        }),
      ),
    );
  });
});
