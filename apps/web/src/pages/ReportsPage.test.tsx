import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import { useCurrentUser } from '../hooks/useCurrentUser';
import ReportsPage from './ReportsPage';

function withCapabilities(capabilities: string[]) {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: { id: 'u1', capabilities },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCurrentUser>);
}

describe('ReportsPage', () => {
  afterEach(() => {
    vi.mocked(useCurrentUser).mockRestore?.();
  });

  it('renders the hub heading and description', () => {
    renderWithProviders(<ReportsPage />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText(/their numbers match home/i)).toBeInTheDocument();
  });

  it('lists each report the user can open under its group, tagging print lists', () => {
    withCapabilities(['VIEW_ALL_INVOICES']);
    renderWithProviders(<ReportsPage />);
    expect(screen.getByRole('heading', { name: 'reports.groups.money' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports.catalog.revenue.name/ })).toHaveAttribute('href', '/reports/revenue');
    const pull = screen.getByRole('link', { name: /reports.catalog.filter-pull-list.name/ });
    expect(pull).toHaveAttribute('href', '/reports/filter-pull-list');
    expect(pull).toHaveTextContent('reports.printList');
  });

  it('hides a report, and its empty group, without the capability', () => {
    withCapabilities([]);
    renderWithProviders(<ReportsPage />);
    expect(screen.queryByRole('link', { name: /reports.catalog.revenue.name/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'reports.groups.money' })).toBeNull();
    expect(screen.getByRole('link', { name: /reports.catalog.filter-pull-list.name/ })).toBeInTheDocument();
  });
});
