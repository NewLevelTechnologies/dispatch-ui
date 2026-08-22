import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ApprovalsBellPopover from './ApprovalsBellPopover';
import { apiClient } from '../api/setup';
import type { ApprovalRequest } from '../api/setup';

vi.mock('@dispatch/api/src/client');

// ApprovalsBellPopover wraps Headless UI Popover. The popover's panel
// only mounts when the bell is clicked, so the tests exercise the
// open → act → close lifecycle the same way the manager would.

function makeRequest(
  id: string,
  requester: { firstName: string; lastName: string },
  options: { expiresInHours?: number; customerName?: string } = {},
): ApprovalRequest {
  const hours = options.expiresInHours ?? 48;
  return {
    id,
    status: 'PENDING',
    transition: {
      id: `t-${id}`,
      fromStatus: { id: 's-ip', name: 'In Progress', accentId: 'blue' },
      toStatus: { id: 's-c', name: 'Complete', accentId: 'green' },
      workflowName: 'Warranty',
      approverCapabilities: ['APPROVE_WORK_ITEM_TRANSITIONS'],
    },
    workItem: { id: `wi-${id}`, name: `Work item ${id}` },
    workOrder: {
      id: `wo-${id}`,
      displayId: `WO-${id}`,
      customerName: options.customerName ?? `Customer ${id}`,
    },
    requester: {
      id: `u-${id}`,
      firstName: requester.firstName,
      lastName: requester.lastName,
      initials: `${requester.firstName[0]}${requester.lastName[0]}`,
    },
    requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  };
}

// Module-level so closures in the mock see updates between requests
// within a single test (approve/reject mutate this list).
let forMeList: ApprovalRequest[] = [];
let mineList: ApprovalRequest[] = [];

function installApiMock() {
  vi.mocked(apiClient.get).mockImplementation((url: string, config?: unknown) => {
    if (url === '/work-orders/approvals') {
      const params = (config as { params?: Record<string, unknown> } | undefined)?.params ?? {};
      // Resolved-mine list (Mine tab fetches APPROVED/REJECTED/EXPIRED
      // separately to render the "Recently resolved" section).
      if (typeof params.status === 'string' && params.status.includes('APPROVED')) {
        return Promise.resolve({
          data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 },
        });
      }
      const list = params.requestedByMe ? mineList : forMeList;
      return Promise.resolve({
        data: {
          content: list,
          totalElements: list.length,
          totalPages: list.length === 0 ? 0 : 1,
          number: 0,
          size: 50,
        },
      });
    }
    // Bell summary call — no params. Default to all-zero counts; tests
    // that want to exercise the resolved-mine section override per-test.
    if (url === '/work-orders/approvals/count') {
      return Promise.resolve({
        data: {
          pendingForMe: 0,
          recentlyResolvedMine: 0,
        },
      });
    }
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });

  vi.mocked(apiClient.post).mockImplementation((url: string, body?: unknown) => {
    const match = /^\/work-orders\/approvals\/([^/]+)\/(approve|reject)$/.exec(url);
    if (!match) return Promise.reject(new Error(`Unmocked POST ${url}`));
    const [, id, action] = match;
    const before = forMeList.find((r) => r.id === id) ?? mineList.find((r) => r.id === id);
    if (!before) return Promise.reject(new Error(`No pending request ${id}`));
    forMeList = forMeList.filter((r) => r.id !== id);
    mineList = mineList.filter((r) => r.id !== id);
    const note = (body as { reason?: string })?.reason;
    return Promise.resolve({
      data: {
        ...before,
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        respondedAt: new Date().toISOString(),
        responseNote: note,
      },
    });
  });
}

async function openPopover() {
  const bell = screen.getByRole('button', { name: /approvals — \d+ pending/i });
  await userEvent.click(bell);
}

describe('ApprovalsBellPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forMeList = [];
    mineList = [];
    installApiMock();
  });

  it('renders the bell with a count badge but no panel until clicked', () => {
    renderWithProviders(<ApprovalsBellPopover badgeCount={3} />);

    // Bell button visible; count rendered in badge.
    expect(
      screen.getByRole('button', { name: /approvals — 3 pending/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Panel content is not in the DOM yet.
    expect(screen.queryByText(/view all in queue/i)).not.toBeInTheDocument();
  });

  it('opens the popover and auto-expands the first row with inline action controls', async () => {
    forMeList = [
      makeRequest('A', { firstName: 'Maria', lastName: 'Chen' }, { expiresInHours: 12 }),
      makeRequest('B', { firstName: 'Tanya', lastName: 'Reyes' }, { expiresInHours: 24 }),
    ];

    renderWithProviders(<ApprovalsBellPopover badgeCount={2} />);
    await openPopover();

    // Both rows render, sorted by expiry asc — Maria first (12h), Tanya second.
    await screen.findByText('Maria Chen');
    expect(screen.getByText('Tanya Reyes')).toBeInTheDocument();

    // Only Maria's row shows the inline action controls — the first row
    // auto-expands so the manager can act without an extra click.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
  });

  it('approves the expanded row, drops it from the list, and auto-advances to the next', async () => {
    forMeList = [
      makeRequest('A', { firstName: 'Maria', lastName: 'Chen' }, { expiresInHours: 12 }),
      makeRequest('B', { firstName: 'Tanya', lastName: 'Reyes' }, { expiresInHours: 24 }),
    ];

    renderWithProviders(<ApprovalsBellPopover badgeCount={2} />);
    await openPopover();

    await screen.findByText('Maria Chen');
    const approveBtn = screen.getByRole('button', { name: /^approve$/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
        '/work-orders/approvals/A/approve',
        {},
      );
    });

    // Maria is gone, Tanya is now the only row and is expanded — the
    // action buttons remain visible for the new top row.
    await waitFor(() => {
      expect(screen.queryByText('Maria Chen')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Tanya Reyes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  it('first reject click without a reason focuses the textarea and switches the placeholder hint', async () => {
    forMeList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<ApprovalsBellPopover badgeCount={1} />);
    await openPopover();

    await screen.findByText('Maria Chen');

    // Default placeholder is the "note to requester (required to reject)"
    // copy from the bell namespace.
    const textarea = screen.getByPlaceholderText(/note to requester/i);
    expect(textarea).toBeInTheDocument();

    const rejectBtn = screen.getByRole('button', { name: /^reject$/i });
    await userEvent.click(rejectBtn);

    // No mutation fired — empty reason short-circuits to focus + hint swap.
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();

    // Placeholder swaps to "Reason required to reject" (reuse of the
    // existing approvals.action.reasonRequired key).
    expect(
      screen.getByPlaceholderText(/reason required to reject/i),
    ).toBeInTheDocument();
    expect(textarea).toHaveFocus();
  });

  it('rejects with a typed reason and removes the row', async () => {
    forMeList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<ApprovalsBellPopover badgeCount={1} />);
    await openPopover();

    await screen.findByText('Maria Chen');

    const textarea = screen.getByPlaceholderText(/note to requester/i);
    await userEvent.click(textarea);
    await userEvent.type(textarea, 'Insufficient documentation');
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
        '/work-orders/approvals/A/reject',
        { reason: 'Insufficient documentation' },
      );
    });
  });

  it('shows the "all clear" empty state when no pending requests are assigned', async () => {
    forMeList = [];

    renderWithProviders(<ApprovalsBellPopover badgeCount={0} />);
    await openPopover();

    expect(await screen.findByText(/all clear/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no approvals waiting on you right now/i),
    ).toBeInTheDocument();
  });

  it('switches between For me and Mine sub-tabs and refetches against the new filter', async () => {
    forMeList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];
    mineList = [makeRequest('B', { firstName: 'Tanya', lastName: 'Reyes' })];

    renderWithProviders(<ApprovalsBellPopover badgeCount={1} />);
    await openPopover();

    // Default tab is "For me" — Maria is visible, Tanya isn't.
    await screen.findByText('Maria Chen');
    expect(screen.queryByText('Tanya Reyes')).not.toBeInTheDocument();

    // Switch to "Mine" — the popover refetches with requestedByMe=true
    // and Tanya's request shows up.
    await userEvent.click(screen.getByRole('button', { name: /^mine$/i }));

    await screen.findByText('Tanya Reyes');
    expect(screen.queryByText('Maria Chen')).not.toBeInTheDocument();
  });
});
