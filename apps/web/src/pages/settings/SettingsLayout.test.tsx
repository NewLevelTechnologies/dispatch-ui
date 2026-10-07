/* eslint-disable i18next/no-literal-string */
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
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
    expect(links).toContain('/settings/company-profile');
    expect(links).toContain('/settings/terminology');
    expect(links).toContain('/settings/notifications');
    expect(links).toContain('/settings/dispatch-regions');
    expect(links).toContain('/settings/work-orders/types');
    expect(links).toContain('/settings/work-orders/divisions');
    expect(links).toContain('/settings/work-orders/item-statuses');
    expect(links).toContain('/settings/work-orders/workflows');
    expect(links).toContain('/settings/access/roles');
  });

  it('lists Revenue Targets only for someone who can set them', () => {
    const { unmount } = renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/general' });
    const hrefs = () => within(getRail()).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs()).not.toContain('/settings/revenue-targets');
    unmount();

    const original = vi.mocked(useHasAnyCapability).getMockImplementation();
    vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) =>
      caps.some((c) => c === 'VIEW_USERS' || c === 'MANAGE_REVENUE_TARGETS'),
    );
    renderWithProviders(<SettingsLayout />, { routes, initialPath: '/settings/general' });
    expect(hrefs()).toContain('/settings/revenue-targets');
    if (original) vi.mocked(useHasAnyCapability).mockImplementation(original);
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
