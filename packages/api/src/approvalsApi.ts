import apiClient from './client';

// Work-item transition approval requests created by the workflow engine
// (see dispatch-api workflow engine handoff). The list endpoint embeds the
// transition, workItem, workOrder, and requester context so the inbox UI
// can render rows without N+1 fetches.

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

// Embedded refs are tolerant of cache misses on the server side: name /
// accentId / customerName may come back null when the upstream record has
// been deleted or hasn't propagated through the cross-service cache yet.
// Components that consume these fields render "Unknown" / "gray" rather
// than crashing.

export interface ApprovalStatusRef {
  id: string;
  name: string | null;
  accentId: string | null;
}

export interface ApprovalTransitionRef {
  id: string;
  fromStatus: ApprovalStatusRef;
  toStatus: ApprovalStatusRef;
  workflowName: string | null;
  /** Capabilities allowed to approve. Server fills with the generic
   *  ['APPROVE_WORK_ITEM_TRANSITIONS'] when the underlying transition row
   *  has no explicit list (or has been deleted), so the FE can do a pure
   *  intersection check with the caller's caps. */
  approverCapabilities: string[];
}

export interface ApprovalWorkItemRef {
  id: string;
  name: string | null;
}

export interface ApprovalWorkOrderRef {
  id: string;
  displayId: string;
  customerName: string | null;
  serviceLocation?: string | null;
}

export interface ApprovalUserRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  initials: string;
}

export interface ApprovalRequest {
  id: string;
  status: ApprovalStatus;
  transition: ApprovalTransitionRef;
  workItem: ApprovalWorkItemRef;
  workOrder: ApprovalWorkOrderRef;
  requester: ApprovalUserRef;
  requestedAt: string;
  expiresAt: string;
  reason?: string;
  respondedAt?: string;
  respondedBy?: { id: string; firstName: string | null; lastName: string | null };
  responseNote?: string;
}

export interface ListApprovalsParams {
  status?: ApprovalStatus | ApprovalStatus[];
  assignedToMe?: boolean;
  requestedByMe?: boolean;
  workOrderId?: string;
  page?: number;
  size?: number;
}

export interface ApprovalCountParams {
  status?: ApprovalStatus | ApprovalStatus[];
  assignedToMe?: boolean;
  requestedByMe?: boolean;
  workOrderId?: string;
}

// Finalized envelope returned by GET /work-orders/approvals/count.
// `pendingForMe` = pending approvals where the caller is in the approver
// pool. `recentlyResolvedMine` = the caller's own requests resolved in
// the last 24h that they haven't seen yet (server window + seen_at gate).
export interface ApprovalsCountResponse {
  pendingForMe: number;
  recentlyResolvedMine: number;
}

// Re-export under the legacy name for the bell call site that wanted a
// more descriptive type alias. Same shape — keeps the two consumers
// (badge + Mine-tab section) intention-revealing without two types.
export type ApprovalsBellSummary = ApprovalsCountResponse;

// Spring Data Page<T> envelope — same shape as GET /work-orders. The list
// endpoint returns this; callers that don't paginate get the first page
// flattened via `list()` and the page envelope itself via `listPage()`.
export interface ApprovalsPage {
  content: ApprovalRequest[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first?: boolean;
  last?: boolean;
}

export interface ApproveApprovalRequest {
  reason?: string;
}

export interface RejectApprovalRequest {
  reason: string;
}

function toQuery(params: ListApprovalsParams | ApprovalCountParams | undefined): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  if (params.status) {
    out.status = Array.isArray(params.status) ? params.status.join(',') : params.status;
  }
  if (params.assignedToMe) out.assignedToMe = true;
  if (params.requestedByMe) out.requestedByMe = true;
  const wo = (params as ListApprovalsParams).workOrderId;
  if (wo) out.workOrderId = wo;
  const p = (params as ListApprovalsParams).page;
  if (p != null) out.page = p;
  const s = (params as ListApprovalsParams).size;
  if (s != null) out.size = s;
  return out;
}

export const approvalsApi = {
  listPage: async (params?: ListApprovalsParams): Promise<ApprovalsPage> => {
    const response = await apiClient.get<ApprovalsPage>('/work-orders/approvals', { params: toQuery(params) });
    return response.data;
  },
  // Convenience flatten for the inbox surfaces — they don't paginate
  // through pages yet; v1 reads the first page (default size 50) and
  // shows it. Future paging-aware callers should use listPage.
  list: async (params?: ListApprovalsParams): Promise<ApprovalRequest[]> => {
    const page = await approvalsApi.listPage(params);
    return page.content;
  },
  getById: async (id: string): Promise<ApprovalRequest> => {
    const response = await apiClient.get<ApprovalRequest>(`/work-orders/approvals/${id}`);
    return response.data;
  },
  getCount: async (params?: ApprovalCountParams): Promise<number> => {
    const response = await apiClient.get<ApprovalsCountResponse>(
      '/work-orders/approvals/count',
      { params: toQuery(params) },
    );
    return response.data.pendingForMe;
  },
  // Full bell-summary envelope. Used by the topbar bell to drive both
  // the badge math (pendingForMe + recentlyResolvedMine) and the Mine
  // tab's "Recently resolved" section gate.
  getBellSummary: async (): Promise<ApprovalsBellSummary> => {
    const response = await apiClient.get<ApprovalsBellSummary>('/work-orders/approvals/count');
    return response.data;
  },
  // Mark a single resolved request as seen by the requester. 204; safe
  // to call multiple times. Decrements `recentlyResolvedMine` on the
  // next poll.
  markSeen: async (id: string): Promise<void> => {
    await apiClient.post(`/work-orders/approvals/${id}/mark-seen`);
  },
  approve: async (id: string, request: ApproveApprovalRequest = {}): Promise<ApprovalRequest> => {
    const response = await apiClient.post<ApprovalRequest>(`/work-orders/approvals/${id}/approve`, request);
    return response.data;
  },
  reject: async (id: string, request: RejectApprovalRequest): Promise<ApprovalRequest> => {
    const response = await apiClient.post<ApprovalRequest>(`/work-orders/approvals/${id}/reject`, request);
    return response.data;
  },
};

export default approvalsApi;
