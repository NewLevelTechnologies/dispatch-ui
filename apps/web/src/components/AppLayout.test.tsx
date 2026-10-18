import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import AppLayout from './AppLayout';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const withInventory = (enableInventory: boolean) =>
  vi.mocked(apiClient.get).mockImplementation((url) =>
    Promise.resolve({ data: url === '/tenant-settings' ? { enableInventory } : {} }),
  );

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
    vi.clearAllMocks();
    withInventory(false);
  });

  it('groups the nav as Work, Financial, Purchasing, with no Equipment or Inventory', async () => {
    renderWithProviders(<AppLayout><div /></AppLayout>);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/tenant-settings'));
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

  it('shows the Inventory group after Purchasing when the tenant turned inventory on', async () => {
    withInventory(true);
    renderWithProviders(<AppLayout><div /></AppLayout>);
    expect(await screen.findByText('Inventory')).toBeInTheDocument();
    const order = navHrefs().filter((h) => h !== '/approvals' && h !== '/settings');
    expect(order.slice(-4)).toEqual(['/vendors', '/parts-inventory', '/warehouses', '/reports']);
    expect(order).not.toContain('/equipment');
  });

  it('lists Approvals only when something waits on this user', async () => {
    const respond = (pendingForMe: number) =>
      vi.mocked(apiClient.get).mockImplementation((url) =>
        Promise.resolve({
          data: url.endsWith('/workflow')
            ? { enforcementMode: 'STRICT', hasAnyApprovalRequests: true }
            : url === '/work-orders/approvals/count'
              ? { pendingForMe, recentlyResolvedMine: 0 }
              : {},
        }),
      );

    respond(0);
    const { unmount } = renderWithProviders(<AppLayout><div /></AppLayout>);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals/count'));
    expect(navHrefs()).not.toContain('/approvals');
    unmount();

    respond(2);
    renderWithProviders(<AppLayout><div /></AppLayout>);
    await waitFor(() => expect(navHrefs()).toContain('/approvals'));
  });
});
