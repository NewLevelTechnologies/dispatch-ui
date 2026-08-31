/* eslint-disable i18next/no-literal-string */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No users yet" />);
    expect(screen.getByText('No users yet')).toBeInTheDocument();
  });

  it('renders icon, description, and action when provided', () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="No users yet"
        description="Invite your team."
        action={<button>Add user</button>}
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Invite your team.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
  });

  it('compact variant skips the icon even when provided', () => {
    render(
      <EmptyState
        compact
        icon={<svg data-testid="icon" />}
        title="No regions assigned"
      />,
    );
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(screen.getByText('No regions assigned')).toBeInTheDocument();
  });
});
