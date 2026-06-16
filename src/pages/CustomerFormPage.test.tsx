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

    await user.type(screen.getByPlaceholderText(/Maria Sanchez/), 'Acme HQ');
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
});
