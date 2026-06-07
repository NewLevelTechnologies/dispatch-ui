import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagPill } from './TagPill';

describe('TagPill', () => {
  it('renders the tinted tone class for the color enum', () => {
    const { container } = render(<TagPill color="ACCENT_2" name="Roof access" />);
    const pill = container.querySelector('span.pill');
    expect(pill).toHaveClass('teal');
    expect(screen.getByText('Roof access')).toBeInTheDocument();
  });

  it('falls back to neutral for off-enum / legacy hex values', () => {
    const { container } = render(<TagPill color="#3b82f6" name="Legacy" />);
    expect(container.querySelector('span.pill')).toHaveClass('neutral');
  });

  it('is read-only by default (no remove button)', () => {
    render(<TagPill color="INFO" name="VIP" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a remove button that fires onRemove when provided', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<TagPill color="INFO" name="VIP" onRemove={onRemove} removeLabel="Remove tag VIP" />);
    await user.click(screen.getByRole('button', { name: 'Remove tag VIP' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('hides the remove button until hover when removeOnHover is set', () => {
    render(
      <TagPill color="INFO" name="VIP" onRemove={vi.fn()} removeLabel="Remove tag VIP" removeOnHover />
    );
    // Still in the tree (so layout never shifts) but visually hidden at rest.
    const button = screen.getByRole('button', { name: 'Remove tag VIP' });
    expect(button).toHaveClass('opacity-0');
    expect(button).toHaveClass('group-hover/tagpill:opacity-60');
  });
});
