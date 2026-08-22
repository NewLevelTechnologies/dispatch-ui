import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantSettingsApi } from './tenantSettingsApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { companyName: 'Acme' } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { logoUrl: 'https://cdn/logo.png' } });
  vi.mocked(apiClient.put).mockResolvedValue({ data: { companyName: 'Acme 2' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: { companyName: 'Acme' } });
});

describe('tenantSettingsApi', () => {
  it('reads and updates the settings singleton', async () => {
    const got = await tenantSettingsApi.getSettings();
    const updated = await tenantSettingsApi.updateSettings({ companyName: 'Acme 2' } as never);

    // Singleton — no id segment on either call.
    expect(apiClient.get).toHaveBeenCalledWith('/tenant-settings');
    expect(apiClient.put).toHaveBeenCalledWith('/tenant-settings', { companyName: 'Acme 2' });
    expect(got).toEqual({ companyName: 'Acme' });
    expect(updated).toEqual({ companyName: 'Acme 2' });
  });

  it('uploadLogo posts multipart form data with the file attached', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });

    await tenantSettingsApi.uploadLogo(file);

    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/tenant-settings/logo');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('deleteLogo returns the full updated settings rather than nothing', async () => {
    // Safe to call with no logo set; the response carries the logo* URLs nulled
    // out so callers can refresh straight from it.
    const out = await tenantSettingsApi.deleteLogo();

    expect(apiClient.delete).toHaveBeenCalledWith('/tenant-settings/logo');
    expect(out).toEqual({ companyName: 'Acme' });
  });
});
