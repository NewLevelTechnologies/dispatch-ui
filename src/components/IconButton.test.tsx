import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconButton from './IconButton';

describe('IconButton', () => {
  it('renders children and exposes aria-label', () => {
    render(
      <IconButton aria-label="Delete">
        <span data-testid="icon">×</span>
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton aria-label="Move up" onClick={onClick}>
        ↑
      </IconButton>
    );
    await user.click(screen.getByRole('button', { name: 'Move up' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('honors the disabled prop and skips onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton aria-label="Move up" onClick={onClick} disabled>
        ↑
      </IconButton>
    );
    const btn = screen.getByRole('button', { name: 'Move up' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults type to "button" so it does not submit a parent form', () => {
    render(
      <IconButton aria-label="Test">
        <span data-testid="icon-test" />
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Test' })).toHaveAttribute('type', 'button');
  });

  it('appends a custom className without dropping defaults', () => {
    render(
      <IconButton aria-label="Custom" className="my-special-class">
        <span data-testid="icon-custom" />
      </IconButton>
    );
    const btn = screen.getByRole('button', { name: 'Custom' });
    expect(btn.className).toContain('my-special-class');
    // Default tight padding should still be present
    expect(btn.className).toContain('p-0.5');
  });
});
