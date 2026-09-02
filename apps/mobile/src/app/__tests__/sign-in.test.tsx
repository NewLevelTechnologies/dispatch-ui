import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../../auth/AuthContext';
import SignInScreen from '../sign-in';

/**
 * Drives the screen against the REAL auth context with Amplify stubbed, so the
 * form and the challenge state machine are exercised together. Mocking useAuth
 * would test the markup and nothing about whether the two actually agree.
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

// The screen only uses Stack.Screen to set a title; navigation itself is the
// layout's job and is covered separately.
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

const renderSignIn = async () => {
  const result = await render(
    <AuthProvider>
      <SignInScreen />
    </AuthProvider>
  );
  // Wait past the session-restore effect so the form is settled.
  await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy());
  return result;
};

/** Fills the form and submits, which is the entry to every challenge path. */
async function submitCredentials() {
  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com');
  const inputs = screen.getAllByDisplayValue('');
  await fireEvent.changeText(inputs[inputs.length - 1], 'hunter2');
  await fireEvent.press(screen.getByText('Sign in'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockRejectedValue(new Error('not signed in'));
});

describe('SignInScreen password step', () => {
  it('renders the credential form', async () => {
    await renderSignIn();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByText('Sign in to your account')).toBeTruthy();
  });

  it('does not call Amplify until both fields are filled', async () => {
    await renderSignIn();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits the typed credentials', async () => {
    mockSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    mockGetCurrentUser.mockResolvedValue({ username: 'x', signInDetails: { loginId: 'a@b.com' } });
    await renderSignIn();

    await submitCredentials();

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({ username: 'a@b.com', password: 'hunter2' })
    );
  });

  it('shows the reason a sign-in was rejected', async () => {
    mockSignIn.mockRejectedValue(new Error('Incorrect username or password.'));
    await renderSignIn();

    await submitCredentials();

    await waitFor(() =>
      expect(screen.getByText('Incorrect username or password.')).toBeTruthy()
    );
  });
});

describe('SignInScreen challenge step', () => {
  const raise = async (nextStep: Record<string, unknown>) => {
    mockSignIn.mockResolvedValue({ isSignedIn: false, nextStep });
    await renderSignIn();
    await submitCredentials();
  };

  it('asks for the authenticator code on a TOTP challenge', async () => {
    await raise({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });

    await waitFor(() => expect(screen.getByText('Verification')).toBeTruthy());
    expect(screen.getByText('Authenticator code')).toBeTruthy();
    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy();
    // The raw Cognito step stays visible as a debugging aid.
    expect(screen.getByText('CONFIRM_SIGN_IN_WITH_TOTP_CODE')).toBeTruthy();
  });

  it('sends the entered code to Cognito', async () => {
    await raise({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });
    await waitFor(() => expect(screen.getByText('Verification')).toBeTruthy());

    mockConfirmSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    mockGetCurrentUser.mockResolvedValue({ username: 'x', signInDetails: { loginId: 'a@b.com' } });

    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '123456');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() =>
      expect(mockConfirmSignIn).toHaveBeenCalledWith({ challengeResponse: '123456' })
    );
  });

  it('keeps the user on the code screen when the code is wrong', async () => {
    await raise({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });
    await waitFor(() => expect(screen.getByText('Verification')).toBeTruthy());

    mockConfirmSignIn.mockRejectedValue(new Error('Invalid code received for user'));
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() =>
      expect(screen.getByText('Invalid code received for user')).toBeTruthy()
    );
    // Still on the challenge, so the code can be retyped.
    expect(screen.getByText('Authenticator code')).toBeTruthy();
  });

  it('names the SMS destination when Cognito supplies one', async () => {
    await raise({
      signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
      codeDeliveryDetails: { destination: '+1***5555' },
    });
    await waitFor(() => expect(screen.getByText('SMS code')).toBeTruthy());
    expect(screen.getByText('Sent to +1***5555.')).toBeTruthy();
  });

  it('lists the methods when the account has more than one', async () => {
    await raise({
      signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
      allowedMFATypes: ['TOTP', 'SMS'],
    });
    await waitFor(() => expect(screen.getByText('Choose a method')).toBeTruthy());
    expect(screen.getByText('TOTP')).toBeTruthy();
    expect(screen.getByText('SMS')).toBeTruthy();
  });

  it('answers the selection with the chosen method', async () => {
    await raise({
      signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
      allowedMFATypes: ['TOTP', 'SMS'],
    });
    await waitFor(() => expect(screen.getByText('Choose a method')).toBeTruthy());

    mockConfirmSignIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    });
    await fireEvent.press(screen.getByText('TOTP'));

    await waitFor(() => expect(mockConfirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'TOTP' }));
  });

  it('shows the shared secret for first-time enrolment', async () => {
    await raise({
      signInStep: 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP',
      totpSetupDetails: {
        sharedSecret: 'SECRETABC123',
        getSetupUri: () => new URL('otpauth://totp/Dispatch'),
      },
    });
    await waitFor(() => expect(screen.getByText('SECRETABC123')).toBeTruthy());
    expect(
      screen.getByText('Add this secret to your authenticator app, then enter the code it shows.')
    ).toBeTruthy();
  });

  it('prompts for a replacement password when Cognito forces a change', async () => {
    await raise({ signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' });
    await waitFor(() => expect(screen.getByText('Set a new password')).toBeTruthy());
    expect(screen.getByText('This account requires a new password before signing in.')).toBeTruthy();
  });

  it('returns to the credential form on start over', async () => {
    await raise({ signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' });
    await waitFor(() => expect(screen.getByText('Verification')).toBeTruthy());

    await fireEvent.press(screen.getByText('Start over'));

    await waitFor(() => expect(screen.getByText('Sign in to your account')).toBeTruthy());
  });
});
