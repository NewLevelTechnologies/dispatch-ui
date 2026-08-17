import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomerFormPage from './CustomerFormPage';
import apiClient from '../api/client';

vi.mock('../api/client');

// Active regions are returned empty so the region select is hidden — keeps the
// required-field surface to the customer + address fields for these tests.
function mockGets() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/tenant-settings') return Promise.resolve({ data: { defaultPremiseType: 'BUSINESS' } });
    if (url === '/tenant/dispatch-regions/default') return Promise.resolve({ data: null });
    if (url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [] });
    if (url.startsWith('/users')) return Promise.resolve({ data: { content: [] } });
    if (url.startsWith('/customers/duplicate-check')) return Promise.resolve({ data: { candidates: [] } });
    if (url.startsWith('/customers/search')) return Promise.resolve({ data: { content: [] } });
    return Promise.reject(new Error(`Unknown endpoint: ${url}`));
  });
}

function renderAddCustomer() {
  const routes: RouteObject[] = [
    { path: '/customers/new', element: <CustomerFormPage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/customers/:id', element: <div>Customer detail</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/service-locations/:id', element: <div>Location detail</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/customers', element: <div>Customers list</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<CustomerFormPage />, {
    routes,
    initialEntries: ['/customers/new'],
  });
}

describe('CustomerFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGets();
  });

  it('renders the add-customer heading', async () => {
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });
  });

  it('does not submit when required fields are empty', async () => {
    const user = userEvent.setup();
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add customer/i }));

    expect(apiClient.post).not.toHaveBeenCalled();
    // Inline required errors surface for the empty name + address fields.
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('creates the customer with its first location nested in one request', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'new-cust-9' } });
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    // Default premise is BUSINESS, so the name placeholder is the store example.
    await user.type(screen.getByPlaceholderText(/Red Lobster/), 'Acme HQ');
    await user.type(screen.getByPlaceholderText('(602) 555-0100'), '6025550100');
    await user.type(screen.getByPlaceholderText(/maria@example/), 'ops@acme.test');
    await user.type(screen.getByPlaceholderText('1820 W McDowell Rd'), '410 S Mill Ave');
    await user.type(screen.getByPlaceholderText('Phoenix'), 'Tempe');
    await user.type(screen.getByPlaceholderText('85007'), '85281');
    await user.selectOptions(screen.getByRole('combobox'), 'AZ');

    await user.click(screen.getByRole('button', { name: /add customer/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({
          name: 'Acme HQ',
          email: 'ops@acme.test',
          billingAddressSameAsService: true,
          serviceLocations: [
            expect.objectContaining({
              premiseType: 'BUSINESS',
              locationName: 'Acme HQ',
              address: expect.objectContaining({
                streetAddress: '410 S Mill Ave',
                city: 'Tempe',
                state: 'AZ',
                zipCode: '85281',
              }),
            }),
          ],
        })
      );
    });
  });

  it('requires at least one contact channel (phone or email)', async () => {
    const user = userEvent.setup();
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    // Everything but a contact channel.
    await user.type(screen.getByPlaceholderText(/Red Lobster/), 'Acme HQ');
    await user.type(screen.getByPlaceholderText('1820 W McDowell Rd'), '410 S Mill Ave');
    await user.type(screen.getByPlaceholderText('Phoenix'), 'Tempe');
    await user.type(screen.getByPlaceholderText('85007'), '85281');
    await user.selectOptions(screen.getByRole('combobox'), 'AZ');

    await user.click(screen.getByRole('button', { name: /add customer/i }));

    // Address-verify may POST to /addresses/verify on blur; the create must not fire.
    expect(apiClient.post).not.toHaveBeenCalledWith('/customers', expect.anything());
    expect(screen.getByText(/add a phone or email/i)).toBeInTheDocument();
  });

  // Types a whole customer + both addresses through userEvent, so it runs ~2.6s
  // under v8 coverage instrumentation and overran the 5s default in CI's
  // coverage job.
  it('separate billing: the bill-to name becomes the customer name, top name stays the location', { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'new-cust-10' } });
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/Red Lobster/), 'Store #123');
    await user.type(screen.getByPlaceholderText('(602) 555-0100'), '6025550100');
    await user.type(screen.getByPlaceholderText('1820 W McDowell Rd'), '410 S Mill Ave');
    await user.type(screen.getByPlaceholderText('Phoenix'), 'Tempe');
    await user.type(screen.getByPlaceholderText('85007'), '85281');
    await user.selectOptions(screen.getByRole('combobox'), 'AZ');

    // Split billing off (only one checkbox is visible — Advanced is collapsed),
    // then rename the bill-to (it prefills from the top name).
    await user.click(screen.getByRole('checkbox'));
    const billTo = screen.getByPlaceholderText('Darden Restaurants');
    await user.clear(billTo);
    await user.type(billTo, 'Corporate AP LLC');
    // The billing block reuses the same AddressBlock, so its fields share the
    // service placeholders — take the last (billing) instance of each.
    const streets = screen.getAllByPlaceholderText('1820 W McDowell Rd');
    await user.type(streets[streets.length - 1], '900 HQ Blvd');
    const cities = screen.getAllByPlaceholderText('Phoenix');
    await user.type(cities[cities.length - 1], 'Orlando');
    const zips = screen.getAllByPlaceholderText('85007');
    await user.type(zips[zips.length - 1], '32837');
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[combos.length - 1], 'FL');
    // A separate payer needs a billing channel — that's where the invoice goes.
    await user.type(screen.getByPlaceholderText('name@email.com'), 'ap@corporate.test');

    await user.click(screen.getByRole('button', { name: /add customer/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({
          name: 'Corporate AP LLC',
          billingAddressSameAsService: false,
          // Separate payer → the customer's own email is the billing contact's.
          email: 'ap@corporate.test',
          serviceLocations: [expect.objectContaining({ locationName: 'Store #123' })],
        })
      );
    });
  });

  it('surfaces an address-match in the duplicate guard and routes to the existing location', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/tenant-settings') return Promise.resolve({ data: { defaultPremiseType: 'BUSINESS' } });
      if (url === '/tenant/dispatch-regions/default') return Promise.resolve({ data: null });
      if (url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [] });
      if (url.startsWith('/users')) return Promise.resolve({ data: { content: [] } });
      if (url.startsWith('/customers/duplicate-check'))
        return Promise.resolve({
          data: {
            candidates: [
              {
                customerId: 'cust-9',
                customerNumber: 'C-00003',
                name: 'Chest Rockwell',
                locationName: 'Brock Landers',
                serviceLocationId: 'loc-1',
                premiseType: 'BUSINESS',
                matchReason: 'ADDRESS',
                address: { streetAddress: '1942 LENOX RD NE', city: 'ATLANTA', state: 'GA', zipCode: '30306' },
                status: 'ACTIVE',
                lastServiceAt: '2026-03-14T00:00:00Z',
                openJobCount: 1,
              },
            ],
          },
        });
      return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    // Typing an address alone (no name) should be enough to trigger the check.
    await user.type(screen.getByPlaceholderText('1820 W McDowell Rd'), '1942 Lenox Rd NE');

    expect(await screen.findByText(/you already service this address/i)).toBeInTheDocument();
    // The LOCATION name is the primary label; the owning customer is secondary.
    expect(screen.getByText('Brock Landers')).toBeInTheDocument();
    expect(screen.getByText(/Chest Rockwell/)).toBeInTheDocument();
    expect(screen.getByText('Same address')).toBeInTheDocument();

    // Address match carries a location → prefer the location record, not the customer.
    await user.click(screen.getByRole('button', { name: /use this location/i }));
    expect(await screen.findByText('Location detail')).toBeInTheDocument();
  });

  it('a name-only match has no location, so it routes to the customer record', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/tenant-settings') return Promise.resolve({ data: { defaultPremiseType: 'BUSINESS' } });
      if (url === '/tenant/dispatch-regions/default') return Promise.resolve({ data: null });
      if (url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [] });
      if (url.startsWith('/users')) return Promise.resolve({ data: { content: [] } });
      if (url.startsWith('/customers/duplicate-check'))
        return Promise.resolve({
          data: {
            candidates: [
              {
                customerId: 'cust-42',
                customerNumber: 'C-00042',
                name: 'Paul Wilcox',
                serviceLocationId: null,
                premiseType: null,
                matchReason: 'NAME',
                address: null,
                status: null,
                lastServiceAt: null,
                openJobCount: 0,
              },
            ],
          },
        });
      return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });
    renderAddCustomer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i, level: 1 })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/Red Lobster/), 'Paul Wilcox');

    expect(await screen.findByText(/a customer with a similar name exists/i)).toBeInTheDocument();
    // No location on a name-only match → falls back to the customer record.
    await user.click(screen.getByRole('button', { name: /use this customer/i }));
    expect(await screen.findByText('Customer detail')).toBeInTheDocument();
  });
});
