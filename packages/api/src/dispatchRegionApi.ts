import apiClient from './client';

// Types
export interface DispatchRegion {
  id: string;
  name: string;
  abbreviation: string;
  description?: string;
  state?: string;
  tabDisplayName?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateDispatchRegionRequest {
  name: string;
  abbreviation: string;
  description?: string;
  state?: string;
  tabDisplayName?: string;
  sortOrder?: number;
}

export interface UpdateDispatchRegionRequest {
  name?: string;
  abbreviation?: string;
  description?: string;
  state?: string;
  tabDisplayName?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// API Service
export const dispatchRegionApi = {
  /**
   * Get all dispatch regions
   * @param includeInactive - Include deactivated regions in results
   */
  getAll: async (includeInactive = false): Promise<DispatchRegion[]> => {
    const response = await apiClient.get<DispatchRegion[]>(
      `/tenant/dispatch-regions${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data;
  },

  /**
   * Get the default dispatch region (single active region if only one exists)
   * Returns null if multiple active regions exist
   */
  getDefault: async (): Promise<DispatchRegion | null> => {
    const response = await apiClient.get<DispatchRegion | null>('/tenant/dispatch-regions/default');
    return response.data;
  },

  /**
   * Get a specific dispatch region by ID
   */
  getById: async (id: string): Promise<DispatchRegion> => {
    const response = await apiClient.get<DispatchRegion>(`/tenant/dispatch-regions/${id}`);
    return response.data;
  },

  /**
   * Create a new dispatch region
   */
  create: async (request: CreateDispatchRegionRequest): Promise<DispatchRegion> => {
    const response = await apiClient.post<DispatchRegion>('/tenant/dispatch-regions', request);
    return response.data;
  },

  /**
   * Update an existing dispatch region
   */
  update: async (id: string, request: UpdateDispatchRegionRequest): Promise<DispatchRegion> => {
    const response = await apiClient.put<DispatchRegion>(`/tenant/dispatch-regions/${id}`, request);
    return response.data;
  },

  /**
   * Soft delete (deactivate) a dispatch region
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/tenant/dispatch-regions/${id}`);
  },

  /**
   * Reactivate a previously deactivated dispatch region
   */
  reactivate: async (id: string): Promise<DispatchRegion> => {
    const response = await apiClient.post<DispatchRegion>(`/tenant/dispatch-regions/${id}/reactivate`);
    return response.data;
  },

  /**
   * Reorder dispatch regions atomically. Pass the complete ordered list of
   * active region IDs; server applies all sortOrder updates in one transaction.
   */
  reorder: async (orderedIds: string[]): Promise<DispatchRegion[]> => {
    const response = await apiClient.post<DispatchRegion[]>('/tenant/dispatch-regions/reorder', { orderedIds });
    return response.data;
  },
};

export default dispatchRegionApi;
