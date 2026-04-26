// Work Order API Client
import apiClient from './client';

export type LifecycleState = 'ACTIVE' | 'CANCELLED';

export const LifecycleState = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;

export type ProgressCategory = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';

export const ProgressCategory = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const WorkOrderPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type WorkItemType = 'LABOR' | 'PARTS' | 'SERVICE' | 'OTHER';

export interface WorkItemResponse {
  id: string;
  itemType: WorkItemType;
  statusId: string | null;
  statusCategory: ProgressCategory;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  tenantId?: string;
  customerId: string;
  serviceLocationId: string;

  // Tenant taxonomy (Phase 4)
  workOrderTypeId?: string | null;
  divisionId?: string | null;

  // Replaces old `status`
  lifecycleState: LifecycleState;
  progressCategory: ProgressCategory;

  // Visibility flag — null means visible in default views
  archivedAt?: string | null;

  // Cancellation metadata — populated only when lifecycleState = CANCELLED
  cancellationReason?: string | null;
  cancelledByUserId?: string | null;
  cancelledAt?: string | null;

  priority: WorkOrderPriority;
  scheduledDate?: string | null;
  completedDate?: string | null;
  description?: string | null;
  customerOrderNumber?: string | null;
  createdByUserId?: string;
  internalNotes?: string | null;

  workItems?: WorkItemResponse[];

  // Enriched response fields
  customer?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  serviceLocation?: {
    id: string;
    customerId?: string;
    locationName?: string;
    address: {
      streetAddress: string;
      city: string;
      state: string;
      zipCode: string;
    };
    siteContactName?: string;
    siteContactPhone?: string;
    siteContactEmail?: string;
    status?: string;
  };

  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkItemRequest {
  itemType: WorkItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  statusId?: string;
}

export interface CreateWorkOrderRequest {
  customerId: string;
  serviceLocationId: string;
  workOrderTypeId?: string;
  divisionId?: string;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  customerOrderNumber?: string;
  description?: string;
  internalNotes?: string;
  workItems?: CreateWorkItemRequest[];
}

// `status` is no longer updatable. Use /cancel for cancellation; progress is derived.
export interface UpdateWorkOrderRequest {
  workOrderTypeId?: string | null;
  divisionId?: string | null;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  customerOrderNumber?: string;
  internalNotes?: string;
}

export interface CancelWorkOrderRequest {
  reason: string;
}

export interface TransitionWorkItemStatusRequest {
  statusId: string;
  reason?: string;
}

export interface ListWorkOrdersParams {
  lifecycleState?: LifecycleState;
  progressCategory?: ProgressCategory;
  customerId?: string;
  includeArchived?: boolean;
}

export const workOrderApi = {
  getAll: async (params?: ListWorkOrdersParams): Promise<WorkOrder[]> => {
    const response = await apiClient.get<WorkOrder[]>('/work-orders', { params });
    return response.data;
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.get<WorkOrder>(`/work-orders/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string, params?: Omit<ListWorkOrdersParams, 'customerId'>): Promise<WorkOrder[]> => {
    const response = await apiClient.get<WorkOrder[]>('/work-orders', {
      params: { customerId, ...params },
    });
    return response.data;
  },

  getByNumber: async (workOrderNumber: string): Promise<WorkOrder> => {
    // Strip "WO-" prefix if user included it
    const number = workOrderNumber.replace(/^WO-/i, '');
    const response = await apiClient.get<WorkOrder>(`/work-orders/by-number/WO-${number}`);
    return response.data;
  },

  create: async (request: CreateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>('/work-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.patch<WorkOrder>(`/work-orders/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${id}`);
  },

  cancel: async (id: string, request: CancelWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/cancel`, request);
    return response.data;
  },

  archive: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/archive`);
    return response.data;
  },

  unarchive: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>(`/work-orders/${id}/unarchive`);
    return response.data;
  },

  updateWorkItemStatus: async (
    workOrderId: string,
    workItemId: string,
    request: TransitionWorkItemStatusRequest
  ): Promise<WorkItemResponse> => {
    const response = await apiClient.patch<WorkItemResponse>(
      `/work-orders/${workOrderId}/work-items/${workItemId}/status`,
      request
    );
    return response.data;
  },
};

export default workOrderApi;
