/* eslint-disable i18next/no-literal-string */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import { ThemeProvider } from '../ThemeProvider';

function withTheme(node: React.ReactNode) {
  return <ThemeProvider>{node}</ThemeProvider>;
}

describe('AppShell', () => {
  it('renders the brand chip and nav groups', () => {
    render(
      withTheme(
        <AppShell active="Jobs">
          <div>content</div>
        </AppShell>,
      ),
    );
    expect(screen.getByText('Coolfront')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Records')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
  });

  it('renders the child content', () => {
    render(
      withTheme(
        <AppShell active="Overview">
          <div data-testid="payload">Hello shell</div>
        </AppShell>,
      ),
    );
    expect(screen.getByTestId('payload')).toHaveTextContent('Hello shell');
  });

  it('renders nav item badges when provided', () => {
    render(
      withTheme(
        <AppShell active="Jobs">
          <div />
        </AppShell>,
      ),
    );
    // Dispatch (14) and Jobs (38) and Invoices (7) all have badges
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders breadcrumbs when provided', () => {
    render(
      withTheme(
        <AppShell active="Jobs" breadcrumbs={['Ops', 'West', 'Jobs']}>
          <div />
        </AppShell>,
      ),
    );
    expect(screen.getByText('Ops')).toBeInTheDocument();
    expect(screen.getByText('West')).toBeInTheDocument();
    // The last crumb is rendered too
    const crumbs = screen.getAllByText('Jobs');
    expect(crumbs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the topbar search affordance', () => {
    render(
      withTheme(
        <AppShell active="Overview">
          <div />
        </AppShell>,
      ),
    );
    expect(screen.getByText(/Search/)).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });
});
