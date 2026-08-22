// Tenant Settings API Client
import apiClient from './client';
// Premise type ('BUSINESS' | 'RESIDENCE') is owned by customerApi (it's a
// per-location attribute); tenant settings just carry the tenant-wide default.
import type { PremiseType } from './customerApi';

export interface GlossaryEntry {
  singular: string;
  plural: string;
  // Short code shown on chips/badges/columns and used as the prefix on
  // generated entity numbers (e.g. WO-00001). 1–4 letters/digits, uppercased
  // by the server. Optional on overrides — omit or send "" to keep the
  // default prefix. Unique across entity types (incl. against the defaults of
  // entities the tenant hasn't overridden).
  abbreviation?: string;
}

export interface Glossary {
  [entityCode: string]: GlossaryEntry;
}

// How an agreement's contract value is recognized as revenue. STRAIGHT_LINE
// (default) earns ratably over the term; PER_VISIT earns per completed work
// order. The tenant's bookkeeper sets this as an accounting-policy choice;
// the backend reads it to compute, the FE mirrors it for the block's labels.
export type RecognitionBasis = 'STRAIGHT_LINE' | 'PER_VISIT';

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
  // Provenance for the reporting timezone, surfaced as a recovery affordance
  // on Company Profile (auto-detected on signup vs. deliberately set by an
  // admin). Backend-pending — these are not yet returned by /tenant-settings;
  // the UI degrades to a neutral hint until they land. `timezoneSetBy === null`
  // signals an auto-detected zone; a non-null `timezoneSetByName` + `timezoneSetAt`
  // signals a manual change.
  timezoneSetBy?: string | null;
  timezoneSetByName?: string | null;
  timezoneSetAt?: string | null;
  defaultTaxRate?: number | null;
  invoiceTerms?: string | null;
  enableOnlineBooking: boolean;
  enableSmsNotifications: boolean;
  enableEmailNotifications: boolean;
  // Tenant-wide master switch for outbound customer/technician email & SMS.
  // When false, notification-service suppresses every external send (logging
  // each recipient as SUPPRESSED) — used to load real customer data and explore
  // the app without contacting anyone. Defaults ON; backfilled for all tenants,
  // so always present. The per-channel sms/email flags above are dormant and
  // independent of this switch — don't wire them together.
  enableExternalNotifications: boolean;
  // Tenant-wide AI feature switch. New optional field — absent on older
  // responses, so the UI treats undefined as off.
  enableAiFeatures?: boolean;
  // Tenant-wide default applied to new service locations created without an
  // explicit premise. Always present; server defaults to 'BUSINESS'.
  defaultPremiseType: PremiseType;
  // Revenue recognition (accrual reporting) — see RecognitionBasis. New
  // optional fields; absent on older/cached responses, so the UI treats
  // undefined as off / straight-line (fail-safe, matches enableAiFeatures).
  //   • revenueRecognitionEnabled — display gate ONLY (FE reads this to show
  //     or hide the agreement recognition block; default off). The backend
  //     computes for everyone regardless, so toggling is instant — no backfill.
  //   • revenueRecognitionBasis — the basis the backend computes with (FE
  //     mirrors it for the block's anchor/labels); server defaults STRAIGHT_LINE.
  revenueRecognitionEnabled?: boolean;
  revenueRecognitionBasis?: RecognitionBasis;
  glossary?: Glossary; // Glossary is part of tenant settings
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
  enableExternalNotifications?: boolean;
  enableAiFeatures?: boolean;
  defaultPremiseType?: PremiseType;
  // Partial-update semantics — omit to leave unchanged. Basis is case-insensitive
  // on the wire but we always send the canonical uppercase union value.
  revenueRecognitionEnabled?: boolean;
  revenueRecognitionBasis?: RecognitionBasis;
  glossary?: Glossary; // Glossary can be updated
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

  // Removes the tenant logo. No request body; returns the full updated settings
  // with all logo* URLs nulled out. Safe to call when no logo is set.
  deleteLogo: async (): Promise<TenantSettings> => {
    const response = await apiClient.delete<TenantSettings>('/tenant-settings/logo');
    return response.data;
  },
};

export default tenantSettingsApi;
