import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import AppLayout from './AppLayout';

const mockFlags = vi.hoisted(() => ({ inventory: false }));
vi.mock('../lib/featureFlags', () => ({ flags: mockFlags }));
vi.mock('@dispatch/api/src/client');

const NAV = [
  '/dashboard', '/dispatch', '/approvals',
  '/work-orders', '/customers', '/service-locations', '/agreements',
  '/quotes', '/invoices', '/payments',
  '/purchasing', '/vendors',
  '/parts-inventory', '/warehouses', '/equipment',
  '/reports', '/settings',
];
const navHrefs = () =>
  screen
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
    .filter((h): h is string => !!h && NAV.includes(h));

describe('AppLayout sidebar', () => {
  beforeEach(() => {
    mockFlags.inventory = false;
  });

  it('groups the nav as Work, Financial, Purchasing, with no Equipment or Inventory', () => {
    renderWithProviders(<AppLayout><div /></AppLayout>);
    const hrefs = navHrefs();
    expect(hrefs.slice(0, 2)).toEqual(['/dashboard', '/dispatch']);
    const order = hrefs.filter((h) => h !== '/approvals' && h !== '/settings');
    expect(order).toEqual([
      '/dashboard', '/dispatch',
      '/work-orders', '/customers', '/service-locations', '/agreements',
      '/quotes', '/invoices', '/payments',
      '/purchasing', '/vendors',
      '/reports',
    ]);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
  });

  it('shows the Inventory group after Purchasing when inventory is on', () => {
    mockFlags.inventory = true;
    renderWithProviders(<AppLayout><div /></AppLayout>);
    const order = navHrefs().filter((h) => h !== '/approvals' && h !== '/settings');
    expect(order.slice(-4)).toEqual(['/vendors', '/parts-inventory', '/warehouses', '/reports']);
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(order).not.toContain('/equipment');
  });
});
