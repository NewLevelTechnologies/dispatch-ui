import apiClient from './client';

export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';

export interface UserPreferencesResponse {
  theme: ThemePreference | null;
  additionalPreferences: Record<string, unknown>;
}

export interface UpdatePreferencesRequest {
  theme?: ThemePreference;
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
