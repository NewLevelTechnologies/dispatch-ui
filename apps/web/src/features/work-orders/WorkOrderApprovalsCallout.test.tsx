import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import WorkOrderApprovalsCallout from './WorkOrderApprovalsCallout';
import { apiClient } from '../../api/setup';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import type { ApprovalRequest } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

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

function makeRequest(
  id: string,
  requester: { firstName: string | null; lastName: string | null },
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
      initials: 'XX',
    },
    requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  };
}

// Module-level list so closures in the mock see updates between requests
// within a single test.
let pendingList: ApprovalRequest[] = [];

function installApiMock() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
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
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });

  vi.mocked(apiClient.post).mockImplementation((url: string, body?: unknown) => {
    const match = /^\/work-orders\/approvals\/([^/]+)\/(approve|reject)$/.exec(url);
    if (!match) return Promise.reject(new Error(`Unmocked POST ${url}`));
    const [, id, action] = match;
    const before = pendingList.find((r) => r.id === id);
    if (!before) return Promise.reject(new Error(`No pending request ${id}`));
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

describe('WorkOrderApprovalsCallout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingList = [];
    installApiMock();
    vi.mocked(useCurrentUser).mockReturnValue({
      data: approverUser,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);
  });

  it('renders nothing when there are no pending approvals', async () => {
    pendingList = [];
    const { container } = renderWithProviders(
      <WorkOrderApprovalsCallout workOrderId="wo-1" />,
    );

    await waitFor(() => {
      expect(vi.mocked(apiClient.get)).toHaveBeenCalled();
    });
    // Component returns null when the list is empty — nothing renders.
    expect(container.firstChild).toBeNull();
  });

  it('renders requester, transition, and inline action buttons when the user can approve', async () => {
    pendingList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    // Title and requester copy render once the query resolves.
    expect(await screen.findByText(/approval pending/i)).toBeInTheDocument();
    expect(screen.getByText(/Maria Chen/)).toBeInTheDocument();

    // canApprove is true → both inline action buttons render.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();

    // Single pending → singular "View in queue" link variant.
    expect(screen.getByRole('link', { name: /view in queue/i })).toHaveAttribute(
      'href',
      '/approvals?tab=pending&wo=wo-1',
    );
  });

  it('uses the "view all in queue" plural link when more than one approval is pending', async () => {
    pendingList = [
      makeRequest('A', { firstName: 'Maria', lastName: 'Chen' }, { expiresInHours: 12 }),
      makeRequest('B', { firstName: 'Tanya', lastName: 'Reyes' }, { expiresInHours: 24 }),
      makeRequest('C', { firstName: 'Daniel', lastName: 'Park' }, { expiresInHours: 36 }),
    ];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    // Three pending → "View all 3 in queue →"
    expect(await screen.findByRole('link', { name: /view all 3 in queue/i })).toBeInTheDocument();
  });

  it('falls back to "Unknown user" when the requester name is missing', async () => {
    pendingList = [makeRequest('A', { firstName: null, lastName: null })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    expect(await screen.findByText(/unknown user/i)).toBeInTheDocument();
  });

  it('approves and clears the inline action when the approve button is clicked', async () => {
    pendingList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    const approveBtn = await screen.findByRole('button', { name: /^approve$/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
        '/work-orders/approvals/A/approve',
        {},
      );
    });
  });

  it('opens the reject dialog and submits with the typed reason', async () => {
    pendingList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    await userEvent.click(await screen.findByRole('button', { name: /^reject$/i }));

    // Alert dialog is open — title and textarea visible.
    expect(await screen.findByText(/reject this approval/i)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/a note to maria/i);

    await userEvent.type(textarea, 'Insufficient documentation');

    // The alert's submit button enables once the reason is non-empty;
    // the inline trigger button is still in the DOM. Pick the one inside
    // the dialog so we click the submit rather than re-triggering.
    const dialog = await screen.findByRole('dialog');
    const { getByRole } = within(dialog);
    await userEvent.click(getByRole('button', { name: /^reject$/i }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
        '/work-orders/approvals/A/reject',
        { reason: 'Insufficient documentation' },
      );
    });
  });

  it('cancels the reject dialog without firing a mutation', async () => {
    pendingList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    await userEvent.click(await screen.findByRole('button', { name: /^reject$/i }));
    await screen.findByText(/reject this approval/i);

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // No mutation fired.
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
  });

  it('hides inline action buttons when the user lacks the approver capability', async () => {
    // Override useCurrentUser to a user without the approver capability —
    // canApprove is false, so the Approve/Reject buttons must not render.
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { ...approverUser, capabilities: [] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);

    pendingList = [makeRequest('A', { firstName: 'Maria', lastName: 'Chen' })];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    expect(await screen.findByText(/approval pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
  });

  it('hides inline action buttons when the embed has no approver capabilities (legacy backend)', async () => {
    // Older backends may not embed approverCapabilities — default-deny:
    // even a user with the cap shouldn't see inline actions because we
    // can't safely tell whether they're in the approver pool.
    const legacy = makeRequest('A', { firstName: 'Maria', lastName: 'Chen' });
    legacy.transition.approverCapabilities = [];
    pendingList = [legacy];

    renderWithProviders(<WorkOrderApprovalsCallout workOrderId="wo-1" />);

    expect(await screen.findByText(/approval pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    // The "view in queue" link is also gated on canApprove || additionalCount,
    // so with one pending + no canApprove it shouldn't render either.
    expect(screen.queryByRole('link', { name: /view in queue/i })).not.toBeInTheDocument();
  });
});
