import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import AddLocationPage from './AddLocationPage';
import apiClient from '../api/client';
import type { Customer } from '../api';

vi.mock('../api/client');

const mockCustomer: Customer = {
  id: 'cust-1',
  name: 'Iverson Properties LLC',
  email: 'ap@iverson.example',
  phone: '6025550100',
  type: 'STANDARD',
  billingAddress: { streetAddress: '1820 W McDowell Rd', city: 'Phoenix', state: 'AZ', zipCode: '85007' },
  additionalContacts: [],
  serviceLocations: [
    {
      // Minimal shape — only `.length` is read for the "Adding location #N" line.
      id: 'loc-1',
    } as Customer['serviceLocations'][number],
  ],
  paymentTermsDays: 30,
  requiresPurchaseOrder: false,
  contractPricingTier: null,
  taxExempt: false,
  taxExemptCertificate: null,
  notes: null,
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 0,
};

const mockCurrentUser = {
  id: 'user-1',
  capabilities: ['ADD_SERVICE_LOCATIONS'],
};

function mockGets() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/users/me') return Promise.resolve({ data: mockCurrentUser });
    if (url === '/tenant-settings') return Promise.resolve({ data: { defaultPremiseType: 'BUSINESS' } });
    if (url === '/tenant/dispatch-regions/default') return Promise.resolve({ data: null });
    if (url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [] });
    if (url === '/customers/cust-1') return Promise.resolve({ data: mockCustomer });
    return Promise.reject(new Error(`Unknown endpoint: ${url}`));
  });
}

function renderAddLocation() {
  const routes: RouteObject[] = [
    { path: '/customers/:customerId/service-locations/new', element: <AddLocationPage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/service-locations/:id', element: <div>Location detail</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<AddLocationPage />, {
    routes,
    initialEntries: ['/customers/cust-1/service-locations/new'],
  });
}

describe('AddLocationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGets();
  });

  it('renders the customer context banner', async () => {
    renderAddLocation();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add location/i, level: 1 })).toBeInTheDocument();
    });
    // Customer name shows in the banner (and footer); existing customer already
    // has 1 location → next is #2.
    expect(screen.getAllByText('Iverson Properties LLC').length).toBeGreaterThan(0);
    expect(screen.getByText(/Adding location #2/)).toBeInTheDocument();
  });

  it('does not submit when the required address is empty', async () => {
    const user = userEvent.setup();
    renderAddLocation();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add location/i, level: 1 })).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /add location/i });
    await user.click(submit);

    expect(apiClient.post).not.toHaveBeenCalled();
    // Inline required errors surface for the address fields.
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('submits a create request with the entered address and tenant-default premise', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'new-loc-9' } });
    renderAddLocation();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add location/i, level: 1 })).toBeInTheDocument();
    });

    // Name is required; the placeholder is persona-ordered and (with the
    // BUSINESS tenant default) leads with the commercial-label phrasing.
    await user.type(screen.getByPlaceholderText(/Headquarters/), 'Distribution · Mesa');
    await user.type(screen.getByPlaceholderText('1820 W McDowell Rd'), '410 S Mill Ave');
    await user.type(screen.getByPlaceholderText('Phoenix'), 'Tempe');
    await user.type(screen.getByPlaceholderText('85007'), '85281');
    await user.selectOptions(screen.getByRole('combobox'), 'AZ');

    await user.click(screen.getByRole('button', { name: /add location/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers/cust-1/service-locations',
        expect.objectContaining({
          locationName: 'Distribution · Mesa',
          premiseType: 'BUSINESS',
          address: expect.objectContaining({
            streetAddress: '410 S Mill Ave',
            city: 'Tempe',
            state: 'AZ',
            zipCode: '85281',
          }),
        })
      );
    });
  });

  it('soft-prefills the site-contact name from the location name for a residence, overridable', async () => {
    const user = userEvent.setup();
    renderAddLocation();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add location/i, level: 1 })).toBeInTheDocument();
    });

    // Flip to Residence (tenant default here is Business), then type a homeowner
    // name — the untouched site-contact name should mirror it.
    await user.click(screen.getByText('Residence'));
    await user.type(screen.getByPlaceholderText(/Retail #047/), 'Jane Doe');

    const contactName = screen.getByPlaceholderText('e.g., Maria Reyes') as HTMLInputElement;
    expect(contactName.value).toBe('Jane Doe');

    // Once the user edits the contact name, it stops mirroring and is overridable.
    await user.clear(contactName);
    await user.type(contactName, 'Property Manager');
    expect(contactName.value).toBe('Property Manager');
  });

  it('never prefills the site-contact name for a Business location', async () => {
    const user = userEvent.setup();
    renderAddLocation();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add location/i, level: 1 })).toBeInTheDocument();
    });

    // Tenant default is Business; typing a name must not touch the contact field.
    await user.type(screen.getByPlaceholderText(/Headquarters/), 'Acme HQ');
    const contactName = screen.getByPlaceholderText('e.g., Maria Reyes') as HTMLInputElement;
    expect(contactName.value).toBe('');
  });
});
