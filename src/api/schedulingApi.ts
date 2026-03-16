// Scheduling API Client
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://dev.api.dispatch.newleveltech.net/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to all requests
api.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    } catch (error) {
      console.error('Error fetching auth session:', error);
      return Promise.reject(error);
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ========== DISPATCHES ==========

export interface Dispatch {
  id: string;
  tenantId: string;
  workOrderId: string;
  assignedUserId: string;
  scheduledDate: string;
  estimatedDuration?: number;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDispatchRequest {
  workOrderId: string;
  assignedUserId: string;
  scheduledDate: string;
  estimatedDuration?: number;
  notes?: string;
}

export interface UpdateDispatchRequest {
  assignedUserId?: string;
  scheduledDate?: string;
  estimatedDuration?: number;
  status?: string;
  notes?: string;
}

export const dispatchesApi = {
  getAll: async (params?: {
    userId?: string;
    workOrderId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Dispatch[]> => {
    const response = await api.get<Dispatch[]>('/scheduling/dispatches', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Dispatch> => {
    const response = await api.get<Dispatch>(`/scheduling/dispatches/${id}`);
    return response.data;
  },

  create: async (request: CreateDispatchRequest): Promise<Dispatch> => {
    const response = await api.post<Dispatch>('/scheduling/dispatches', request);
    return response.data;
  },

  update: async (id: string, request: UpdateDispatchRequest): Promise<Dispatch> => {
    const response = await api.put<Dispatch>(`/scheduling/dispatches/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/scheduling/dispatches/${id}`);
  },
};

// ========== AVAILABILITY ==========

export interface Availability {
  id: string;
  tenantId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAvailabilityRequest {
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  reason?: string;
  notes?: string;
}

export interface UpdateAvailabilityRequest {
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  reason?: string;
  notes?: string;
}

export const availabilityApi = {
  getAll: async (params?: {
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Availability[]> => {
    const response = await api.get<Availability[]>('/scheduling/availability', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Availability> => {
    const response = await api.get<Availability>(`/scheduling/availability/${id}`);
    return response.data;
  },

  create: async (request: CreateAvailabilityRequest): Promise<Availability> => {
    const response = await api.post<Availability>('/scheduling/availability', request);
    return response.data;
  },

  update: async (id: string, request: UpdateAvailabilityRequest): Promise<Availability> => {
    const response = await api.put<Availability>(`/scheduling/availability/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/scheduling/availability/${id}`);
  },
};

// ========== RECURRING ORDERS ==========

export interface RecurringOrder {
  id: string;
  tenantId: string;
  customerId: string;
  equipmentId: string;
  frequency: string;
  nextScheduledDate: string;
  description?: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringOrderRequest {
  customerId: string;
  equipmentId: string;
  frequency: string;
  nextScheduledDate: string;
  description?: string;
  notes?: string;
}

export interface UpdateRecurringOrderRequest {
  frequency?: string;
  nextScheduledDate?: string;
  description?: string;
  status?: string;
  notes?: string;
}

export const recurringOrdersApi = {
  getAll: async (params?: {
    customerId?: string;
    equipmentId?: string;
    status?: string;
    dueBefore?: string;
  }): Promise<RecurringOrder[]> => {
    const response = await api.get<RecurringOrder[]>('/scheduling/recurring-orders', { params });
    return response.data;
  },

  getById: async (id: string): Promise<RecurringOrder> => {
    const response = await api.get<RecurringOrder>(`/scheduling/recurring-orders/${id}`);
    return response.data;
  },

  create: async (request: CreateRecurringOrderRequest): Promise<RecurringOrder> => {
    const response = await api.post<RecurringOrder>('/scheduling/recurring-orders', request);
    return response.data;
  },

  update: async (id: string, request: UpdateRecurringOrderRequest): Promise<RecurringOrder> => {
    const response = await api.put<RecurringOrder>(`/scheduling/recurring-orders/${id}`, request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/scheduling/recurring-orders/${id}`);
  },
};

// Export combined API
export const allSchedulingApis = {
  dispatches: dispatchesApi,
  availability: availabilityApi,
  recurringOrders: recurringOrdersApi,
};

export default allSchedulingApis;
