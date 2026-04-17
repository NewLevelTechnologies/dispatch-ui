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

export interface WorkOrder {
  id: string;
  customerId: string;
  serviceLocationId: string;
  status: WorkOrderStatus;
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  notes?: string;
  totalAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkOrderRequest {
  customerId: string;
  serviceLocationId: string;
  status?: WorkOrderStatus;
  scheduledDate?: string;
  description?: string;
  notes?: string;
  totalAmount?: number;
}

export interface UpdateWorkOrderRequest {
  customerId?: string;
  status?: WorkOrderStatus;
  scheduledDate?: string;
  completedDate?: string;
  description?: string;
  notes?: string;
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

  create: async (request: CreateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.post<WorkOrder>('/work-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdateWorkOrderRequest): Promise<WorkOrder> => {
    const response = await apiClient.put<WorkOrder>(`/work-orders/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${id}`);
  },
};

export default workOrderApi;
