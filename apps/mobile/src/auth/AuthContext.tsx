import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { confirmSignIn, getCurrentUser, signIn, signOut } from 'aws-amplify/auth';
import type { SignInOutput } from 'aws-amplify/auth';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

/**
 * Cognito sign-in is a state machine, not a single call: submitting a password
 * often returns a *challenge* rather than a session. The web app never has to
 * model this because @aws-amplify/ui-react's <Authenticator> handles it, but
 * there is no equivalent in use here, so we drive the steps ourselves.
 *
 * `prompt` is what the code input asks for; `entry` is what the user types.
 */
export type Challenge =
  /** A one-time code: TOTP authenticator app, SMS, or emailed code. */
  | {
      kind: 'code';
      step: string;
      promptKey: string;
      hintKey?: string;
      hintValues?: Record<string, string>;
    }
  /** The pool allows more than one MFA method and wants the user to pick. */
  | { kind: 'mfaSelection'; step: string; options: string[] }
  /** First TOTP enrolment — the secret must be added to an authenticator app. */
  | { kind: 'totpSetup'; step: string; secret: string; uri: string }
  /** Admin-created or expired password that must be replaced before sign-in. */
  | { kind: 'newPassword'; step: string };

type AuthValue = {
  status: AuthStatus;
  username: string | null;
  /** Non-null while Cognito is waiting on a challenge response. */
  challenge: Challenge | null;
  /** Resolves to null on success, or a human-readable reason it did not proceed. */
  submit: (email: string, password: string) => Promise<string | null>;
  /** Answers the outstanding challenge (a code, an MFA choice, or a new password). */
  respond: (entry: string) => Promise<string | null>;
  cancelChallenge: () => void;
  leave: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Maps Cognito's nextStep onto something the sign-in screen can render. */
function toChallenge(next: SignInOutput['nextStep']): Challenge | null {
  switch (next.signInStep) {
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return {
        kind: 'code',
        step: next.signInStep,
        promptKey: 'auth.authenticatorCode',
        hintKey: 'auth.totpHint',
      };

    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
      return {
        kind: 'code',
        step: next.signInStep,
        promptKey: 'auth.smsCode',
        hintKey: next.codeDeliveryDetails?.destination ? 'auth.codeSentTo' : undefined,
        hintValues: next.codeDeliveryDetails?.destination
          ? { destination: next.codeDeliveryDetails.destination }
          : undefined,
      };

    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
      return {
        kind: 'code',
        step: next.signInStep,
        promptKey: 'auth.emailCode',
        hintKey: next.codeDeliveryDetails?.destination ? 'auth.codeSentTo' : undefined,
        hintValues: next.codeDeliveryDetails?.destination
          ? { destination: next.codeDeliveryDetails.destination }
          : undefined,
      };

    case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
      return {
        kind: 'mfaSelection',
        step: next.signInStep,
        options: [...(next.allowedMFATypes ?? [])],
      };

    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP':
      return {
        kind: 'totpSetup',
        step: next.signInStep,
        secret: next.totpSetupDetails.sharedSecret,
        uri: next.totpSetupDetails.getSetupUri('Dispatch').toString(),
      };

    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return { kind: 'newPassword', step: next.signInStep };

    case 'DONE':
      return null;

    default:
      // Password reset, sign-up confirmation and the like. Surfacing the raw
      // step is more useful than a generic failure — it names what Cognito
      // wants, which is the first thing anyone debugging this needs.
      return {
        kind: 'code',
        step: next.signInStep,
        promptKey: 'auth.responseLabel',
        hintKey: 'auth.cognitoRequested',
        hintValues: { step: next.signInStep },
      };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [username, setUsername] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  // Amplify persists tokens across launches, so on start we ask whether a
  // session already exists rather than always showing the sign-in screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!cancelled) {
          setUsername(user.signInDetails?.loginId ?? user.username);
          setStatus('signedIn');
        }
      } catch {
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settle = useCallback(async (output: SignInOutput) => {
    if (output.isSignedIn) {
      const user = await getCurrentUser();
      setUsername(user.signInDetails?.loginId ?? user.username);
      setChallenge(null);
      setStatus('signedIn');
      return null;
    }
    setChallenge(toChallenge(output.nextStep));
    return null;
  }, []);

  const submit = useCallback(
    async (email: string, password: string) => {
      try {
        return await settle(await signIn({ username: email, password }));
      } catch (error) {
        return error instanceof Error ? error.message : t('auth.signInFailed');
      }
    },
    [settle, t]
  );

  const respond = useCallback(
    async (entry: string) => {
      try {
        return await settle(await confirmSignIn({ challengeResponse: entry }));
      } catch (error) {
        // A wrong TOTP code lands here. Cognito keeps the challenge open, so
        // stay on the same screen and let the user retype rather than kicking
        // them back to the password form.
        return error instanceof Error ? error.message : t('auth.verifyCodeFailed');
      }
    },
    [settle, t]
  );

  const cancelChallenge = useCallback(() => setChallenge(null), []);

  const leave = useCallback(async () => {
    try {
      await signOut();
    } finally {
      // Drop local state even if the network call failed — staying "signed in"
      // after the user asked to leave is the worse failure.
      setUsername(null);
      setChallenge(null);
      setStatus('signedOut');
    }
  }, []);

  const value = useMemo(
    () => ({ status, username, challenge, submit, respond, cancelChallenge, leave }),
    [status, username, challenge, submit, respond, cancelChallenge, leave]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
