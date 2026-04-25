/* eslint-disable i18next/no-literal-string */
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import SettingsLayout from './SettingsLayout';

describe('SettingsLayout', () => {
  const routes = [
    {
      path: '/settings',
      element: <SettingsLayout />,
      children: [
        { path: 'general', element: <div>General Panel</div> },
        { path: 'terminology', element: <div>Terminology Panel</div> },
        { path: 'work-orders/types', element: <div>Types Panel</div> },
      ],
    },
  ];

  // Helper: scope queries to the settings rail nav (avoids collisions with
  // the surrounding AppLayout's main sidebar).
  const getRail = () => screen.getByRole('complementary');

  it('renders all settings nav items', () => {
    renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/general' });

    const rail = getRail();
    const links = within(rail).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/settings/general');
    expect(links).toContain('/settings/terminology');
    expect(links).toContain('/settings/notification-templates');
    expect(links).toContain('/settings/dispatch-regions');
    expect(links).toContain('/settings/work-orders/types');
    expect(links).toContain('/settings/work-orders/divisions');
    expect(links).toContain('/settings/work-orders/item-statuses');
    expect(links).toContain('/settings/work-orders/status-workflows');
    expect(links).toContain('/settings/work-orders/workflow-config');
    expect(links).toContain('/settings/access/roles');
  });

  it('renders section headers in the rail', () => {
    renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/general' });
    const rail = getRail();
    expect(within(rail).getByText('Organization')).toBeInTheDocument();
    expect(within(rail).getByText('Dispatch')).toBeInTheDocument();
    expect(within(rail).getByText('Work Orders')).toBeInTheDocument();
    expect(within(rail).getByText('Access')).toBeInTheDocument();
  });

  it('renders the outlet for the current route', () => {
    renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/terminology' });
    expect(screen.getByText('Terminology Panel')).toBeInTheDocument();
  });

  it('marks the active item via aria-current', () => {
    renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/work-orders/types' });
    const rail = getRail();
    const activeLink = within(rail).getByRole('link', { current: 'page' });
    expect(activeLink).toHaveAttribute('href', '/settings/work-orders/types');
  });
});
