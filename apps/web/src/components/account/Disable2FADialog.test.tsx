import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import Disable2FADialog from './Disable2FADialog';
import { twoFactorApi } from '../../api/setup';

vi.mock('@dispatch/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    twoFactorApi: {
      totpSetup: vi.fn(),
      totpVerify: vi.fn(),
      smsSetup: vi.fn(),
      smsVerify: vi.fn(),
      emailSetup: vi.fn(),
      emailVerify: vi.fn(),
      confirmRequest: vi.fn(),
      disable: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => {
  const t = (key: string, params?: Record<string, unknown>) => {
    if (!params) return key;
    let out = key;
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    }
    return out;
  };
  return {
    useTranslation: () => ({
      t,
      i18n: { changeLanguage: () => new Promise(() => {}) },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  };
});

describe('Disable2FADialog', () => {
  const onClose = vi.fn();
  const onDisabled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TOTP path: requests confirm info on open and disables with the user-entered code', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockResolvedValue({
      method: 'TOTP',
      maskedDestination: null,
    });
    vi.mocked(twoFactorApi.disable).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    await waitFor(() => expect(twoFactorApi.confirmRequest).toHaveBeenCalled());
    expect(await screen.findByText('account.disable2fa.totpTitle')).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('123456');

    await waitFor(() => expect(twoFactorApi.disable).toHaveBeenCalledWith('123456'));
    expect(onDisabled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('SMS path: shows the masked destination and offers resend', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockResolvedValue({
      method: 'SMS',
      maskedDestination: '+1******1234',
    });
    vi.mocked(twoFactorApi.disable).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    expect(await screen.findByText(/\+1\*\*\*\*\*\*1234/)).toBeInTheDocument();

    // Resend re-fires /confirm/request
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.resend/i }));
    await waitFor(() => expect(twoFactorApi.confirmRequest).toHaveBeenCalledTimes(2));
  });

  it('403 mandate response shows the mandate message and hides the submit button', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockResolvedValue({
      method: 'TOTP',
      maskedDestination: null,
    });
    const mandateMsg = 'Two-factor is required at your company.';
    vi.mocked(twoFactorApi.disable).mockRejectedValue(
      Object.assign(new Error(mandateMsg), {
        response: { status: 403, data: { message: mandateMsg } },
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    await screen.findByText('account.disable2fa.totpTitle');
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('111111');

    expect(await screen.findByText(mandateMsg)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /account\.disable2fa\.submit/i }),
    ).not.toBeInTheDocument();
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('EMAIL path: shows the masked email destination', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockResolvedValue({
      method: 'EMAIL',
      maskedDestination: 'j***@example.com',
    });

    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    expect(await screen.findByText('account.disable2fa.emailTitle')).toBeInTheDocument();
    expect(screen.getByText('j***@example.com')).toBeInTheDocument();
  });

  it('shows an error and no OTP field when /confirm/request fails', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockRejectedValue(
      Object.assign(new Error('No MFA enrolled'), {
        response: { status: 400, data: { message: 'No MFA enrolled' } },
      }),
    );

    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    const matches = await screen.findAllByText('No MFA enrolled');
    expect(matches.length).toBeGreaterThan(0);
    // No OTP boxes because we never got method info
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('400 invalid-code response surfaces an inline error and keeps the dialog open', async () => {
    vi.mocked(twoFactorApi.confirmRequest).mockResolvedValue({
      method: 'TOTP',
      maskedDestination: null,
    });
    vi.mocked(twoFactorApi.disable).mockRejectedValue(
      Object.assign(new Error('Invalid code'), {
        response: { status: 400, data: { message: 'Invalid code' } },
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <Disable2FADialog isOpen={true} onClose={onClose} onDisabled={onDisabled} />,
    );

    await screen.findByText('account.disable2fa.totpTitle');
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('000000');

    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(onDisabled).not.toHaveBeenCalled();
  });
});
