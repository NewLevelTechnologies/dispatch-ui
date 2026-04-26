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

// Slim shape returned by the list endpoint — excludes workItems and other detail-only fields
// to keep the list payload small. Use getById() for the full WorkOrder.
export interface WorkOrderSummary {
  id: string;
  workOrderNumber?: string;
  customerId: string;
  serviceLocationId: string;

  // Tenant taxonomy
  workOrderTypeId?: string | null;
  divisionId?: string | null;

  // Lifecycle / progress
  lifecycleState: LifecycleState;
  progressCategory: ProgressCategory;

  // Visibility
  archivedAt?: string | null;

  // Cancellation summary (if cancelled)
  cancelledAt?: string | null;

  priority: WorkOrderPriority;
  scheduledDate?: string | null;
  completedDate?: string | null;
  description?: string | null;
  customerOrderNumber?: string | null;

  // Enriched display fields. Site-contact and other extras are only populated by
  // the detail endpoint, but typed as optional here so the same shape is usable
  // on the list page without casts.
  customer?: {
    id: string;
    name: string;
    email?: string;
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

export interface WorkOrder extends WorkOrderSummary {
  tenantId?: string;

  // Detail-only fields
  cancellationReason?: string | null;
  cancelledByUserId?: string | null;
  createdByUserId?: string;
  internalNotes?: string | null;
  workItems?: WorkItemResponse[];
}

// Spring Data Page<T> response wrapper
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // current page index, 0-based
  size: number;
  first?: boolean;
  last?: boolean;
}

export type WorkOrderSortField = 'scheduledDate' | 'createdAt' | 'workOrderNumber' | 'priority';
export type SortDirection = 'asc' | 'desc';

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
  // Free-text search across workOrderNumber, customerOrderNumber, customer name/phone,
  // service location name/address, site contact name, and description.
  search?: string;

  // Lifecycle / progress
  lifecycleState?: LifecycleState;
  progressCategory?: ProgressCategory;

  // Tenant taxonomy
  workOrderTypeId?: string;
  divisionId?: string;
  dispatchRegionId?: string;

  // At least one work item must be in this status (specific tenant status, not a category)
  workItemStatusId?: string;

  // Customer scope
  customerId?: string;

  // Scheduled date range — ISO yyyy-mm-dd. From is inclusive at 00:00,
  // To is exclusive at 00:00 of the next day (handled server-side).
  scheduledDateFrom?: string;
  scheduledDateTo?: string;

  // Visibility
  includeArchived?: boolean;

  // Pagination — backend wraps the response as Page<WorkOrderSummary>.
  // page is 0-based; default size is 50 if omitted.
  page?: number;
  size?: number;

  // Sort — whitelist enforced server-side: scheduledDate, createdAt, workOrderNumber, priority
  sort?: `${WorkOrderSortField},${SortDirection}`;
}

function cleanParams(params?: ListWorkOrdersParams): Record<string, string | number | boolean> {
  if (!params) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export const workOrderApi = {
  getAll: async (params?: ListWorkOrdersParams): Promise<Page<WorkOrderSummary>> => {
    const response = await apiClient.get<Page<WorkOrderSummary>>('/work-orders', { params: cleanParams(params) });
    return response.data;
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.get<WorkOrder>(`/work-orders/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string, params?: Omit<ListWorkOrdersParams, 'customerId'>): Promise<Page<WorkOrderSummary>> => {
    const response = await apiClient.get<Page<WorkOrderSummary>>('/work-orders', {
      params: cleanParams({ customerId, ...params }),
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
