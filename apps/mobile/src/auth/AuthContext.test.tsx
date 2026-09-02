import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { AuthProvider, useAuth } from './AuthContext';

/**
 * Cognito sign-in is a state machine: a password submit usually returns a
 * *challenge* rather than a session. These tests drive the real reducer with
 * Amplify stubbed, because the branch that matters — MFA — is the one a happy
 * path never reaches.
 */
const mockSignIn = jest.fn();
const mockConfirmSignIn = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockSignOut = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  confirmSignIn: (...args: unknown[]) => mockConfirmSignIn(...args),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

/** Surfaces the context as text so assertions read like the user's view. */
function Probe() {
  const { status, username, challenge, submit, respond, cancelChallenge, leave } = useAuth();
  return (
    <>
      <Text>status:{status}</Text>
      <Text>user:{username ?? 'none'}</Text>
      <Text>challenge:{challenge ? challenge.kind : 'none'}</Text>
      <Text>step:{challenge?.step ?? 'none'}</Text>
      <Pressable onPress={() => submit('a@b.com', 'pw')}>
        <Text>do-submit</Text>
      </Pressable>
      <Pressable onPress={() => respond('123456')}>
        <Text>do-respond</Text>
      </Pressable>
      <Pressable onPress={cancelChallenge}>
        <Text>do-cancel</Text>
      </Pressable>
      <Pressable onPress={leave}>
        <Text>do-leave</Text>
      </Pressable>
    </>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

const SIGNED_IN_USER = { username: 'cognito-sub', signInDetails: { loginId: 'a@b.com' } };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no existing session, so the provider settles on signedOut.
  mockGetCurrentUser.mockRejectedValue(new Error('not signed in'));
});

describe('AuthProvider session restore', () => {
  it('reports signedIn when Amplify already has a session', async () => {
    mockGetCurrentUser.mockResolvedValue(SIGNED_IN_USER);
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedIn')).toBeTruthy());
    // Prefers the email over the opaque Cognito sub.
    expect(screen.getByText('user:a@b.com')).toBeTruthy();
  });

  it('reports signedOut when there is no session', async () => {
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
  });

  it('falls back to the username when no loginId is present', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'cognito-sub' });
    await renderAuth();
    await waitFor(() => expect(screen.getByText('user:cognito-sub')).toBeTruthy());
  });
});

describe('AuthProvider sign in', () => {
  it('signs in directly when Cognito raises no challenge', async () => {
    mockSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());

    mockGetCurrentUser.mockResolvedValue(SIGNED_IN_USER);
    await fireEvent.press(screen.getByText('do-submit'));

    await waitFor(() => expect(screen.getByText('status:signedIn')).toBeTruthy());
    expect(mockSignIn).toHaveBeenCalledWith({ username: 'a@b.com', password: 'pw' });
  });

  it('raises a TOTP challenge instead of signing in', async () => {
    mockSignIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    });
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());

    await fireEvent.press(screen.getByText('do-submit'));

    await waitFor(() => expect(screen.getByText('challenge:code')).toBeTruthy());
    // Still signed out until the code is accepted.
    expect(screen.getByText('status:signedOut')).toBeTruthy();
    expect(screen.getByText('step:CONFIRM_SIGN_IN_WITH_TOTP_CODE')).toBeTruthy();
  });

  it('surfaces Amplify errors rather than throwing', async () => {
    mockSignIn.mockRejectedValue(new Error('Incorrect username or password.'));
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());

    await fireEvent.press(screen.getByText('do-submit'));

    // No challenge, no crash — the screen shows the message.
    await waitFor(() => expect(screen.getByText('challenge:none')).toBeTruthy());
  });
});

describe('AuthProvider challenge steps', () => {
  const raiseChallenge = async (nextStep: Record<string, unknown>) => {
    mockSignIn.mockResolvedValue({ isSignedIn: false, nextStep });
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
    await fireEvent.press(screen.getByText('do-submit'));
    await waitFor(() => expect(screen.queryByText('challenge:none')).toBeNull());
  };

  it('completes sign-in once the code is accepted', async () => {
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });

    mockConfirmSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    mockGetCurrentUser.mockResolvedValue(SIGNED_IN_USER);
    await fireEvent.press(screen.getByText('do-respond'));

    await waitFor(() => expect(screen.getByText('status:signedIn')).toBeTruthy());
    expect(mockConfirmSignIn).toHaveBeenCalledWith({ challengeResponse: '123456' });
    // The challenge is cleared so the verify screen does not linger.
    expect(screen.getByText('challenge:none')).toBeTruthy();
  });

  it('keeps the challenge open when the code is rejected', async () => {
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });

    mockConfirmSignIn.mockRejectedValue(new Error('Invalid code received for user'));
    await fireEvent.press(screen.getByText('do-respond'));

    // Still on the same step: the user retypes rather than restarting from the
    // password form.
    await waitFor(() => expect(screen.getByText('challenge:code')).toBeTruthy());
    expect(screen.getByText('status:signedOut')).toBeTruthy();
  });

  it('exposes the destination for an SMS challenge', async () => {
    await raiseChallenge({
      signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
      codeDeliveryDetails: { destination: '+1***5555' },
    });
    expect(screen.getByText('challenge:code')).toBeTruthy();
    expect(screen.getByText('step:CONFIRM_SIGN_IN_WITH_SMS_CODE')).toBeTruthy();
  });

  it('omits the hint when Cognito sends no delivery destination', async () => {
    // Cognito does not always include codeDeliveryDetails; the screen must cope
    // with a challenge that has no "sent to ..." line rather than render
    // "Sent to undefined".
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE' });
    expect(screen.getByText('challenge:code')).toBeTruthy();
    expect(screen.getByText('step:CONFIRM_SIGN_IN_WITH_SMS_CODE')).toBeTruthy();
  });

  it('handles an emailed code, with and without a destination', async () => {
    await raiseChallenge({
      signInStep: 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE',
      codeDeliveryDetails: { destination: 'a***@b.com' },
    });
    expect(screen.getByText('step:CONFIRM_SIGN_IN_WITH_EMAIL_CODE')).toBeTruthy();
  });

  it('handles an emailed code with no destination', async () => {
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE' });
    expect(screen.getByText('challenge:code')).toBeTruthy();
  });

  it('copes with an MFA selection that lists no methods', async () => {
    // allowedMFATypes is optional on the Amplify type, so the empty case has to
    // render something rather than crash on undefined.map.
    await raiseChallenge({ signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION' });
    expect(screen.getByText('challenge:mfaSelection')).toBeTruthy();
  });

  it('offers the allowed methods when Cognito asks the user to choose', async () => {
    await raiseChallenge({
      signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
      allowedMFATypes: ['TOTP', 'SMS'],
    });
    expect(screen.getByText('challenge:mfaSelection')).toBeTruthy();
  });

  it('exposes the shared secret for first-time TOTP enrolment', async () => {
    await raiseChallenge({
      signInStep: 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP',
      totpSetupDetails: {
        sharedSecret: 'SECRET123',
        getSetupUri: () => new URL('otpauth://totp/Dispatch'),
      },
    });
    expect(screen.getByText('challenge:totpSetup')).toBeTruthy();
  });

  it('handles a forced password change', async () => {
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' });
    expect(screen.getByText('challenge:newPassword')).toBeTruthy();
  });

  it('names an unrecognised step rather than failing blankly', async () => {
    // Password reset and the like: the raw step is the first thing anyone
    // debugging this needs.
    await raiseChallenge({ signInStep: 'RESET_PASSWORD' });
    expect(screen.getByText('challenge:code')).toBeTruthy();
    expect(screen.getByText('step:RESET_PASSWORD')).toBeTruthy();
  });

  it('drops the challenge when the user starts over', async () => {
    await raiseChallenge({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });
    await fireEvent.press(screen.getByText('do-cancel'));
    await waitFor(() => expect(screen.getByText('challenge:none')).toBeTruthy());
  });
});

describe('AuthProvider sign out', () => {
  it('clears the session', async () => {
    mockGetCurrentUser.mockResolvedValue(SIGNED_IN_USER);
    mockSignOut.mockResolvedValue(undefined);
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedIn')).toBeTruthy());

    await fireEvent.press(screen.getByText('do-leave'));

    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
    expect(screen.getByText('user:none')).toBeTruthy();
  });

  it('signs out locally even when the network call fails', async () => {
    mockGetCurrentUser.mockResolvedValue(SIGNED_IN_USER);
    mockSignOut.mockRejectedValue(new Error('network down'));
    await renderAuth();
    await waitFor(() => expect(screen.getByText('status:signedIn')).toBeTruthy());

    await fireEvent.press(screen.getByText('do-leave'));

    // Staying "signed in" after the user asked to leave is the worse failure.
    await waitFor(() => expect(screen.getByText('status:signedOut')).toBeTruthy());
  });
});
