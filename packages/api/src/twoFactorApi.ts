// Two-Factor Auth API Client
//
// Wraps the backend's /users/me/2fa/* endpoints. The backend enforces the
// "one primary method" guarantee server-side: whichever method the user
// verifies last becomes their preferred factor and the others are disabled.
// The frontend doesn't need switch-method UX — re-enrolling just works.
//
// Recovery codes are intentionally absent — admin reset is the documented
// recovery path (POST /api/v1/users/{id}/mfa-reset).
import apiClient from './client';

export type TwoFactorMethod = 'TOTP' | 'SMS' | 'EMAIL';

export interface TotpSetupResponse {
  // base32 secret (manual-entry fallback for users who can't scan)
  secretCode: string;
  // otpauth:// URI; pass directly to any QR encoder
  qrCodeUri: string;
}

export interface VerifyCodeRequest {
  code: string;
}

export interface SmsSetupRequest {
  // E.164 format, e.g. "+16785551234"
  phoneNumber: string;
}

export interface ConfirmRequestResponse {
  method: TwoFactorMethod;
  // null for TOTP (no delivery); for SMS/EMAIL the backend masks the dest
  // (e.g. "+1******1234" or "j***@example.com")
  maskedDestination: string | null;
}

export interface DisableRequest {
  confirmationCode: string;
}

export const twoFactorApi = {
  // TOTP (authenticator app)
  totpSetup: async (): Promise<TotpSetupResponse> => {
    const response = await apiClient.post<TotpSetupResponse>('/users/me/2fa/totp/setup');
    return response.data;
  },
  totpVerify: async (code: string): Promise<void> => {
    await apiClient.post('/users/me/2fa/totp/verify', { code } satisfies VerifyCodeRequest);
  },

  // SMS
  smsSetup: async (phoneNumber: string): Promise<void> => {
    await apiClient.post('/users/me/2fa/sms/setup', { phoneNumber } satisfies SmsSetupRequest);
  },
  smsVerify: async (code: string): Promise<void> => {
    await apiClient.post('/users/me/2fa/sms/verify', { code } satisfies VerifyCodeRequest);
  },

  // Email
  emailSetup: async (): Promise<void> => {
    await apiClient.post('/users/me/2fa/email/setup');
  },
  emailVerify: async (code: string): Promise<void> => {
    await apiClient.post('/users/me/2fa/email/verify', { code } satisfies VerifyCodeRequest);
  },

  // Disable — two-step fresh-MFA-proof flow
  confirmRequest: async (): Promise<ConfirmRequestResponse> => {
    const response = await apiClient.post<ConfirmRequestResponse>('/users/me/2fa/confirm/request');
    return response.data;
  },
  disable: async (confirmationCode: string): Promise<void> => {
    await apiClient.post('/users/me/2fa/disable', { confirmationCode } satisfies DisableRequest);
  },
};

export default twoFactorApi;
