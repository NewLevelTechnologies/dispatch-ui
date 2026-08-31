import { describe, it, expect, vi, beforeEach } from 'vitest';
import { twoFactorApi } from './twoFactorApi';
import apiClient from './client';

vi.mock('./client');

describe('twoFactorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TOTP ──────────────────────────────────────────────────────
  it('totpSetup POSTs /users/me/2fa/totp/setup and returns the secret + QR URI', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { secretCode: 'JBSWY3DPEHPK3PXP', qrCodeUri: 'otpauth://totp/x' },
    });

    const result = await twoFactorApi.totpSetup();

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/totp/setup');
    expect(result).toEqual({
      secretCode: 'JBSWY3DPEHPK3PXP',
      qrCodeUri: 'otpauth://totp/x',
    });
  });

  it('totpVerify POSTs /users/me/2fa/totp/verify with the code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.totpVerify('123456');

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/totp/verify', {
      code: '123456',
    });
  });

  // ── SMS ───────────────────────────────────────────────────────
  it('smsSetup POSTs /users/me/2fa/sms/setup with the E.164 phoneNumber', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.smsSetup('+16785551234');

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/sms/setup', {
      phoneNumber: '+16785551234',
    });
  });

  it('smsVerify POSTs /users/me/2fa/sms/verify with the code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.smsVerify('445566');

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/sms/verify', {
      code: '445566',
    });
  });

  // ── Email ─────────────────────────────────────────────────────
  it('emailSetup POSTs /users/me/2fa/email/setup with no body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.emailSetup();

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/email/setup');
  });

  it('emailVerify POSTs /users/me/2fa/email/verify with the code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.emailVerify('778899');

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/email/verify', {
      code: '778899',
    });
  });

  // ── Disable two-step ──────────────────────────────────────────
  it('confirmRequest POSTs /users/me/2fa/confirm/request and returns method + masked dest', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { method: 'SMS', maskedDestination: '+1******1234' },
    });

    const result = await twoFactorApi.confirmRequest();

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/confirm/request');
    expect(result).toEqual({ method: 'SMS', maskedDestination: '+1******1234' });
  });

  it('disable POSTs /users/me/2fa/disable with the confirmation code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await twoFactorApi.disable('999999');

    expect(apiClient.post).toHaveBeenCalledWith('/users/me/2fa/disable', {
      confirmationCode: '999999',
    });
  });
});
