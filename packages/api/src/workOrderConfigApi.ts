import apiClient from './client';

// ===== Work Order Type (curated palette) =====
// Mirrors the roles shape: persisted `accentId` token, server-computed
// `colorsInUse` map on list/detail responses, 409 ACCENT_ID_TAKEN on
// conflicting writes. Description column is retained on the BE but no
// longer surfaced — omit it from request bodies on FE writes.
export interface WorkOrderType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  accentId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderTypeColorOwner {
  typeId: string;
  typeName: string;
}

export interface WorkOrderTypeListResponse {
  workOrderTypes: WorkOrderType[];
  colorsInUse: Record<string, WorkOrderTypeColorOwner>;
}

export interface CreateWorkOrderTypeRequest {
  name: string;
  code: string;
  accentId: string;
  sortOrder?: number;
}

export interface UpdateWorkOrderTypeRequest {
  name?: string;
  accentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AccentConflictBody {
  code?: 'ACCENT_ID_TAKEN';
  field?: 'accentId';
  conflictingTypeId?: string;
  conflictingTypeName?: string;
}

// ===== Work Item Status =====
// Mirrors the WorkOrderType shape: persisted `accentId` token, server-computed
// `colorsInUse` map on the list envelope, 409 ACCENT_ID_TAKEN on conflicting
// writes. `isSeeded` flags built-in statuses provisioned by the backend —
// their `code` is locked client-side and the backend rejects DELETE on them.
export type StatusCategory =
  | 'NOT_STARTED'
  | 'AWAITING_SCHEDULE'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

export const STATUS_CATEGORIES: StatusCategory[] = [
  'NOT_STARTED',
  'AWAITING_SCHEDULE',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED',
];

export interface WorkItemStatus {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  statusCategory: StatusCategory;
  isTerminal: boolean;
  isSeeded: boolean;
  accentId: string;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 422 payload returned by the BE when the caller tries to edit `code` on a
// seeded row, or DELETE a seeded row. The FE disables those affordances
// preemptively but we surface this shape if a race or stale state slips
// through.
export interface SeededRowImmutableBody {
  code?: 'SEEDED_ROW_IMMUTABLE';
  message?: string;
}

export interface CreateWorkItemStatusRequest {
  name: string;
  code: string;
  statusCategory: StatusCategory;
  accentId: string;
  isTerminal?: boolean;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateWorkItemStatusRequest {
  name?: string;
  statusCategory?: StatusCategory;
  accentId?: string;
  isTerminal?: boolean;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

// ===== Workflow (per-WOType transition graph) =====
// The container for an ordered transition graph keyed to a single
// work_order_type. Seeded workflows ship one per built-in WOType; tenant
// customizations land in the same row (no parallel "draft" workflow).
// `transitionCount` / `approvalGateCount` come from the list envelope so
// the row UI can summarize without fetching transitions[].
export interface WorkflowSummary {
  id: string;
  tenantId: string;
  workOrderTypeId: string;
  workOrderType: {
    id: string;
    name: string;
    code: string;
    accentId: string;
  };
  name: string;
  initialStatusId?: string | null;
  isSeeded: boolean;
  transitionCount: number;
  approvalGateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransition {
  id: string;
  tenantId: string;
  workflowId: string;
  fromStatusId: string;
  toStatusId: string;
  requiresApproval: boolean;
  approverCapabilities: string[];
  approvalExpiryHours?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow extends WorkflowSummary {
  transitions: WorkflowTransition[];
}

export interface CreateWorkflowTransitionRequest {
  fromStatusId: string;
  toStatusId: string;
  requiresApproval?: boolean;
  approverCapabilities?: string[];
  approvalExpiryHours?: number | null;
}

export interface UpdateWorkflowTransitionRequest {
  requiresApproval?: boolean;
  approverCapabilities?: string[];
  approvalExpiryHours?: number | null;
}

// ===== Workflow Config (per-tenant settings) =====
// `enforcementMode` replaced the old `enforceStatusWorkflow` boolean — OPEN
// lets work items transition freely, STRICT enforces the per-WOType workflow
// transition graph (and 422s undefined moves). `defaultApprovalExpiryHours`
// is the tenant-wide fallback when a transition doesn't specify its own.
export type DispatchBoardType = 'STATUS_BASED' | 'SCHEDULE_BASED';
export type EnforcementMode = 'OPEN' | 'STRICT';

export interface WorkflowConfig {
  id: string;
  tenantId: string;
  enforcementMode: EnforcementMode;
  defaultApprovalExpiryHours: number;
  defaultWorkOrderTypeId?: string | null;
  defaultWorkItemStatusId?: string | null;
  dispatchBoardType: DispatchBoardType;
  // True if the tenant has ever had an approval request created. Drives
  // the FE's "do we surface approvals at all?" gate together with
  // `enforcementMode`. Optional so old backends (pre-relevance-flags) keep
  // working — treat `undefined` as false.
  hasAnyApprovalRequests?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorkflowConfigRequest {
  enforcementMode?: EnforcementMode;
  defaultApprovalExpiryHours?: number;
  defaultWorkOrderTypeId?: string | null;
  defaultWorkItemStatusId?: string | null;
  dispatchBoardType?: DispatchBoardType;
}

const BASE = '/work-orders/config';

// ===== Work Order Types =====
// `list()` is the canonical envelope (carries colorsInUse for the picker).
// `getAll()` flattens to just the array for non-settings consumers that only
// need names/ids (work order forms, dispatch board, reports, etc.).
export const workOrderTypesApi = {
  list: async (): Promise<WorkOrderTypeListResponse> => {
    const response = await apiClient.get<WorkOrderTypeListResponse>(`${BASE}/types`);
    return response.data;
  },
  getAll: async (): Promise<WorkOrderType[]> => {
    const envelope = await workOrderTypesApi.list();
    return envelope.workOrderTypes;
  },
  create: async (request: CreateWorkOrderTypeRequest): Promise<WorkOrderType> => {
    const response = await apiClient.post<WorkOrderType>(`${BASE}/types`, request);
    return response.data;
  },
  update: async (id: string, request: UpdateWorkOrderTypeRequest): Promise<WorkOrderType> => {
    const response = await apiClient.patch<WorkOrderType>(`${BASE}/types/${id}`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/types/${id}`);
  },
  reorder: async (orderedIds: string[]): Promise<WorkOrderType[]> => {
    const response = await apiClient.post<WorkOrderType[]>(`${BASE}/types/reorder`, { orderedIds });
    return response.data;
  },
};

// ===== Division (name + code only) =====
// Description and color were dropped — divisions are a view-scope switcher,
// not a visual differentiator. If cross-division distinction is ever needed
// (rare), add a fresh `accentId` rather than reviving the column.
export interface Division {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDivisionRequest {
  name: string;
  code: string;
  sortOrder?: number;
}

export interface UpdateDivisionRequest {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export const divisionsApi = {
  getAll: async (): Promise<Division[]> => {
    const response = await apiClient.get<Division[]>(`${BASE}/divisions`);
    return response.data;
  },
  create: async (request: CreateDivisionRequest): Promise<Division> => {
    const response = await apiClient.post<Division>(`${BASE}/divisions`, request);
    return response.data;
  },
  update: async (id: string, request: UpdateDivisionRequest): Promise<Division> => {
    const response = await apiClient.patch<Division>(`${BASE}/divisions/${id}`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/divisions/${id}`);
  },
  reorder: async (orderedIds: string[]): Promise<Division[]> => {
    const response = await apiClient.post<Division[]>(`${BASE}/divisions/reorder`, { orderedIds });
    return response.data;
  },
};

// ===== Work Item Statuses =====
// The list endpoint returns a plain array — there is no envelope and no
// `colorsInUse` map (unlike work-order-types). Multiple statuses are
// allowed to share an `accentId`.
export const workItemStatusesApi = {
  getAll: async (): Promise<WorkItemStatus[]> => {
    const response = await apiClient.get<WorkItemStatus[]>(`${BASE}/item-statuses`);
    return response.data;
  },
  create: async (request: CreateWorkItemStatusRequest): Promise<WorkItemStatus> => {
    const response = await apiClient.post<WorkItemStatus>(`${BASE}/item-statuses`, request);
    return response.data;
  },
  update: async (id: string, request: UpdateWorkItemStatusRequest): Promise<WorkItemStatus> => {
    const response = await apiClient.patch<WorkItemStatus>(`${BASE}/item-statuses/${id}`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/item-statuses/${id}`);
  },
  reorder: async (orderedIds: string[]): Promise<WorkItemStatus[]> => {
    const response = await apiClient.post<WorkItemStatus[]>(`${BASE}/item-statuses/reorder`, { orderedIds });
    return response.data;
  },
};

// ===== Workflows (per-WOType transition graphs) =====
// Replaces the flat statusWorkflowsApi. One Workflow per (tenant, WOType);
// transitions are nested under their workflow. `resetToDefault` is only
// valid against seeded workflows — server returns 422 on custom ones.
export const workflowsApi = {
  getAll: async (): Promise<WorkflowSummary[]> => {
    const response = await apiClient.get<WorkflowSummary[]>(`${BASE}/workflows`);
    return response.data;
  },
  getById: async (id: string): Promise<Workflow> => {
    const response = await apiClient.get<Workflow>(`${BASE}/workflows/${id}`);
    return response.data;
  },
  createTransition: async (
    workflowId: string,
    request: CreateWorkflowTransitionRequest,
  ): Promise<WorkflowTransition> => {
    const response = await apiClient.post<WorkflowTransition>(
      `${BASE}/workflows/${workflowId}/transitions`,
      request,
    );
    return response.data;
  },
  updateTransition: async (
    workflowId: string,
    transitionId: string,
    request: UpdateWorkflowTransitionRequest,
  ): Promise<WorkflowTransition> => {
    const response = await apiClient.patch<WorkflowTransition>(
      `${BASE}/workflows/${workflowId}/transitions/${transitionId}`,
      request,
    );
    return response.data;
  },
  deleteTransition: async (workflowId: string, transitionId: string): Promise<void> => {
    await apiClient.delete(`${BASE}/workflows/${workflowId}/transitions/${transitionId}`);
  },
  resetToDefault: async (workflowId: string): Promise<Workflow> => {
    const response = await apiClient.post<Workflow>(
      `${BASE}/workflows/${workflowId}/reset-to-default`,
    );
    return response.data;
  },
};

// ===== Workflow Config =====
export const workflowConfigApi = {
  get: async (): Promise<WorkflowConfig> => {
    const response = await apiClient.get<WorkflowConfig>(`${BASE}/workflow`);
    return response.data;
  },
  update: async (request: UpdateWorkflowConfigRequest): Promise<WorkflowConfig> => {
    const response = await apiClient.patch<WorkflowConfig>(`${BASE}/workflow`, request);
    return response.data;
  },
};
