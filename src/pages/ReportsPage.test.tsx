import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import ReportsPage from './ReportsPage';

describe('ReportsPage', () => {
  it('renders the hub heading and description', () => {
    renderWithProviders(<ReportsPage />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText(/operational, financial, and equipment reports/i)).toBeInTheDocument();
  });

  it('renders a card for each registered report grouped by category', () => {
    renderWithProviders(<ReportsPage />);
    // The Filter Pull List report ships in the registry.
    expect(screen.getByRole('link', { name: /filter pull list/i })).toHaveAttribute(
      'href',
      '/reports/filter-pull-list'
    );
  });
});
