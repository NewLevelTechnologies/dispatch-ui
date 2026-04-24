// Work Order API Client
import apiClient from './client';

export type WorkOrderStatus = 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const WorkOrderStatus = {
  PENDING: 'PENDING',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
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

export interface WorkOrder {
  id: string;
  workOrderNumber?: string; // e.g., "WO-00001" - display this prominently
  customerId: string;
  serviceLocationId: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  customerOrderNumber?: string;
  internalNotes?: string;
  createdByUserId?: string;
  totalAmount?: number;
  createdAt: string;
  updatedAt: string;
  // Enriched response fields from backend
  customer?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  serviceLocation?: {
    id: string;
    locationName?: string;
    address: {
      streetAddress: string;
      city: string;
      state: string;
      zipCode: string;
    };
    siteContactName?: string;
    siteContactPhone?: string;
  };
}

export interface CreateWorkOrderRequest {
  customerId: string;
  serviceLocationId: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  description?: string;
  customerOrderNumber?: string;
  internalNotes?: string;
  totalAmount?: number;
}

export interface UpdateWorkOrderRequest {
  customerId?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  customerOrderNumber?: string;
  internalNotes?: string;
  totalAmount?: number;
}

export const workOrderApi = {
  getAll: async (): Promise<WorkOrder[]> => {
    const response = await apiClient.get<WorkOrder[]>('/work-orders');
    return response.data;
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const response = await apiClient.get<WorkOrder>(`/work-orders/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string): Promise<WorkOrder[]> => {
    const response = await apiClient.get<WorkOrder[]>(`/work-orders/customer/${customerId}`);
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
};

export default workOrderApi;
