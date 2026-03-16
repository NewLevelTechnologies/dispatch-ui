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
};

export default userApi;
