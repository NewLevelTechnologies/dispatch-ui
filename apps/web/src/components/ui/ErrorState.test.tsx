/* eslint-disable i18next/no-literal-string */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders the title and uses role="alert"', () => {
    render(<ErrorState title="Couldn't load users" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load users")).toBeInTheDocument();
  });

  it('renders description in danger-500 and an action button', () => {
    render(
      <ErrorState
        title="Couldn't load users"
        description="Network error"
        action={<button>Try again</button>}
      />,
    );
    const desc = screen.getByText('Network error');
    expect(desc).toBeInTheDocument();
    expect(desc.className).toContain('text-danger-500');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
