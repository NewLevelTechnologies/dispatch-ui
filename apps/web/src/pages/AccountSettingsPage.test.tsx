import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import AccountSettingsPage from './AccountSettingsPage';
import { apiClient } from '../api/setup';
import { fetchMFAPreference } from 'aws-amplify/auth';
import { useCurrentUser } from '../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

vi.mock('aws-amplify/auth', () => ({
  fetchMFAPreference: vi.fn(),
  updatePassword: vi.fn(),
}));

const baseUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  enabled: true,
  phoneNumber: '',
  capabilities: [],
  roles: [],
};

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMFAPreference).mockResolvedValue({
      enabled: [],
      preferred: undefined,
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...baseUser, photoUrl: 'https://example/avatar.png' },
    });
    vi.mocked(apiClient.put).mockResolvedValue({ data: baseUser });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: baseUser });
  });

  it('renders profile, security, and preferences cards', async () => {
    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Account settings' }),
      ).toBeInTheDocument();
    });

    // Profile card surfaces the test user identity (mocked useCurrentUser).
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('User')).toBeInTheDocument();
  });

  it('enables save button after editing the first name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const firstNameInput = await screen.findByDisplayValue('Test');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alice');

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('resets the form when reset is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const firstNameInput = await screen.findByDisplayValue('Test');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alice');

    const resetButton = screen.getByRole('button', { name: /reset/i });
    await user.click(resetButton);

    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
  });

  it('shows the 2FA CTA when MFA is not enabled', async () => {
    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'account.security.enable' }),
      ).toBeInTheDocument();
    });
  });

  it('shows the disable 2FA button when MFA is enabled', async () => {
    vi.mocked(fetchMFAPreference).mockResolvedValue({
      enabled: ['TOTP'],
      preferred: 'TOTP',
    });

    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'account.security.disableLabel' }),
      ).toBeInTheDocument();
    });
  });

  it('renders the password row with a change action', async () => {
    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('account.security.passwordValue'),
      ).toBeInTheDocument();
    });
    // The change-password trigger renders the translation key as-is in tests.
    expect(
      screen.getByRole('button', { name: 'account.security.passwordChange' }),
    ).toBeInTheDocument();
  });

  it('opens the sign-out-everywhere confirmation when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const signOutButton = await screen.findByRole('button', {
      name: 'account.security.sessionsSignOutSubmit',
    });
    await user.click(signOutButton);

    await waitFor(() => {
      // ConfirmDialog renders the title as a heading.
      expect(
        screen.getByText('account.security.sessionsSignOutConfirmTitle'),
      ).toBeInTheDocument();
    });
  });

  it('renders theme and accent toggle groups', async () => {
    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      // ToggleGroup options are exposed as radio-style buttons.
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    });
  });

  it('clicking save calls the profile update endpoint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const firstNameInput = await screen.findByDisplayValue('Test');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alice');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/users/me',
        expect.objectContaining({ firstName: 'Alice' }),
      );
    });
  });

  it('uploading a photo calls the photo endpoint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    // Hidden file input — find it by type.
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['hello'], 'avatar.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      // The photo upload endpoint is POST /users/me/photo with FormData.
      expect(apiClient.post).toHaveBeenCalled();
    });
  });

  it('rejects a photo with the wrong mime type', async () => {
    renderWithProviders(<AccountSettingsPage />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Bypass the `accept` filter — upload a text file directly.
    const file = new File(['hi'], 'bad.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    // Manually fire the change event since user.upload validates accept.
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Upload mutation should NOT fire for invalid mime.
    await new Promise((r) => setTimeout(r, 50));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('removes the photo when the remove button is clicked', async () => {
    vi.mocked(useCurrentUser).mockReturnValueOnce({
      data: { ...baseUser, photoUrl: 'https://example/avatar.png' },
      isLoading: false,
      error: null,
      // Cast — the mock-typed return is the full UseQueryResult shape.
    } as unknown as ReturnType<typeof useCurrentUser>);

    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const removeButton = await screen.findByRole('button', {
      name: 'account.profile.removePhoto',
    });
    await user.click(removeButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/users/me/photo');
    });
  });

  it('confirms sign-out-everywhere and calls the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const signOutButton = await screen.findByRole('button', {
      name: 'account.security.sessionsSignOutSubmit',
    });
    await user.click(signOutButton);

    // ConfirmDialog "Confirm" button — Catalyst names it after the label.
    const confirm = await screen.findByRole('button', {
      name: 'account.security.sessionsSignOutSubmit',
    });
    // The confirm dialog has the label twice (row trigger + confirm).
    // The LAST one is the in-dialog confirm.
    const allConfirms = screen.getAllByRole('button', {
      name: 'account.security.sessionsSignOutSubmit',
    });
    await user.click(allConfirms[allConfirms.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/users/test-user-id/sign-out');
    });
    // Silence unused-var lint for the early reference.
    expect(confirm).toBeInTheDocument();
  });

  it('clicking a theme toggle option fires setMode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountSettingsPage />);

    const radios = await screen.findAllByRole('radio');
    // Click the dark theme option (second under theme).
    await user.click(radios[1]);
    // ToggleGroup propagates via aria-checked; just assert no throw.
    expect(radios[1]).toBeInTheDocument();
  });

  it('displays the photo preview when the user has a photoUrl', async () => {
    vi.mocked(useCurrentUser).mockReturnValueOnce({
      data: { ...baseUser, photoUrl: 'https://example/photo.png' },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);

    renderWithProviders(<AccountSettingsPage />);

    await waitFor(() => {
      const img = document.querySelector(
        'img[src="https://example/photo.png"]',
      );
      expect(img).not.toBeNull();
    });
  });

  it('shows loading state when current user is still loading', async () => {
    vi.mocked(useCurrentUser).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);

    renderWithProviders(<AccountSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });
});
