import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { QRCodeSVG } from 'qrcode.react';
import clsx from 'clsx';
import { Dialog } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { ErrorMessage, Field, Label, Description } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Callout } from '../ui/Callout';
import { OtpInput, type OtpInputHandle } from '../ui/OtpInput';
import { WizardHeader } from '../ui/WizardHeader';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { extractApiError } from '../../lib/toast';
import { twoFactorApi, type TwoFactorMethod } from '../../api/setup';

// 3-step wizard: method picker → method-specific setup → verify. All three
// methods go through the backend so the server-side "one primary method"
// guarantee holds (whichever method verifies last becomes preferred and
// the others are auto-disabled). Recovery is admin-reset only — no
// recovery-codes step.

type Method = TwoFactorMethod | 'PASSKEY';
type Step = 'method' | 'setup' | 'verify';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnabled: () => void;
  email: string;
}

// TOTP RFC 6238 step. The countdown is informational so the user knows
// roughly how long the code in front of them stays valid; SMS/Email codes
// have backend-managed TTLs we don't surface here.
const TOTP_STEP_SECONDS = 30;
function totpSecondsRemaining(): number {
  return TOTP_STEP_SECONDS - Math.floor((Date.now() / 1000) % TOTP_STEP_SECONDS);
}

// Permissive E.164 check: leading '+', then 8–15 digits. The backend does
// the authoritative validation and rejects malformed numbers with 400.
const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function TwoFactorSetupDialog({ isOpen, onClose, onEnabled, email }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<Method>('TOTP');

  // TOTP setup payload
  const [secretCode, setSecretCode] = useState('');
  const [qrCodeUri, setQrCodeUri] = useState('');

  // SMS phone entry (E.164)
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Shared verify state
  const [code, setCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number>(totpSecondsRemaining());

  const otpRef = useRef<OtpInputHandle>(null);

  // Reset the wizard whenever the dialog opens — state resets live inside
  // the effect so re-opening always lands on step 1 with a fresh slate.
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setStep('method');
    setMethod('TOTP');
    setSecretCode('');
    setQrCodeUri('');
    setPhone('');
    setPhoneError('');
    setCode('');
    setVerifyError('');
    setSetupError('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen]);

  // ── Setup mutations ──────────────────────────────────────────────
  const totpSetupMutation = useMutation({
    mutationFn: () => twoFactorApi.totpSetup(),
    onSuccess: (data) => {
      setSecretCode(data.secretCode);
      setQrCodeUri(data.qrCodeUri);
      setSetupError('');
    },
    onError: (err) => {
      setSetupError(extractApiError(err) || t('account.twoFactorSetup.errorStart'));
    },
  });

  const smsSetupMutation = useMutation({
    mutationFn: (phoneNumber: string) => twoFactorApi.smsSetup(phoneNumber),
    onSuccess: () => {
      setSetupError('');
      setStep('verify');
    },
    onError: (err) => {
      setSetupError(extractApiError(err) || t('account.twoFactorSetup.errorStart'));
    },
  });

  const emailSetupMutation = useMutation({
    mutationFn: () => twoFactorApi.emailSetup(),
    onSuccess: () => {
      setSetupError('');
    },
    onError: (err) => {
      setSetupError(extractApiError(err) || t('account.twoFactorSetup.errorStart'));
    },
  });

  // TOTP setup fires when the user advances past the picker with TOTP
  // selected. Avoids the roundtrip if they cancel from the picker.
  useEffect(() => {
    if (step !== 'setup' || method !== 'TOTP') return;
    if (qrCodeUri || totpSetupMutation.isPending || setupError) return;
    totpSetupMutation.mutate();
  }, [step, method, qrCodeUri, totpSetupMutation, setupError]);

  // Email setup auto-fires on entry since there's no extra info to collect
  // before the backend can dispatch the code.
  useEffect(() => {
    if (step !== 'setup' || method !== 'EMAIL') return;
    if (emailSetupMutation.isPending || emailSetupMutation.isSuccess || setupError) return;
    emailSetupMutation.mutate();
  }, [step, method, emailSetupMutation, setupError]);

  // Verify-step countdown — only meaningful for TOTP, but we show it as a
  // "code expires soon" cue. SMS/Email codes have their own TTLs the
  // backend owns; we surface a resend affordance instead.
  useEffect(() => {
    if (step !== 'verify' || method !== 'TOTP') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecondsLeft(totpSecondsRemaining());
    const id = setInterval(() => setSecondsLeft(totpSecondsRemaining()), 1000);
    return () => clearInterval(id);
  }, [step, method]);

  // ── Verify mutation ──────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      if (method === 'TOTP') await twoFactorApi.totpVerify(totpCode);
      else if (method === 'SMS') await twoFactorApi.smsVerify(totpCode);
      else if (method === 'EMAIL') await twoFactorApi.emailVerify(totpCode);
    },
    onSuccess: () => {
      onEnabled();
      onClose();
    },
    onError: (err) => {
      setVerifyError(extractApiError(err) || t('account.twoFactorSetup.errorVerify'));
      setCode('');
      otpRef.current?.focus();
    },
  });

  const codeReady = code.length === 6;
  const submitCode = () => {
    if (!codeReady || verifyMutation.isPending) return;
    setVerifyError('');
    verifyMutation.mutate(code);
  };

  // ── Method advance ───────────────────────────────────────────────
  const advanceFromPicker = () => {
    if (method === 'PASSKEY') return;
    setStep('setup');
  };

  const advanceFromSetup = () => {
    setVerifyError('');
    setCode('');
    if (method === 'TOTP') {
      setStep('verify');
    } else if (method === 'SMS') {
      // Normalize and submit. SMS verify only opens after backend ack so
      // the user can't enter a code before the SMS is dispatched.
      const trimmed = phone.trim();
      if (!E164_RE.test(trimmed)) {
        setPhoneError(t('account.twoFactorSetup.phoneInvalid'));
        return;
      }
      setPhoneError('');
      smsSetupMutation.mutate(trimmed);
    } else if (method === 'EMAIL') {
      setStep('verify');
    }
  };

  const resendCode = () => {
    setCode('');
    setVerifyError('');
    if (method === 'SMS') smsSetupMutation.mutate(phone.trim());
    if (method === 'EMAIL') emailSetupMutation.mutate();
  };

  const totalSteps = 3;
  const stepIndex = step === 'method' ? 1 : step === 'setup' ? 2 : 3;

  return (
    <Dialog open={isOpen} onClose={onClose} size="md" padding="none">
      <div>
        <WizardHeader
          title={t('account.twoFactorSetup.title')}
          icon={<ShieldCheckIcon className="size-3" />}
          step={stepIndex}
          totalSteps={totalSteps}
        />

        {step === 'method' ? (
          <MethodPickerBody value={method} onChange={setMethod} />
        ) : step === 'setup' ? (
          method === 'TOTP' ? (
            <TotpSetupBody
              secretCode={secretCode}
              qrCodeUri={qrCodeUri}
              setupError={setupError}
            />
          ) : method === 'SMS' ? (
            <SmsSetupBody
              phone={phone}
              onPhoneChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError('');
              }}
              phoneError={phoneError}
              setupError={setupError}
              pending={smsSetupMutation.isPending}
            />
          ) : (
            <EmailSetupBody email={email} setupError={setupError} />
          )
        ) : (
          <VerifyBody
            method={method as TwoFactorMethod}
            email={email}
            phone={phone}
            otpRef={otpRef}
            code={code}
            onCodeChange={setCode}
            onComplete={(v) => {
              if (!verifyMutation.isPending) {
                setVerifyError('');
                verifyMutation.mutate(v);
              }
            }}
            verifyError={verifyError}
            secondsLeft={secondsLeft}
            onResend={resendCode}
            resendPending={smsSetupMutation.isPending || emailSetupMutation.isPending}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-soft px-5 py-3">
          {step === 'method' ? (
            <>
              <Button plain size="xs" type="button" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                color="accent"
                size="xs"
                type="button"
                onClick={advanceFromPicker}
                disabled={method === 'PASSKEY'}
              >
                {t('account.twoFactorSetup.continue')}
              </Button>
            </>
          ) : step === 'setup' ? (
            <>
              <Button plain size="xs" type="button" onClick={() => setStep('method')}>
                {t('account.twoFactorSetup.back')}
              </Button>
              <Button
                color="accent"
                size="xs"
                type="button"
                onClick={advanceFromSetup}
                disabled={
                  (method === 'TOTP' && !qrCodeUri) ||
                  (method === 'SMS' && smsSetupMutation.isPending) ||
                  (method === 'EMAIL' && !emailSetupMutation.isSuccess)
                }
              >
                {method === 'SMS'
                  ? smsSetupMutation.isPending
                    ? t('account.twoFactorSetup.sendingCode')
                    : t('account.twoFactorSetup.sendCode')
                  : t('account.twoFactorSetup.next')}
              </Button>
            </>
          ) : (
            <>
              <Button plain size="xs" type="button" onClick={() => setStep('setup')}>
                {t('account.twoFactorSetup.back')}
              </Button>
              <Button
                color="accent"
                size="xs"
                type="button"
                onClick={submitCode}
                disabled={!codeReady || verifyMutation.isPending}
              >
                {verifyMutation.isPending
                  ? t('account.twoFactorSetup.turnOnPending')
                  : t('account.twoFactorSetup.turnOn')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// Method picker — TOTP recommended, SMS + Email live, Passkey deferred
// ──────────────────────────────────────────────────────────────────
interface MethodOption {
  id: Method;
  glyph: string;
  labelKey: string;
  descKey: string;
  tagKey?: string;
  tagTone: 'success' | 'neutral';
  disabled: boolean;
}

const METHOD_OPTIONS: MethodOption[] = [
  {
    id: 'TOTP',
    glyph: '✻',
    labelKey: 'account.twoFactorSetup.methodTotpLabel',
    descKey: 'account.twoFactorSetup.methodTotpDesc',
    tagKey: 'account.twoFactorSetup.methodRecommended',
    tagTone: 'success',
    disabled: false,
  },
  {
    id: 'SMS',
    glyph: '✆',
    labelKey: 'account.twoFactorSetup.methodSmsLabel',
    descKey: 'account.twoFactorSetup.methodSmsDesc',
    tagTone: 'neutral',
    disabled: false,
  },
  {
    id: 'EMAIL',
    glyph: '✉',
    labelKey: 'account.twoFactorSetup.methodEmailLabel',
    descKey: 'account.twoFactorSetup.methodEmailDesc',
    tagTone: 'neutral',
    disabled: false,
  },
  {
    id: 'PASSKEY',
    glyph: '⚷',
    labelKey: 'account.twoFactorSetup.methodPasskeyLabel',
    descKey: 'account.twoFactorSetup.methodPasskeyDesc',
    tagKey: 'account.twoFactorSetup.methodComingSoon',
    tagTone: 'neutral',
    disabled: true,
  },
];

function MethodPickerBody({
  value,
  onChange,
}: {
  value: Method;
  onChange: (m: Method) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">
        {t('account.twoFactorSetup.methodTitle')}
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {t('account.twoFactorSetup.methodDescription')}
      </p>

      <div
        role="radiogroup"
        aria-label={t('account.twoFactorSetup.methodTitle')}
        className="mt-3 flex flex-col gap-1.5"
      >
        {METHOD_OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={opt.disabled}
              onClick={() => !opt.disabled && onChange(opt.id)}
              className={clsx(
                'grid grid-cols-[20px_22px_1fr] items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition',
                opt.disabled
                  ? 'cursor-not-allowed border-border-soft bg-bg-elev-2 opacity-55'
                  : 'cursor-pointer',
                !opt.disabled && active
                  ? 'border-accent-500 bg-[color-mix(in_oklch,var(--color-accent-500)_6%,var(--bg-elev))]'
                  : !opt.disabled && 'border-border bg-bg-elev-2 hover:border-border-strong',
              )}
            >
              <span
                className={clsx(
                  'mt-0.5 grid size-[14px] place-items-center rounded-full border-[1.5px] bg-bg-elev',
                  active ? 'border-accent-500' : 'border-border-strong',
                )}
                aria-hidden="true"
              >
                {active && <span className="size-[7px] rounded-full bg-accent-500" />}
              </span>
              <span className="mt-0 text-[17px] leading-none" aria-hidden="true">
                {opt.glyph}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-fg-strong">
                    {t(opt.labelKey)}
                  </span>
                  {opt.tagKey && (
                    <span
                      className={clsx(
                        'rounded-[3px] px-1.5 py-px text-[9px] font-bold tracking-wider uppercase',
                        opt.tagTone === 'success'
                          ? 'bg-[color-mix(in_oklch,var(--color-success-500)_14%,transparent)] text-success-500'
                          : 'bg-bg-active text-fg-muted',
                      )}
                    >
                      {t(opt.tagKey)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">
                  {t(opt.descKey)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Callout kind="neutral" icon={null} className="mt-2.5">
        {t('account.twoFactorSetup.methodAdminReset')}
      </Callout>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TOTP setup body — QR + manual secret
// ──────────────────────────────────────────────────────────────────
function TotpSetupBody({
  secretCode,
  qrCodeUri,
  setupError,
}: {
  secretCode: string;
  qrCodeUri: string;
  setupError: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">
        {t('account.twoFactorSetup.qrTitle')}
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {t('account.twoFactorSetup.qrDescription')}
      </p>

      <div className="mt-4 flex justify-center">
        <div className="rounded-lg border border-border-soft bg-white p-3">
          {qrCodeUri ? (
            <QRCodeSVG value={qrCodeUri} size={180} level="M" />
          ) : (
            <div className="grid size-[180px] place-items-center text-[11px] text-fg-dim">
              {setupError || t('account.twoFactorSetup.loading')}
            </div>
          )}
        </div>
      </div>

      <Callout
        kind="neutral"
        icon={null}
        className="mt-4"
        title={
          <span className="text-[10.5px] font-semibold tracking-wider text-fg-muted uppercase">
            {t('account.twoFactorSetup.manualLabel')}
          </span>
        }
        action={
          <Button
            outline
            size="xs"
            type="button"
            onClick={() => secretCode && navigator.clipboard.writeText(secretCode).catch(() => {})}
            disabled={!secretCode}
          >
            {t('account.twoFactorSetup.copy')}
          </Button>
        }
      >
        <code className="block truncate font-mono text-[12px] tracking-wider text-fg-strong">
          {secretCode || '••••••••••••••••'}
        </code>
      </Callout>

      {setupError && (
        <ErrorMessage size="xs" className="mt-3">
          {setupError}
        </ErrorMessage>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// SMS setup body — phone entry. The verify step opens only after the
// backend acks /sms/setup so the user can't be staring at a code box
// before the SMS is in flight.
// ──────────────────────────────────────────────────────────────────
function SmsSetupBody({
  phone,
  onPhoneChange,
  phoneError,
  setupError,
  pending,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  phoneError: string;
  setupError: string;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">
        {t('account.twoFactorSetup.smsTitle')}
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {t('account.twoFactorSetup.smsDescription')}
      </p>

      <div className="mt-4">
        <Field size="xs">
          <Label size="xs">{t('account.twoFactorSetup.smsLabel')}</Label>
          <Input
            size="xs"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+16785551234"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            disabled={pending}
            invalid={!!phoneError}
          />
          <Description size="xs">{t('account.twoFactorSetup.smsHint')}</Description>
          {phoneError && (
            <ErrorMessage size="xs">{phoneError}</ErrorMessage>
          )}
        </Field>
      </div>

      {setupError && (
        <ErrorMessage size="xs" className="mt-3">
          {setupError}
        </ErrorMessage>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Email setup body — read-only confirmation of the sign-in email. We
// auto-fire /email/setup on step entry so the code is already in their
// inbox by the time they click Next.
// ──────────────────────────────────────────────────────────────────
function EmailSetupBody({
  email,
  setupError,
}: {
  email: string;
  setupError: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">
        {t('account.twoFactorSetup.emailTitle')}
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {t('account.twoFactorSetup.emailDescription')}
      </p>

      <Callout
        kind="neutral"
        icon={<span className="text-[20px]" aria-hidden="true">✉</span>}
        className="mt-4"
        title={email}
      >
        {t('account.twoFactorSetup.emailReadonlyHint')}
      </Callout>

      <Callout kind="warning" className="mt-3.5">
        <span className="font-semibold text-fg-strong">
          {t('account.twoFactorSetup.emailWarningLead')}{' '}
        </span>
        {t('account.twoFactorSetup.emailWarningBody')}
      </Callout>

      {setupError && (
        <ErrorMessage size="xs" className="mt-3">
          {setupError}
        </ErrorMessage>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Verify body — shared OTP entry. Sub-copy and the timer/resend
// affordance vary by method.
// ──────────────────────────────────────────────────────────────────
function VerifyBody({
  method,
  email,
  phone,
  otpRef,
  code,
  onCodeChange,
  onComplete,
  verifyError,
  secondsLeft,
  onResend,
  resendPending,
}: {
  method: TwoFactorMethod;
  email: string;
  phone: string;
  otpRef: React.RefObject<OtpInputHandle | null>;
  code: string;
  onCodeChange: (v: string) => void;
  onComplete: (v: string) => void;
  verifyError: string;
  secondsLeft: number;
  onResend: () => void;
  resendPending: boolean;
}) {
  const { t } = useTranslation();

  const description =
    method === 'TOTP'
      ? t('account.twoFactorSetup.verifyDescription')
      : method === 'SMS'
        ? t('account.twoFactorSetup.verifySmsDescription', { phone })
        : t('account.twoFactorSetup.verifyEmailDescription', { email });

  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">
        {t('account.twoFactorSetup.verifyTitle')}
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {description}
      </p>

      <div className="mt-5 flex justify-center">
        <OtpInput
          ref={otpRef}
          length={6}
          value={code}
          onChange={onCodeChange}
          onComplete={onComplete}
          autoFocus
          ariaLabel={t('account.twoFactorSetup.verifyTitle')}
        />
      </div>

      {method === 'TOTP' ? (
        <div className="mt-4 text-center text-[11px] text-fg-dim">
          {t('account.twoFactorSetup.countdown', { seconds: secondsLeft })}
        </div>
      ) : (
        <div className="mt-4 text-center text-[11px] text-fg-dim">
          <button
            type="button"
            className="text-fg-muted underline-offset-2 hover:text-fg-strong hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onResend}
            disabled={resendPending}
          >
            {resendPending
              ? t('account.twoFactorSetup.resendPending')
              : t('account.twoFactorSetup.resend')}
          </button>
        </div>
      )}

      {verifyError ? (
        <ErrorMessage size="xs" className="mt-4 text-center">
          {verifyError}
        </ErrorMessage>
      ) : (
        <Callout
          kind="neutral"
          icon={null}
          className="mt-4"
          title={t('account.twoFactorSetup.recoveryTitle')}
        >
          {t('account.twoFactorSetup.recoveryBody')}
        </Callout>
      )}
    </div>
  );
}
