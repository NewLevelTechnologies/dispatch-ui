// User API Client
import apiClient from './client';

export interface User {
  id: string;
  tenantId: string;
  cognitoSub: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  roles?: Role[];
  capabilities?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Capability {
  name: string;
  displayName: string;
  description: string;
}

export interface CapabilityGroup {
  featureArea: string;
  displayName: string;
  capabilities: Capability[];
}

export interface GroupedCapabilitiesResponse {
  groups: CapabilityGroup[];
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  roleIds: string[];
  phoneNumber?: string | null;
  sendInvite?: boolean;
}

export interface UpdateUserProfileRequest {
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
}

export interface UpdateUserRolesRequest {
  roleIds: string[];
}

export interface UpdateUserEnabledRequest {
  enabled: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  capabilities: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  capabilities?: string[];
}

export const userApi = {
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users');
    return response.data;
  },

  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  getRoles: async (): Promise<Role[]> => {
    const response = await apiClient.get<Role[]>('/users/roles');
    return response.data;
  },

  getGroupedCapabilities: async (): Promise<GroupedCapabilitiesResponse> => {
    const response = await apiClient.get<GroupedCapabilitiesResponse>('/users/capabilities/grouped');
    return response.data;
  },

  create: async (request: CreateUserRequest): Promise<User> => {
    const response = await apiClient.post<User>('/users', request);
    return response.data;
  },

  updateProfile: async (id: string, request: UpdateUserProfileRequest): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, request);
    return response.data;
  },

  updateRoles: async (id: string, request: UpdateUserRolesRequest): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}/roles`, request);
    return response.data;
  },

  enable: async (id: string): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, { enabled: true });
    return response.data;
  },

  disable: async (id: string): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, { enabled: false });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  // Role management methods
  getRoleById: async (id: string): Promise<Role> => {
    const response = await apiClient.get<Role>(`/users/roles/${id}`);
    return response.data;
  },

  createRole: async (request: CreateRoleRequest): Promise<Role> => {
    const response = await apiClient.post<Role>('/users/roles', request);
    return response.data;
  },

  updateRole: async (id: string, request: UpdateRoleRequest): Promise<Role> => {
    const response = await apiClient.put<Role>(`/users/roles/${id}`, request);
    return response.data;
  },

  deleteRole: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/roles/${id}`);
  },
};

export default userApi;
