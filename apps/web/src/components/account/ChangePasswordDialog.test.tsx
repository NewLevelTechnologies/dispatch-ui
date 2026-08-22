import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import ChangePasswordDialog from './ChangePasswordDialog';
import { updatePassword } from 'aws-amplify/auth';

vi.mock('aws-amplify/auth', () => ({
  updatePassword: vi.fn(),
}));

describe('ChangePasswordDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and the three password inputs when open', () => {
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);
    expect(screen.getByText('account.changePasswordDialog.title')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the tooShort error when the new password is < 8 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);

    const inputs = document.querySelectorAll('input[type="password"]');
    await user.type(inputs[0] as HTMLInputElement, 'oldpass12');
    await user.type(inputs[1] as HTMLInputElement, 'short');
    await user.type(inputs[2] as HTMLInputElement, 'short');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(
      await screen.findByText('account.changePasswordDialog.tooShort'),
    ).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('shows the mismatch error when confirm does not match new password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);

    const inputs = document.querySelectorAll('input[type="password"]');
    await user.type(inputs[0] as HTMLInputElement, 'oldpass12');
    await user.type(inputs[1] as HTMLInputElement, 'newpass123');
    await user.type(inputs[2] as HTMLInputElement, 'different123');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(
      await screen.findByText('account.changePasswordDialog.mismatch'),
    ).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('calls updatePassword and closes on a successful submit', async () => {
    vi.mocked(updatePassword).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);

    const inputs = document.querySelectorAll('input[type="password"]');
    await user.type(inputs[0] as HTMLInputElement, 'oldpass123');
    await user.type(inputs[1] as HTMLInputElement, 'newpass123');
    await user.type(inputs[2] as HTMLInputElement, 'newpass123');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith({
        oldPassword: 'oldpass123',
        newPassword: 'newpass123',
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('surfaces an error message when updatePassword rejects', async () => {
    vi.mocked(updatePassword).mockRejectedValue(new Error('Incorrect current password'));

    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);

    const inputs = document.querySelectorAll('input[type="password"]');
    await user.type(inputs[0] as HTMLInputElement, 'oldpass123');
    await user.type(inputs[1] as HTMLInputElement, 'newpass123');
    await user.type(inputs[2] as HTMLInputElement, 'newpass123');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText('Incorrect current password')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets state and closes when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordDialog isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
