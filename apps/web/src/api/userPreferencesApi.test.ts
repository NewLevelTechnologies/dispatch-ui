import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserPreferences, updateUserPreferences } from '@dispatch/api/src/userPreferencesApi';
import apiClient from '@dispatch/api/src/client';

vi.mock('@dispatch/api/src/client');

describe('userPreferencesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUserPreferences hits /users/me/preferences and returns data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { theme: 'DARK', additionalPreferences: {} },
    });
    const result = await getUserPreferences();
    expect(apiClient.get).toHaveBeenCalledWith('/users/me/preferences');
    expect(result.theme).toBe('DARK');
  });

  it('updateUserPreferences PUTs the request body', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { theme: 'LIGHT', additionalPreferences: {} },
    });
    const result = await updateUserPreferences({ theme: 'LIGHT' });
    expect(apiClient.put).toHaveBeenCalledWith('/users/me/preferences', {
      theme: 'LIGHT',
    });
    expect(result.theme).toBe('LIGHT');
  });
});
