import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { ErrorMessage } from '../catalyst/fieldset';
import { Callout } from '../ui/Callout';
import { OtpInput, type OtpInputHandle } from '../ui/OtpInput';
import { extractApiError } from '../../lib/toast';
import { twoFactorApi, type ConfirmRequestResponse } from '../../api/setup';

// Two-step fresh-MFA-proof disable. On open we ask the backend for the
// active method (which also triggers code delivery for SMS/EMAIL). The
// user types the code, we POST /disable, and the backend gates on the
// freshness. A 403 means the company has 2FA mandated and the user
// can't self-disable — we surface that as a hard-stop message.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDisabled: () => void;
}

export default function Disable2FADialog({ isOpen, onClose, onDisabled }: Props) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ConfirmRequestResponse | null>(null);
  const [code, setCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [mandateError, setMandateError] = useState('');
  const otpRef = useRef<OtpInputHandle>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setInfo(null);
    setCode('');
    setVerifyError('');
    setRequestError('');
    setMandateError('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen]);

  const confirmRequestMutation = useMutation({
    mutationFn: () => twoFactorApi.confirmRequest(),
    onSuccess: (data) => {
      setInfo(data);
      setRequestError('');
    },
    onError: (err) => {
      setRequestError(extractApiError(err) || t('account.disable2fa.errorRequest'));
    },
  });

  // Kick off the confirm-request on open so the code is en route by the
  // time the user reaches the OTP field. Re-fires only when we don't have
  // info yet (e.g. dialog just opened or a prior request failed and the
  // user retries by re-opening).
  useEffect(() => {
    if (!isOpen || info || confirmRequestMutation.isPending || requestError) return;
    confirmRequestMutation.mutate();
  }, [isOpen, info, confirmRequestMutation, requestError]);

  const disableMutation = useMutation({
    mutationFn: (confirmationCode: string) => twoFactorApi.disable(confirmationCode),
    onSuccess: () => {
      onDisabled();
      onClose();
    },
    onError: (err) => {
      // 403 = company mandate; treat as terminal in this dialog and surface
      // the backend's message verbatim (it's the source of truth for what
      // the user should do next).
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = extractApiError(err);
      if (status === 403) {
        setMandateError(message || t('account.disable2fa.errorMandate'));
        return;
      }
      setVerifyError(message || t('account.disable2fa.errorInvalid'));
      setCode('');
      otpRef.current?.focus();
    },
  });

  const codeReady = code.length === 6;
  const submit = () => {
    if (!codeReady || disableMutation.isPending) return;
    setVerifyError('');
    disableMutation.mutate(code);
  };

  const resend = () => {
    setCode('');
    setVerifyError('');
    confirmRequestMutation.mutate();
  };

  // Header copy varies by method — the masked destination tells the user
  // where to look for the code.
  const headerCopy = (() => {
    if (mandateError) return null;
    if (!info) {
      return requestError
        ? { title: t('account.disable2fa.errorRequestTitle'), body: requestError }
        : { title: t('account.disable2fa.preparingTitle'), body: t('account.disable2fa.preparingBody') };
    }
    if (info.method === 'TOTP') {
      return {
        title: t('account.disable2fa.totpTitle'),
        body: t('account.disable2fa.totpBody'),
      };
    }
    if (info.method === 'SMS') {
      return {
        title: t('account.disable2fa.smsTitle'),
        body: t('account.disable2fa.smsBody', { dest: info.maskedDestination ?? '' }),
        dest: info.maskedDestination,
      };
    }
    return {
      title: t('account.disable2fa.emailTitle'),
      body: t('account.disable2fa.emailBody', { dest: info.maskedDestination ?? '' }),
      dest: info.maskedDestination,
    };
  })();

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>{t('account.disable2fa.dialogTitle')}</DialogTitle>
      <DialogDescription>{t('account.disable2fa.dialogDescription')}</DialogDescription>
      <DialogBody>
        {mandateError ? (
          <Callout kind="warning" title={t('account.disable2fa.mandateTitle')}>
            {mandateError}
          </Callout>
        ) : (
          <>
            {headerCopy && (
              <div className="mb-4">
                <div className="text-[12.5px] font-semibold text-fg-strong">{headerCopy.title}</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
                  {headerCopy.body}
                  {'dest' in headerCopy && headerCopy.dest && (
                    <span className="ml-1 font-medium text-fg-strong">{headerCopy.dest}</span>
                  )}
                </p>
              </div>
            )}

            {info && (
              <>
                <div className="flex justify-center">
                  <OtpInput
                    ref={otpRef}
                    length={6}
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => {
                      if (!disableMutation.isPending) {
                        setVerifyError('');
                        disableMutation.mutate(v);
                      }
                    }}
                    autoFocus
                    ariaLabel={t('account.disable2fa.dialogTitle')}
                  />
                </div>

                {info.method !== 'TOTP' && (
                  <div className="mt-3 text-center text-[11px] text-fg-dim">
                    <button
                      type="button"
                      className="text-fg-muted underline-offset-2 hover:text-fg-strong hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={resend}
                      disabled={confirmRequestMutation.isPending}
                    >
                      {confirmRequestMutation.isPending
                        ? t('account.twoFactorSetup.resendPending')
                        : t('account.twoFactorSetup.resend')}
                    </button>
                  </div>
                )}

                {verifyError && (
                  <ErrorMessage size="xs" className="mt-3 text-center">
                    {verifyError}
                  </ErrorMessage>
                )}
              </>
            )}

            {requestError && !info && (
              <ErrorMessage size="xs" className="mt-3">
                {requestError}
              </ErrorMessage>
            )}
          </>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain type="button" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {!mandateError && (
          <Button
            color="red"
            type="button"
            onClick={submit}
            disabled={!info || !codeReady || disableMutation.isPending}
          >
            {disableMutation.isPending
              ? t('account.disable2fa.submitPending')
              : t('account.disable2fa.submit')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
