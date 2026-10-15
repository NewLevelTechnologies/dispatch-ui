import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { apiClient, type ActivityEvent, type ServiceLocationAuditEntry } from '../../api/setup';
import { useHasCapability } from '../../hooks/useCurrentUser';
import WorkOrderActivityTab from './WorkOrderActivityTab';

vi.mock('@dispatch/api/src/client');

const dispatch = { type: 'DISPATCH' as const, id: 'd-2', number: 2, label: null };
const event = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: 'e-1',
  kind: 'NOTE_ADDED',
  category: 'NOTE',
  classification: 'BUSINESS',
  timestamp: '2026-05-14T18:00:00Z',
  subject: { type: 'NOTE', id: 'n-1', number: null, label: null },
  actor: { type: 'USER', userId: 'u-1', userName: 'Maria C.' },
  data: { bodyExcerpt: 'Two small kids in home' },
  ...over,
});
const events: ActivityEvent[] = [
  event({
    id: 'e-close',
    kind: 'DISPATCH_CHECKED_OUT',
    category: 'DISPATCH',
    timestamp: '2026-05-14T18:12:00Z',
    subject: dispatch,
    actor: { type: 'USER', userId: 'u-2', userName: 'D. Park' },
    data: { assignedUserName: 'D. Park' },
  }),
  event({
    id: 'e-arrive',
    kind: 'DISPATCH_ARRIVED',
    category: 'DISPATCH',
    timestamp: '2026-05-14T16:30:00Z',
    subject: dispatch,
    actor: { type: 'USER', userId: 'u-2', userName: 'D. Park' },
    data: { assignedUserName: 'D. Park' },
  }),
  event({
    id: 'e-item',
    kind: 'WORK_ITEM_STATUS_CHANGED',
    category: 'WORK_ITEM',
    timestamp: '2026-05-14T17:48:00Z',
    subject: { type: 'WORK_ITEM', id: 'wi-2', number: 2, label: null },
    actor: { type: 'USER', userId: 'u-2', userName: 'D. Park' },
    data: { fromStatusName: 'Triage', toStatusName: 'Diagnosed', note: 'needs balance kit, return trip' },
  }),
  event({ id: 'e-note', timestamp: '2026-05-14T15:55:00Z' }),
  event({
    id: 'e-sys',
    kind: 'WORK_ITEM_STATUS_CHANGED',
    category: 'WORK_ITEM',
    classification: 'CHANGE',
    timestamp: '2026-05-14T15:00:00Z',
    subject: { type: 'WORK_ITEM', id: 'wi-1', number: 1, label: null },
    actor: { type: 'SYSTEM', userId: null, userName: 'System' },
    data: { fromStatusName: 'New', toStatusName: 'Scheduled' },
  }),
];
const quote = { type: 'QUOTE' as const, id: 'q-1', number: null, label: 'Q-1882' };
const financialEvents: ActivityEvent[] = [
  event({
    id: 'f-accept',
    kind: 'QUOTE_ACCEPTED',
    category: 'FINANCIAL',
    timestamp: '2026-05-14T18:02:00Z',
    subject: quote,
    actor: { type: 'CUSTOMER', userId: null, userName: 'Tanya Reyes' },
    data: { revision: 2, totalAmount: 742.67 },
  }),
  event({
    id: 'f-view',
    kind: 'QUOTE_VIEWED',
    category: 'FINANCIAL',
    timestamp: '2026-05-14T17:58:00Z',
    subject: quote,
    actor: { type: 'CUSTOMER', userId: null, userName: '' },
    data: { revision: 2 },
  }),
  event({
    id: 'f-send',
    kind: 'QUOTE_SENT',
    category: 'FINANCIAL',
    timestamp: '2026-05-14T17:51:00Z',
    subject: quote,
    actor: { type: 'USER', userId: 'u-1', userName: 'Maria C.' },
    data: { revision: 2, totalAmount: 742.67, channels: ['SMS', 'EMAIL'] },
  }),
];
const auditEntry: ServiceLocationAuditEntry = {
  id: 'a-1',
  userName: 'Maria C.',
  userEmail: 'maria@example.com',
  userRole: 'CSR',
  action: 'UPDATE',
  changes: [{ field: 'priority', label: 'Priority', oldValue: 'Normal', newValue: 'High', sensitive: false }],
  timestamp: '2026-05-14T15:50:00Z',
  netNoOp: false,
  revertsEntryId: null,
};

type Params = { categories?: string; classification?: string };
const feedCalls = () =>
  vi
    .mocked(apiClient.get)
    .mock.calls.filter(([u]) => u === '/work-orders/wo-1/activity')
    .map(([, cfg]) => ((cfg as { params?: Params } | undefined)?.params ?? {}) as Params);
const auditCalled = () => vi.mocked(apiClient.get).mock.calls.some(([u]) => u === '/audit/WorkOrder/wo-1');

describe('WorkOrderActivityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHasCapability).mockReturnValue(true);
    vi.mocked(apiClient.get).mockImplementation((url: string, cfg?: { params?: Params }) => {
      if (url === '/audit/WorkOrder/wo-1') return Promise.resolve({ data: [auditEntry] });
      if (url === '/financial/work-orders/wo-1/activity') {
        return Promise.resolve({ data: { content: financialEvents, nextCursor: null, hasMore: false } });
      }
      const cls = cfg?.params?.classification;
      const content = events.filter((e) => cls === 'ALL' || e.classification === (cls ?? 'BUSINESS'));
      return Promise.resolve({ data: { content, nextCursor: null, hasMore: false } });
    });
  });

  it('folds a dispatch’s steps into one row and links what each row is about', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);

    expect(await screen.findByText('D. Park checked out')).toBeInTheDocument();
    // The earlier arrival sits under it, not as its own row.
    expect(screen.queryByText('D. Park arrived')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dispatch 2' })).toHaveAttribute('href', expect.stringContaining('tab=trips'));

    await user.click(screen.getByRole('button', { name: /1 update/ }));
    expect(screen.getByText('D. Park arrived')).toBeInTheDocument();

    // A work item status change carries the note entered with it, and its item number.
    expect(screen.getByText(/Diagnosed · needs balance kit, return trip/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WI-02' })).toHaveAttribute('href', expect.stringContaining('tab=items'));
    expect(feedCalls()[0]).toMatchObject({ classification: 'BUSINESS' });
    expect(feedCalls()[0].categories).toBeUndefined();
    expect(auditCalled()).toBe(false);
  });

  it('adds change rows and field edits with audit detail', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);
    await screen.findByText('D. Park checked out');
    expect(screen.queryByText(/from New to Scheduled/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Include audit detail' }));
    expect(await screen.findByText(/from New to Scheduled/)).toBeInTheDocument();
    expect(await screen.findByText('Priority changed')).toBeInTheDocument();
    expect(feedCalls().at(-1)).toMatchObject({ classification: 'ALL' });
  });

  it('filters by chip on the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);
    await screen.findByText('D. Park checked out');

    await user.click(screen.getByRole('button', { name: 'Work Items' }));
    await waitFor(() => expect(feedCalls().at(-1)).toMatchObject({ categories: 'WORK_ITEM', classification: 'BUSINESS' }));

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    await waitFor(() => expect(feedCalls().at(-1)).toMatchObject({ classification: 'CHANGE' }));
    expect(await screen.findByText('Priority changed')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Include audit detail' })).not.toBeInTheDocument();
  });

  it('leaves out the field-edit trail without audit access', async () => {
    vi.mocked(useHasCapability).mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);
    await screen.findByText('D. Park checked out');
    await user.click(screen.getByRole('button', { name: 'Changes' }));
    expect(await screen.findByText(/from New to Scheduled/)).toBeInTheDocument();
    expect(auditCalled()).toBe(false);
  });

  it('merges the quote’s steps from financial-service into one row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);

    // The approval leads, by the customer who typed their name; it links to the quote.
    expect(await screen.findByText('Quote approved · $742.67')).toBeInTheDocument();
    expect(screen.getByText('Tanya Reyes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Q-1882' })).toHaveAttribute('href', '/quotes/q-1');
    expect(screen.queryByText(/Quote sent/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2 updates/ }));
    expect(screen.getByText('Quote sent by text and email · rev 2 · $742.67')).toBeInTheDocument();
    expect(screen.getByText('Viewed by the customer · rev 2')).toBeInTheDocument();
  });

  it('shows only quotes and invoices on their chip', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderActivityTab workOrderId="wo-1" />);
    await screen.findByText('D. Park checked out');
    const before = feedCalls().length;

    await user.click(screen.getByRole('button', { name: 'Quotes & invoices' }));
    expect(await screen.findByText('Quote approved · $742.67')).toBeInTheDocument();
    expect(screen.queryByText('D. Park checked out')).not.toBeInTheDocument();
    expect(feedCalls()).toHaveLength(before);
  });
});
