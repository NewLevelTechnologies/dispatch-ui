import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders the title, message, and default action labels', () => {
    renderWithProviders(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete user?"
        message="This cannot be undone."
      />,
    );

    expect(screen.getByText('Delete user?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  it('uses custom action labels when provided', () => {
    renderWithProviders(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Archive?"
        message="The record will be hidden."
        confirmLabel="Archive it"
        cancelLabel="Keep it"
      />,
    );

    expect(screen.getByRole('button', { name: /archive it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep it/i })).toBeInTheDocument();
  });

  it('fires onConfirm then onClose when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm?"
        message="Are you sure?"
      />,
    );

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose (but not onConfirm) when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm?"
        message="Are you sure?"
      />,
    );

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both action buttons while pending', () => {
    renderWithProviders(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm?"
        message="Are you sure?"
        isPending={true}
      />,
    );

    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
  });
});
