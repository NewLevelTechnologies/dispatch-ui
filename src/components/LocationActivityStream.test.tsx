import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import LocationActivityStream from './LocationActivityStream';
import apiClient from '../api/client';
import { useHasCapability } from '../hooks/useCurrentUser';
import type {
  ActivityEvent,
  ActivityPage,
  LocationActivityEvent,
  LocationActivityPage,
  ActivityWorkOrderRef,
  ServiceLocationAuditEntry,
} from '../api';

vi.mock('../api/client');

const wo = (overrides: Partial<ActivityWorkOrderRef> = {}): ActivityWorkOrderRef => ({
  id: 'wo-1',
  workOrderNumber: 'WO-4203',
  summary: 'No AC',
  progressCategory: 'IN_PROGRESS',
  activityCount: 1,
  ...overrides,
});

const event = (overrides: Partial<LocationActivityEvent> = {}): LocationActivityEvent => ({
  id: 'evt-1',
  kind: 'NOTE_ADDED',
  category: 'NOTE',
  timestamp: '2026-04-27T14:00:00Z',
  actor: { userId: 'u-1', userName: 'Jamie Smith' },
  data: {},
  workOrder: wo(),
  ...overrides,
});

const locPage = (events: LocationActivityEvent[]): LocationActivityPage => ({
  content: events,
  nextCursor: null,
  hasMore: false,
});

const woPage = (events: ActivityEvent[]): ActivityPage => ({
  content: events,
  nextCursor: null,
  hasMore: false,
});

const auditEntry = (
  overrides: Partial<ServiceLocationAuditEntry> = {}
): ServiceLocationAuditEntry => ({
  id: 'a-1',
  userName: 'Dana R.',
  userEmail: 'dana@example.com',
  userRole: 'CSR',
  action: 'UPDATE',
  changes: [
    {
      field: 'premiseType',
      label: 'Premise Type',
      oldValue: 'BUSINESS',
      newValue: 'RESIDENCE',
      sensitive: false,
    },
  ],
  timestamp: '2026-06-07T14:03:00Z',
  ...overrides,
});

/** Route the shared apiClient.get by URL: the audit stream, the location feed,
 * or the per-WO feed that powers group expansion. */
function mockFeeds(
  location: LocationActivityPage,
  perWo: ActivityPage = woPage([]),
  audit: ServiceLocationAuditEntry[] = []
) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    Promise.resolve({
      data: url.includes('/audit/')
        ? audit
        : url.includes('/locations/')
          ? location
          : perWo,
    }) as ReturnType<typeof apiClient.get>
  );
}

describe('LocationActivityStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to holding VIEW_AUDIT_LOGS; the gate-off test overrides this.
    vi.mocked(useHasCapability).mockReturnValue(true);
    global.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
  });

  it('renders the empty state when there is no activity', async () => {
    mockFeeds(locPage([]));
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      expect(screen.getByText('No activity matches')).toBeInTheDocument();
    });
  });

  it('renders a one-event job as a plain row with a work-order backlink', async () => {
    mockFeeds(
      locPage([
        event({
          id: 'e1',
          kind: 'WORK_ORDER_CREATED',
          category: 'STATUS',
          workOrder: wo({ activityCount: 1 }),
        }),
      ])
    );
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      expect(screen.getByText('Work Order created')).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /WO-4203/ });
    expect(link).toHaveAttribute('href', '/work-orders/wo-1');
  });

  it('collapses a multi-event job into one expandable row, then loads its sub-events', async () => {
    const created = event({
      id: 'e-created',
      kind: 'WORK_ORDER_CREATED',
      category: 'STATUS',
      timestamp: '2026-04-27T08:00:00Z',
      workOrder: wo({ activityCount: 2 }),
    });
    const arrived = event({
      id: 'e-arrived',
      kind: 'DISPATCH_ARRIVED',
      category: 'DISPATCH',
      timestamp: '2026-04-27T11:00:00Z',
      data: { assignedUserName: 'Dana Park' },
      workOrder: wo({ activityCount: 2 }),
    });
    mockFeeds(locPage([arrived, created]), woPage([arrived, created]));

    const user = userEvent.setup();
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    // The lead event heads a collapsed group labelled "2 updates"; the older
    // sub-event isn't shown until expanded.
    await waitFor(() => {
      expect(screen.getByText(/2 updates/)).toBeInTheDocument();
    });
    expect(screen.getByText('Dana Park arrived')).toBeInTheDocument();
    expect(screen.queryByText('Work Order created')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    await waitFor(() => {
      expect(screen.getByText('Work Order created')).toBeInTheDocument();
    });
  });

  it('collapses a WO into one group even when its events are non-consecutive', async () => {
    // WO-A events bracket a WO-B event in the timeline. Each WO must collapse to
    // a single group row — not one row per scattered event each stamped "3 updates".
    const aNew = event({
      id: 'a-new',
      kind: 'DISPATCH_ARRIVED',
      category: 'DISPATCH',
      timestamp: '2026-04-27T12:00:00Z',
      data: { assignedUserName: 'Dana Park' },
      workOrder: wo({ id: 'wo-a', workOrderNumber: 'WO-A', activityCount: 3 }),
    });
    const bMid = event({
      id: 'b-mid',
      kind: 'WORK_ORDER_CREATED',
      category: 'STATUS',
      timestamp: '2026-04-27T11:00:00Z',
      workOrder: wo({ id: 'wo-b', workOrderNumber: 'WO-B', activityCount: 1 }),
    });
    const aOld = event({
      id: 'a-old',
      kind: 'WORK_ITEM_STATUS_CHANGED',
      category: 'STATUS',
      timestamp: '2026-04-27T10:00:00Z',
      data: { fromStatusName: 'Pending', toStatusName: 'Done' },
      workOrder: wo({ id: 'wo-a', workOrderNumber: 'WO-A', activityCount: 3 }),
    });
    mockFeeds(locPage([aNew, bMid, aOld]));
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    await waitFor(() => {
      expect(screen.getByText(/3 updates/)).toBeInTheDocument();
    });
    // Exactly one collapsible group row (WO-A); "3 updates" is shown once, not
    // stamped on each scattered event. WO-B (count 1) is a plain row.
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
    expect(screen.getAllByText(/3 updates/)).toHaveLength(1);
  });

  it('truncates a long field diff and expands it on click', async () => {
    const oldText = 'A'.repeat(60);
    const newText = 'B'.repeat(60);
    mockFeeds(locPage([]), woPage([]), [
      auditEntry({
        action: 'UPDATE',
        changes: [
          { field: 'summary', label: 'Summary', oldValue: oldText, newValue: newText, sensitive: false },
        ],
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByText('Summary changed')).toBeInTheDocument();
    });
    // The full 60-char value isn't inlined; a toggle reveals it.
    expect(screen.queryByText(new RegExp(newText))).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show change' }));
    await waitFor(() => {
      expect(screen.getByText(new RegExp(newText))).toBeInTheDocument();
    });
  });

  it('renders System with a gear for events with no actor', async () => {
    mockFeeds(
      locPage([
        event({ id: 'e-sys', kind: 'WORK_ORDER_CREATED', category: 'STATUS', actor: null }),
      ])
    );
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('renders day-group headers between events on different days', async () => {
    const todayIso = new Date().toISOString();
    const yesterdayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    mockFeeds(
      locPage([
        event({ id: 'e-today', timestamp: todayIso, workOrder: wo({ id: 'wo-a' }) }),
        event({ id: 'e-yest', timestamp: yesterdayIso, workOrder: wo({ id: 'wo-b' }) }),
      ])
    );
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('passes the chip category as a server-side filter', async () => {
    mockFeeds(locPage([]));
    const user = userEvent.setup();
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Notes' }));

    await waitFor(() => {
      const calls = vi.mocked(apiClient.get).mock.calls;
      const last = calls[calls.length - 1];
      const params = (last?.[1] as { params?: Record<string, unknown> })?.params;
      expect(params).toMatchObject({ categories: 'NOTE' });
    });
  });

  it('labels the entity-mapped chips through the glossary', async () => {
    mockFeeds(locPage([]));
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      const group = screen.getByRole('group', { name: 'Activity' });
      // job → work orders, invoice → invoices (default glossary plurals)
      expect(within(group).getByRole('button', { name: 'Work Orders' })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: 'Invoices' })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: 'Visits' })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: 'Payments' })).toBeInTheDocument();
    });
  });

  it('hides the audit affordances without the VIEW_AUDIT_LOGS capability', async () => {
    vi.mocked(useHasCapability).mockReturnValue(false);
    mockFeeds(locPage([]), woPage([]), [auditEntry()]);
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const auditCalls = vi
      .mocked(apiClient.get)
      .mock.calls.filter(([url]) => String(url).includes('/audit/'));
    expect(auditCalls).toHaveLength(0);
  });

  it('interleaves tagged change rows when "Show all changes" is on', async () => {
    mockFeeds(
      locPage([
        event({ id: 'e1', kind: 'WORK_ORDER_CREATED', category: 'STATUS', workOrder: wo({ activityCount: 1 }) }),
      ]),
      woPage([]),
      [auditEntry()]
    );
    const user = userEvent.setup();
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    await waitFor(() => {
      expect(screen.getByText('Work Order created')).toBeInTheDocument();
    });
    expect(screen.queryByText('Premise Type changed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      expect(screen.getByText('Premise Type changed')).toBeInTheDocument();
    });
    expect(screen.getByText(/BUSINESS → RESIDENCE/)).toBeInTheDocument();
  });

  it('shows only change rows under the Changes chip when audit is on', async () => {
    mockFeeds(
      locPage([event({ id: 'e1', kind: 'WORK_ORDER_CREATED', category: 'STATUS' })]),
      woPage([]),
      [auditEntry({ action: 'CREATE', changes: [] })]
    );
    const user = userEvent.setup();
    renderWithProviders(<LocationActivityStream serviceLocationId="sl-1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Changes' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Changes' }));

    // CREATE change row renders; business events are excluded entirely.
    await waitFor(() => {
      expect(screen.getByText('Location created')).toBeInTheDocument();
    });
    expect(screen.queryByText('Work Order created')).not.toBeInTheDocument();
  });
});
