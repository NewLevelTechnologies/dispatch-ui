import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ApprovalsPage from './ApprovalsPage';
import { apiClient } from '../api/setup';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { ApprovalRequest } from '../api/setup';

vi.mock('@dispatch/api/src/client');

// The global test setup pins useCurrentUser to a stub user without the
// approver capability. Each test in this file overrides that to a user
// who DOES hold it, so the inbox action pane renders.
const approverUser = {
  id: 'me-1',
  tenantId: 't-1',
  cognitoSub: 'cognito-me',
  email: 'sam@example.com',
  firstName: 'Sam',
  lastName: 'Approver',
  enabled: true,
  capabilities: ['APPROVE_WORK_ITEM_TRANSITIONS'],
  roles: [{ id: 'r-1', name: 'Field Supervisor' }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Two behaviors are guarded here because they're the ones most likely to
// silently regress as the inbox grows feature surface:
//   1. Approve auto-advances to the next pending row, and lands on the
//      sole remaining item when only one is left.
//   2. Reject requires a non-empty reason — the first button click is a
//      "focus the textarea" affordance, not a submit. Only the second
//      click (with text present) fires the mutation.

function makeRequest(
  id: string,
  requester: { firstName: string; lastName: string },
  options: { expiresInHours?: number } = {},
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
      customerName: `Customer ${id}`,
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

// Module-level so the mocked apiClient closures see updates between
// requests within a single test.
let pendingList: ApprovalRequest[] = [];

function installApiMock() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/users/me') return Promise.resolve({ data: approverUser });
    // Workflow config — used by the relevance gate and the WO detail
    // page. STRICT keeps the approvals surface visible in the page body.
    if (url === '/work-orders/config/workflow') {
      return Promise.resolve({
        data: {
          id: 'cfg-1',
          tenantId: 't-1',
          enforcementMode: 'STRICT',
          defaultApprovalExpiryHours: 48,
          dispatchBoardType: 'STATUS_BASED',
          hasAnyApprovalRequests: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      });
    }
    if (url === '/work-orders/approvals' || url.startsWith('/work-orders/approvals?')) {
      return Promise.resolve({
        data: {
          content: pendingList,
          totalElements: pendingList.length,
          totalPages: pendingList.length === 0 ? 0 : 1,
          number: 0,
          size: 50,
        },
      });
    }
    if (url === '/work-orders/approvals/count' || url.startsWith('/work-orders/approvals/count?')) {
      return Promise.resolve({
        data: { pendingForMe: pendingList.length, recentlyResolvedMine: 0 },
      });
    }
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });

  vi.mocked(apiClient.post).mockImplementation((url: string, body?: unknown) => {
    const match = /^\/work-orders\/approvals\/([^/]+)\/(approve|reject)$/.exec(url);
    if (!match) return Promise.reject(new Error(`Unmocked POST ${url}`));
    const [, id, action] = match;
    const before = pendingList.find((r) => r.id === id);
    if (!before) return Promise.reject(new Error(`No pending request ${id}`));
    // Backend removes the resolved request from the pending set; the next
    // GET /approvals refetch will reflect that.
    pendingList = pendingList.filter((r) => r.id !== id);
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

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingList = [];
    installApiMock();
    // Override the global useCurrentUser stub so the action pane renders.
    vi.mocked(useCurrentUser).mockReturnValue({
      data: approverUser,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);
  });

  describe('approve auto-advance', () => {
    it('advances selection to the next pending row, and lands on the only one left after a second approve', async () => {
      // Three pending sorted by expiresAt ascending — Maria (12h) is most
      // urgent and auto-selected on load, then Tanya (24h), then Daniel (36h).
      pendingList = [
        makeRequest('A', { firstName: 'Maria', lastName: 'Chen' }, { expiresInHours: 12 }),
        makeRequest('B', { firstName: 'Tanya', lastName: 'Reyes' }, { expiresInHours: 24 }),
        makeRequest('C', { firstName: 'Daniel', lastName: 'Park' }, { expiresInHours: 36 }),
      ];

      renderWithProviders(<ApprovalsPage />, { initialPath: '/approvals' });

      // Auto-selection lands on Maria, and the action pane is visible
      // because the override grants APPROVE_WORK_ITEM_TRANSITIONS.
      await screen.findByText('Maria Chen requested an approval');
      const approveBtn = await screen.findByRole('button', { name: /^approve$/i });

      // Approve Maria.
      await userEvent.click(approveBtn);

      // Maria's request is gone from the detail pane and Tanya is now
      // selected. The list refetch has also dropped Maria's row.
      await waitFor(() => {
        expect(
          screen.queryByText('Maria Chen requested an approval'),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByText('Tanya Reyes requested an approval'),
      ).toBeInTheDocument();

      // Approve again → only Daniel should remain, and the detail pane
      // should land on him.
      await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));

      await waitFor(() => {
        expect(
          screen.queryByText('Tanya Reyes requested an approval'),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByText('Daniel Park requested an approval'),
      ).toBeInTheDocument();
    });
  });

  describe('reject requires reason', () => {
    it('first click focuses the textarea without submitting; second click after typing fires the mutation', async () => {
      pendingList = [
        makeRequest('A', { firstName: 'Maria', lastName: 'Chen' }),
      ];

      renderWithProviders(<ApprovalsPage />, { initialPath: '/approvals' });

      await screen.findByText('Maria Chen requested an approval');
      // Wait for the action pane to mount (depends on the currentUser
      // query resolving with the approver capability).
      const rejectBtn = await screen.findByRole('button', { name: /^reject$/i });

      // ActionPane shows the optional-reason hint initially.
      expect(
        screen.getByText(
          /add a note \(optional on approve, required on reject\)/i,
        ),
      ).toBeInTheDocument();

      // First click with an empty textarea — no mutation, label switches
      // to "Reason required", textarea is now focused.
      await userEvent.click(rejectBtn);

      expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
      expect(
        screen.getByText(/reason required to reject/i),
      ).toBeInTheDocument();
      const textarea = screen.getByPlaceholderText(
        /a note to maria — visible in the audit log…/i,
      );
      expect(textarea).toHaveFocus();

      // Type a reason and click again — now the mutation fires with the
      // trimmed reason in the body.
      await userEvent.type(textarea, 'Insufficient documentation');
      await userEvent.click(rejectBtn);

      await waitFor(() => {
        expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
          '/work-orders/approvals/A/reject',
          { reason: 'Insufficient documentation' },
        );
      });
    });
  });
});
