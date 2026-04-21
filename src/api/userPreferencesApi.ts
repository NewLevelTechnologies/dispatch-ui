import { apiClient } from './apiClient';

export interface UserPreferencesResponse {
  theme: string | null;
  additionalPreferences: Record<string, unknown>;
}

export interface UpdatePreferencesRequest {
  theme?: string;
}

export const getUserPreferences = async (): Promise<UserPreferencesResponse> => {
  const response = await apiClient.get<UserPreferencesResponse>('/users/me/preferences');
  return response.data;
};

export const updateUserPreferences = async (
  request: UpdatePreferencesRequest
): Promise<UserPreferencesResponse> => {
  const response = await apiClient.put<UserPreferencesResponse>('/users/me/preferences', request);
  return response.data;
};
