import apiClient from './client';

// Types
export interface DispatchRegion {
  id: string;
  name: string;
  abbreviation: string;
  description?: string;
  state?: string;
  logoUrl?: string;
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
  logoUrl?: string;
  tabDisplayName?: string;
  sortOrder?: number;
}

export interface UpdateDispatchRegionRequest {
  name?: string;
  abbreviation?: string;
  description?: string;
  state?: string;
  logoUrl?: string;
  tabDisplayName?: string;
  sortOrder?: number;
}

// API Service
export const dispatchRegionApi = {
  /**
   * Get all dispatch regions
   * @param includeInactive - Include deactivated regions in results
   */
  getAll: async (includeInactive = false): Promise<DispatchRegion[]> => {
    const response = await apiClient.get<DispatchRegion[]>(
      `/dispatch-regions${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data;
  },

  /**
   * Get the default dispatch region (single active region if only one exists)
   * Returns null if multiple active regions exist
   */
  getDefault: async (): Promise<DispatchRegion | null> => {
    const response = await apiClient.get<DispatchRegion | null>('/dispatch-regions/default');
    return response.data;
  },

  /**
   * Get a specific dispatch region by ID
   */
  getById: async (id: string): Promise<DispatchRegion> => {
    const response = await apiClient.get<DispatchRegion>(`/dispatch-regions/${id}`);
    return response.data;
  },

  /**
   * Create a new dispatch region
   */
  create: async (request: CreateDispatchRegionRequest): Promise<DispatchRegion> => {
    const response = await apiClient.post<DispatchRegion>('/dispatch-regions', request);
    return response.data;
  },

  /**
   * Update an existing dispatch region
   */
  update: async (id: string, request: UpdateDispatchRegionRequest): Promise<DispatchRegion> => {
    const response = await apiClient.put<DispatchRegion>(`/dispatch-regions/${id}`, request);
    return response.data;
  },

  /**
   * Soft delete (deactivate) a dispatch region
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/dispatch-regions/${id}`);
  },

  /**
   * Reactivate a previously deactivated dispatch region
   */
  reactivate: async (id: string): Promise<DispatchRegion> => {
    const response = await apiClient.post<DispatchRegion>(`/dispatch-regions/${id}/reactivate`);
    return response.data;
  },
};

export default dispatchRegionApi;
