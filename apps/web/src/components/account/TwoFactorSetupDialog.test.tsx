import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TwoFactorSetupDialog from './TwoFactorSetupDialog';
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

// qrcode.react reads canvas APIs jsdom doesn't ship — render a placeholder.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-svg" data-value={value} />
  ),
}));

// The global react-i18next mock in src/test/setup.ts hands back a brand-new
// `t` function on every render, which can re-fire useEffects that include
// `t` in their deps. Use a stable t() here so the wizard's state machine
// doesn't reset between renders.
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

const QR_URI = 'otpauth://totp/Dispatch:test@example.com?secret=JBSWY3DPEHPK3PXP';

async function advanceFromPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));
}

describe('TwoFactorSetupDialog', () => {
  const onClose = vi.fn();
  const onEnabled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens to the method picker with TOTP recommended and Passkey disabled', () => {
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    expect(screen.getByText('account.twoFactorSetup.methodTitle')).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: /methodTotpLabel/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /methodSmsLabel/i })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: /methodEmailLabel/i })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: /methodPasskeyLabel/i })).toBeDisabled();
    expect(twoFactorApi.totpSetup).not.toHaveBeenCalled();
  });

  // ── TOTP path ──────────────────────────────────────────────────
  it('TOTP: fetches setup payload on entering setup and renders the QR + secret', async () => {
    vi.mocked(twoFactorApi.totpSetup).mockResolvedValue({
      secretCode: 'JBSWY3DPEHPK3PXP',
      qrCodeUri: QR_URI,
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await advanceFromPicker(user);

    await waitFor(() => expect(twoFactorApi.totpSetup).toHaveBeenCalled());
    expect(await screen.findByTestId('qr-svg')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
  });

  it('TOTP: verifies the code and notifies the parent on success', async () => {
    vi.mocked(twoFactorApi.totpSetup).mockResolvedValue({
      secretCode: 'JBSWY3DPEHPK3PXP',
      qrCodeUri: QR_URI,
    });
    vi.mocked(twoFactorApi.totpVerify).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await advanceFromPicker(user);
    await screen.findByTestId('qr-svg');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.next/i }));

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('123456');

    await waitFor(() => expect(twoFactorApi.totpVerify).toHaveBeenCalledWith('123456'));
    expect(onEnabled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('TOTP: surfaces an error when verify fails and clears the code', async () => {
    vi.mocked(twoFactorApi.totpSetup).mockResolvedValue({
      secretCode: 'JBSWY3DPEHPK3PXP',
      qrCodeUri: QR_URI,
    });
    vi.mocked(twoFactorApi.totpVerify).mockRejectedValue(
      Object.assign(new Error('Invalid code'), { response: { status: 400 } }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await advanceFromPicker(user);
    await screen.findByTestId('qr-svg');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.next/i }));

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('000000');

    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(onEnabled).not.toHaveBeenCalled();
  });

  // ── SMS path ───────────────────────────────────────────────────
  it('SMS: requires E.164 format before /sms/setup fires', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodSmsLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));

    // Bad input
    const phoneInput = screen.getByRole('textbox', { name: /smsLabel/i });
    await user.type(phoneInput, '6785551234');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.sendCode/i }));

    expect(twoFactorApi.smsSetup).not.toHaveBeenCalled();
    expect(await screen.findByText(/phoneInvalid/i)).toBeInTheDocument();
  });

  it('SMS: posts /sms/setup with E.164, advances to verify, then /sms/verify succeeds', async () => {
    vi.mocked(twoFactorApi.smsSetup).mockResolvedValue(undefined);
    vi.mocked(twoFactorApi.smsVerify).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodSmsLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));

    const phoneInput = screen.getByRole('textbox', { name: /smsLabel/i });
    await user.type(phoneInput, '+16785551234');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.sendCode/i }));

    await waitFor(() => expect(twoFactorApi.smsSetup).toHaveBeenCalledWith('+16785551234'));

    // Verify step now visible
    const inputs = await screen.findAllByRole('textbox');
    // First textbox is the phone field on /setup; on /verify all 6 are OTP boxes.
    expect(inputs.length).toBe(6);
    await user.click(inputs[0]);
    await user.paste('445566');

    await waitFor(() => expect(twoFactorApi.smsVerify).toHaveBeenCalledWith('445566'));
    expect(onEnabled).toHaveBeenCalled();
  });

  it('SMS: surfaces backend error when /sms/setup fails and stays on setup step', async () => {
    vi.mocked(twoFactorApi.smsSetup).mockRejectedValue(
      Object.assign(new Error('Carrier unavailable'), {
        response: { status: 503, data: { message: 'Carrier unavailable' } },
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodSmsLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));

    const phoneInput = screen.getByRole('textbox', { name: /smsLabel/i });
    await user.type(phoneInput, '+16785551234');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.sendCode/i }));

    expect(await screen.findByText('Carrier unavailable')).toBeInTheDocument();
    // Still on setup (no OTP boxes yet)
    expect(screen.queryAllByRole('textbox').filter((el) => el.getAttribute('maxlength') === '1')).toHaveLength(0);
  });

  it('SMS: resend on the verify step re-fires /sms/setup with the same phone', async () => {
    vi.mocked(twoFactorApi.smsSetup).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodSmsLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));
    await user.type(screen.getByRole('textbox', { name: /smsLabel/i }), '+16785551234');
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.sendCode/i }));

    // On verify step now — click resend
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.resend/i }));
    await waitFor(() => expect(twoFactorApi.smsSetup).toHaveBeenCalledTimes(2));
    expect(twoFactorApi.smsSetup).toHaveBeenLastCalledWith('+16785551234');
  });

  // ── Email path ─────────────────────────────────────────────────
  it('Email: auto-fires /email/setup on step entry, then /email/verify succeeds', async () => {
    vi.mocked(twoFactorApi.emailSetup).mockResolvedValue(undefined);
    vi.mocked(twoFactorApi.emailVerify).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodEmailLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));

    await waitFor(() => expect(twoFactorApi.emailSetup).toHaveBeenCalled());
    // Email confirmation screen shows the user's address
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.next/i }));

    const inputs = await screen.findAllByRole('textbox');
    expect(inputs.length).toBe(6);
    await user.click(inputs[0]);
    await user.paste('778899');

    await waitFor(() => expect(twoFactorApi.emailVerify).toHaveBeenCalledWith('778899'));
    expect(onEnabled).toHaveBeenCalled();
  });

  it('Email: surfaces error when /email/setup fails on step entry', async () => {
    vi.mocked(twoFactorApi.emailSetup).mockRejectedValue(
      Object.assign(new Error('SES failure'), {
        response: { status: 503, data: { message: 'SES failure' } },
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('radio', { name: /methodEmailLabel/i }));
    await user.click(screen.getByRole('button', { name: /account\.twoFactorSetup\.continue/i }));

    expect(await screen.findByText('SES failure')).toBeInTheDocument();
    // Next is disabled — emailSetup didn't succeed
    expect(screen.getByRole('button', { name: /account\.twoFactorSetup\.next/i })).toBeDisabled();
  });

  // ── Shared ────────────────────────────────────────────────────
  it('cancels from the picker via the cancel button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={true}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );

    await user.click(screen.getByRole('button', { name: /common\.cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does nothing when isOpen is false', () => {
    renderWithProviders(
      <TwoFactorSetupDialog
        isOpen={false}
        onClose={onClose}
        onEnabled={onEnabled}
        email="test@example.com"
      />,
    );
    expect(twoFactorApi.totpSetup).not.toHaveBeenCalled();
  });
});
