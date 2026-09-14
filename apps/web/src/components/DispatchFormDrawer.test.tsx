import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchFormDrawer from './DispatchFormDrawer';
import type { Dispatch, User, WorkItemResponse } from '../api/setup';

const mockUserGetAll = vi.fn();
const mockGetFieldWorkers = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockNotify = vi.fn();
const mockTenantSettings = vi.fn();
// The job section the composer now renders reads the work order and its
// context. All of it shares query keys with the board, so these stand in for
// caches that are usually already warm.
const mockWorkOrderGetById = vi.fn();
const mockListForWorkOrder = vi.fn();
const mockListForServiceLocation = vi.fn();

vi.mock('@dispatch/api/src/userApi', () => ({
  userApi: {
    getAll: (...args: unknown[]) => mockUserGetAll(...args),
    getFieldWorkers: (...args: unknown[]) => mockGetFieldWorkers(...args),
  },
  default: {
    getAll: (...args: unknown[]) => mockUserGetAll(...args),
    getFieldWorkers: (...args: unknown[]) => mockGetFieldWorkers(...args),
  },
}));

vi.mock('@dispatch/api/src/tenantSettingsApi', async () => {
  const actual = await vi.importActual<typeof import('@dispatch/api/src/tenantSettingsApi')>(
    '@dispatch/api/src/tenantSettingsApi',
  );
  return {
    ...actual,
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => mockTenantSettings() },
  };
});

vi.mock('@dispatch/api/src/schedulingApi', async () => {
  const actual = await vi.importActual<typeof import('../api/setup')>('@dispatch/api/src/schedulingApi');
  return {
    ...actual,
    dispatchesApi: {
      ...actual.dispatchesApi,
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      notify: (...args: unknown[]) => mockNotify(...args),
      listForWorkOrder: (...args: unknown[]) => mockListForWorkOrder(...args),
      listForServiceLocation: (...args: unknown[]) => mockListForServiceLocation(...args),
    },
  };
});

vi.mock('@dispatch/api/src/financialApi', async () => {
  const actual = await vi.importActual<typeof import('@dispatch/api/src/financialApi')>(
    '@dispatch/api/src/financialApi',
  );
  return {
    ...actual,
    financialSummaryApi: {
      ...actual.financialSummaryApi,
      getByWorkOrder: () => Promise.resolve({ balance: '0' }),
    },
  };
});

vi.mock('@dispatch/api/src/notesApi', async () => {
  const actual = await vi.importActual<typeof import('@dispatch/api/src/notesApi')>(
    '@dispatch/api/src/notesApi',
  );
  return { ...actual, notesApi: { ...actual.notesApi, list: () => Promise.resolve([]) } };
});

vi.mock('@dispatch/api/src/workOrderConfigApi', async () => {
  const actual = await vi.importActual<typeof import('@dispatch/api/src/workOrderConfigApi')>(
    '@dispatch/api/src/workOrderConfigApi',
  );
  return { ...actual, divisionsApi: { ...actual.divisionsApi, getAll: () => Promise.resolve([]) } };
});

vi.mock('@dispatch/api/src/workOrderApi', async () => {
  const actual = await vi.importActual<typeof import('@dispatch/api/src/workOrderApi')>(
    '@dispatch/api/src/workOrderApi',
  );
  return {
    ...actual,
    workOrderApi: { ...actual.workOrderApi, getById: (...a: unknown[]) => mockWorkOrderGetById(...a) },
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
    mockGetFieldWorkers.mockResolvedValue([
      tech('u-1', 'Daniel', 'Park'),
      tech('u-2', 'Marcus', 'Lee'),
    ]);
    mockTenantSettings.mockResolvedValue({ timezone: 'America/Phoenix' });
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

// A technician picker has to offer exactly who can be assigned. Listing every
// enabled user put admins and CSRs in the dropdown — and surfaced a second
// account for the same person, only one of whom was dispatchable.
describe('DispatchFormDrawer technician picker', () => {
  it('asks for field workers, not every enabled user', async () => {
    render();
    await waitFor(() => expect(mockGetFieldWorkers).toHaveBeenCalled());
    expect(mockUserGetAll).not.toHaveBeenCalled();
  });
});

// Two dispatchers on one board is the normal case. Without the version
// precondition the second save silently overwrites the first.
describe('DispatchFormDrawer concurrency', () => {
  const existing = {
    id: 'd-1',
    workOrderId: 'wo-1',
    assignedUserId: 'u-1',
    arrivalWindowStart: '2026-03-15T15:00:00Z',
    arrivalWindowEnd: '2026-03-15T17:00:00Z',
    estimatedDuration: null,
    status: 'SCHEDULED' as const,
    arrivedAt: null,
    departedAt: null,
    notes: null,
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T00:00:00Z',
    version: 7,
  };

  it('round-trips the version it opened against', async () => {
    const u = userEvent.setup();
    render({ dispatch: existing });

    await screen.findByText('Daniel Park');
    await u.click(screen.getAllByRole('button', { name: /save|schedule/i })[0]);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ version: 7 })
    );
  });

  // A conflict isn't a validation failure — the form is fine, the record moved
  // underneath it. Retrying into the same wall would be the wrong affordance.
  it('explains a conflict rather than reporting a generic save error', async () => {
    const u = userEvent.setup();
    mockUpdate.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        response: { status: 409, data: { code: 'DISPATCH_VERSION_CONFLICT' } },
      })
    );

    render({ dispatch: existing });
    await screen.findByText('Daniel Park');
    await u.click(screen.getAllByRole('button', { name: /save|schedule/i })[0]);

    expect(await screen.findByText(/Someone else changed this/)).toBeInTheDocument();
  });
});

// An arrival window is tenant-local: "9–11a" means 9am where the truck is
// going. Read back through the browser's clock instead, editing a dispatch
// silently shifts its window by the offset every time it is saved — and a
// preset window stops matching its own preset.
describe('DispatchFormDrawer tenant timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([tech('u-1', 'Daniel', 'Park')]);
    mockGetFieldWorkers.mockResolvedValue([tech('u-1', 'Daniel', 'Park')]);
    mockTenantSettings.mockResolvedValue({ timezone: 'America/Phoenix' });
    mockUpdate.mockResolvedValue(editDispatch);
  });

  // 16:00Z is 9am in Phoenix, which IS a preset. Read in any other zone it is
  // some other hour, and the drawer would offer a synthetic "current" window
  // instead of the preset the dispatcher actually booked.
  it('matches an existing window to its preset in the tenant’s zone', async () => {
    render({ dispatch: editDispatch });
    expect(await screen.findByDisplayValue('9:00 – 11:00 AM')).toBeInTheDocument();
  });

  it('writes the window back unchanged when nothing is edited', async () => {
    const user = userEvent.setup();
    render({ dispatch: editDispatch });

    await screen.findByDisplayValue('9:00 – 11:00 AM');
    await user.click(screen.getByRole('button', { name: /save|update/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({
      arrivalWindowStart: '2026-05-18T16:00:00.000Z',
      arrivalWindowEnd: '2026-05-18T18:00:00.000Z',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Map prefill.
//
// A map drop carries a PERSON and a DAY and nothing else. Since every window
// the board creates has to be one of the tenant's presets, auto-picking one
// would quote a customer an arrival window no dispatcher ever chose — and an
// undo toast does not undo a phone call. So the window arrives unset, and the
// form refuses to submit until someone answers it.
// ─────────────────────────────────────────────────────────────────────
describe('DispatchFormDrawer — opened from a map drop', () => {
  const prefill = { assignedUserId: 'u-2', date: '2026-03-15' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([tech('u-1', 'Daniel', 'Park'), tech('u-2', 'Marcus', 'Lee')]);
    mockGetFieldWorkers.mockResolvedValue([
      tech('u-1', 'Daniel', 'Park'),
      tech('u-2', 'Marcus', 'Lee'),
    ]);
    mockTenantSettings.mockResolvedValue({ timezone: 'America/Phoenix' });
    mockCreate.mockResolvedValue(editDispatch);
    mockNotify.mockResolvedValue(undefined);
  });

  it('prefills the technician the drop resolved to', async () => {
    render({ dispatch: null, prefill });
    await waitFor(() => expect(mockGetFieldWorkers).toHaveBeenCalled());
    expect(await screen.findByText('Prefilled from the map')).toBeInTheDocument();
  });

  it('prefills the VIEWED date, not tomorrow', async () => {
    // The default create path opens on tomorrow. A drop on Thursday's board
    // that scheduled Friday would be a quiet, expensive bug.
    render({ dispatch: null, prefill });
    expect(await screen.findByDisplayValue('2026-03-15')).toBeInTheDocument();
  });

  it('leaves the arrival window unchosen', async () => {
    render({ dispatch: null, prefill });
    const select = await screen.findByLabelText('Arrival window');
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('cannot be submitted until a window is chosen', async () => {
    const user = userEvent.setup();
    render({ dispatch: null, prefill });
    const submit = await screen.findByRole('button', { name: /Schedule/ });
    expect(submit).toBeDisabled();

    await user.selectOptions(await screen.findByLabelText('Arrival window'), '9:00 – 11:00 AM');
    await waitFor(() => expect(submit).toBeEnabled());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('drops the placeholder once a real window is picked', async () => {
    const user = userEvent.setup();
    render({ dispatch: null, prefill });
    const select = await screen.findByLabelText('Arrival window');
    await user.selectOptions(select, '9:00 – 11:00 AM');
    // An empty option that stays in the list reads as a valid answer.
    expect(within(select).queryByRole('option', { name: 'Select…' })).not.toBeInTheDocument();
  });

  it('still defaults the window when opened WITHOUT a map drop', async () => {
    // The rail path is unchanged: a dispatcher who opened the form on purpose
    // gets a sensible default to accept or change. Both paths still start
    // disabled, but for different reasons — this one has no technician yet,
    // which is precisely the field a map drop is able to answer.
    render({ dispatch: null });
    const select = await screen.findByLabelText('Arrival window');
    expect((select as HTMLSelectElement).value).not.toBe('');
    expect(within(select).queryByRole('option', { name: 'Select…' })).not.toBeInTheDocument();
    expect(screen.queryByText('Prefilled from the map')).not.toBeInTheDocument();
  });
});

// The composer covers the rail when it is open, so the card's own work-order
// link goes with it. A dispatcher scheduling a 95-day-old job usually wants to
// read the job before promising a window.
describe('DispatchFormDrawer — the job behind the visit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([tech('u-1', 'Daniel', 'Park')]);
    mockGetFieldWorkers.mockResolvedValue([tech('u-1', 'Daniel', 'Park')]);
    mockTenantSettings.mockResolvedValue({ timezone: 'America/Phoenix' });
    mockWorkOrderGetById.mockResolvedValue({ id: 'wo-1', workItems: [], customer: { name: 'Pham, A.' } });
    mockListForWorkOrder.mockResolvedValue([]);
    mockListForServiceLocation.mockResolvedValue({ content: [], totalElements: 0 });
  });

  it('links to the work order by number', async () => {
    render({
      dispatch: null,
      workOrderNumber: 'WO-3911',
      workOrderHref: '/work-orders/wo-1?from=dispatch',
    });
    const link = await screen.findByRole('link', { name: /WO-3911/ });
    expect(link).toHaveAttribute('href', '/work-orders/wo-1?from=dispatch');
  });

  it('is a real href, so middle-click and cmd-click reach a new tab', async () => {
    // A JS-only navigation silently removes the way dispatchers read a job
    // without losing the board.
    render({ dispatch: null, workOrderNumber: 'WO-3911', workOrderHref: '/work-orders/wo-1' });
    expect((await screen.findByRole('link', { name: /WO-3911/ })).tagName).toBe('A');
  });

  it('says WHICH job, not just that one exists', async () => {
    // The section reads the work order itself, so the summary comes from the
    // same cache the board and the detail drawer already share.
    mockWorkOrderGetById.mockResolvedValue({
      id: 'wo-1',
      summary: 'No cooling — full system',
      workItems: [],
      customer: { name: 'Pham, A.' },
    });
    render({ dispatch: null, workOrderNumber: 'WO-3911', workOrderHref: '/work-orders/wo-1' });
    expect(await screen.findByText('No cooling — full system')).toBeInTheDocument();
  });

  it('names the SITE, not the customer who is billed', async () => {
    mockWorkOrderGetById.mockResolvedValue({
      id: 'wo-1',
      summary: 'No cooling',
      workItems: [],
      customer: { name: 'Kroger Co.' },
      serviceLocation: { id: 'l1', locationName: 'Store #4412' },
    });
    render({ dispatch: null, workOrderNumber: 'WO-3911', workOrderHref: '/work-orders/wo-1' });
    expect(await screen.findByText(/Store #4412/)).toBeInTheDocument();
    expect(screen.queryByText(/Kroger Co\./)).not.toBeInTheDocument();
  });

  it('falls back to the customer for a site with no name', async () => {
    mockWorkOrderGetById.mockResolvedValue({
      id: 'wo-1',
      summary: 'No cooling',
      workItems: [],
      customer: { name: 'Pham, A.' },
      serviceLocation: { id: 'l1' },
    });
    render({ dispatch: null, workOrderNumber: 'WO-3911', workOrderHref: '/work-orders/wo-1' });
    expect(await screen.findByText(/Pham, A\./)).toBeInTheDocument();
  });

  it('renders nothing when the caller is already on the work order', async () => {
    // The work order's own page opens this too, and a link back to the page
    // you are standing on is noise.
    render({ dispatch: null, workOrderNumber: 'WO-3911' });
    await screen.findByLabelText('Arrival window');
    expect(screen.queryByRole('link', { name: /WO-3911/ })).not.toBeInTheDocument();
  });
});
