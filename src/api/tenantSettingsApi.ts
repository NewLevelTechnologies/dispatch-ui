// Tenant Settings API Client
import apiClient from './client';

export interface TenantSettings {
  tenantId: string;
  companyName: string;
  companyNameShort?: string | null;
  companySlogan?: string | null;
  logoOriginalUrl?: string | null;
  logoLargeUrl?: string | null;
  logoMediumUrl?: string | null;
  logoSmallUrl?: string | null;
  logoThumbnailUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  defaultTaxRate?: number | null;
  invoiceTerms?: string | null;
  enableOnlineBooking: boolean;
  enableSmsNotifications: boolean;
  enableEmailNotifications: boolean;
  updatedAt: string;
}

export interface UpdateTenantSettingsRequest {
  companyName?: string;
  companyNameShort?: string | null;
  companySlogan?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  defaultTaxRate?: number | null;
  invoiceTerms?: string | null;
  enableOnlineBooking?: boolean;
  enableSmsNotifications?: boolean;
  enableEmailNotifications?: boolean;
}

export interface LogoUrls {
  original: string;
  large: string;
  medium: string;
  small: string;
  thumbnail: string;
}

export interface UploadLogoResponse {
  message: string;
  urls: LogoUrls;
}

export const tenantSettingsApi = {
  getSettings: async (): Promise<TenantSettings> => {
    const response = await apiClient.get<TenantSettings>('/tenant-settings');
    return response.data;
  },

  updateSettings: async (request: UpdateTenantSettingsRequest): Promise<TenantSettings> => {
    const response = await apiClient.put<TenantSettings>('/tenant-settings', request);
    return response.data;
  },

  uploadLogo: async (file: File): Promise<UploadLogoResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<UploadLogoResponse>(
      '/tenant-settings/logo',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
};

export default tenantSettingsApi;
