import apiClient from './client';

// ===== Shared taxonomy types (Work Order Types & Divisions) =====
export interface TaxonomyItem {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxonomyItemRequest {
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateTaxonomyItemRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

// ===== Work Item Status =====
export type StatusCategory =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED';

export const STATUS_CATEGORIES: StatusCategory[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'CANCELLED',
];

export interface WorkItemStatus {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  statusCategory: StatusCategory;
  isTerminal: boolean;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkItemStatusRequest {
  name: string;
  code: string;
  statusCategory: StatusCategory;
  isTerminal?: boolean;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateWorkItemStatusRequest {
  name?: string;
  statusCategory?: StatusCategory;
  isTerminal?: boolean;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

// ===== Status Workflow =====
export interface StatusWorkflowRule {
  id: string;
  tenantId: string;
  fromStatusId: string;
  toStatusId: string;
  isAllowed: boolean;
  requiresApproval: boolean;
  approvalRole?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStatusWorkflowRequest {
  fromStatusId: string;
  toStatusId: string;
  isAllowed?: boolean;
  requiresApproval?: boolean;
  approvalRole?: string | null;
}

// ===== Workflow Config (per-tenant settings) =====
export type DispatchBoardType = 'STATUS_BASED' | 'SCHEDULE_BASED';

export interface WorkflowConfig {
  id: string;
  tenantId: string;
  enforceStatusWorkflow: boolean;
  defaultWorkOrderTypeId?: string | null;
  defaultWorkItemStatusId?: string | null;
  dispatchBoardType: DispatchBoardType;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorkflowConfigRequest {
  enforceStatusWorkflow?: boolean;
  defaultWorkOrderTypeId?: string | null;
  defaultWorkItemStatusId?: string | null;
  dispatchBoardType?: DispatchBoardType;
}

const BASE = '/work-orders/config';

// ===== Work Order Types =====
export const workOrderTypesApi = {
  getAll: async (): Promise<TaxonomyItem[]> => {
    const response = await apiClient.get<TaxonomyItem[]>(`${BASE}/types`);
    return response.data;
  },
  create: async (request: CreateTaxonomyItemRequest): Promise<TaxonomyItem> => {
    const response = await apiClient.post<TaxonomyItem>(`${BASE}/types`, request);
    return response.data;
  },
  update: async (id: string, request: UpdateTaxonomyItemRequest): Promise<TaxonomyItem> => {
    const response = await apiClient.patch<TaxonomyItem>(`${BASE}/types/${id}`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/types/${id}`);
  },
  reorder: async (orderedIds: string[]): Promise<TaxonomyItem[]> => {
    const response = await apiClient.post<TaxonomyItem[]>(`${BASE}/types/reorder`, { orderedIds });
    return response.data;
  },
};

// ===== Divisions =====
export const divisionsApi = {
  getAll: async (): Promise<TaxonomyItem[]> => {
    const response = await apiClient.get<TaxonomyItem[]>(`${BASE}/divisions`);
    return response.data;
  },
  create: async (request: CreateTaxonomyItemRequest): Promise<TaxonomyItem> => {
    const response = await apiClient.post<TaxonomyItem>(`${BASE}/divisions`, request);
    return response.data;
  },
  update: async (id: string, request: UpdateTaxonomyItemRequest): Promise<TaxonomyItem> => {
    const response = await apiClient.patch<TaxonomyItem>(`${BASE}/divisions/${id}`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/divisions/${id}`);
  },
  reorder: async (orderedIds: string[]): Promise<TaxonomyItem[]> => {
    const response = await apiClient.post<TaxonomyItem[]>(`${BASE}/divisions/reorder`, { orderedIds });
    return response.data;
  },
};

// ===== Work Item Statuses =====
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

// ===== Status Workflows =====
export const statusWorkflowsApi = {
  getAll: async (): Promise<StatusWorkflowRule[]> => {
    const response = await apiClient.get<StatusWorkflowRule[]>(`${BASE}/status-workflows`);
    return response.data;
  },
  create: async (request: CreateStatusWorkflowRequest): Promise<StatusWorkflowRule> => {
    const response = await apiClient.post<StatusWorkflowRule>(`${BASE}/status-workflows`, request);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/status-workflows/${id}`);
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
