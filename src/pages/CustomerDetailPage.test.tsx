/* eslint-disable i18next/no-literal-string -- test file; stub view labels + assertion strings are literals by nature. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import CustomerDetailPage from './CustomerDetailPage';
import apiClient from '../api/client';
import type { Address, Customer, ServiceLocation } from '../api';

vi.mock('../api/client');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// Stub the two destination views so this suite tests the ROUTER's job — fetch
// the customer and dispatch on shape — without the MULTI page's endpoint
// fan-out. The variants are exercised by their own tests + the legacy suite.
vi.mock('../components/customer-detail/MultiCustomerDetail', () => ({
  default: () => <div>MULTI VIEW</div>,
}));
vi.mock('./CustomerDetailLegacy', () => ({
  default: () => <div>LEGACY VIEW</div>,
}));

const addr = (over: Partial<Address> = {}): Address => ({
  streetAddress: '1 Main St',
  city: 'Phoenix',
  state: 'AZ',
  zipCode: '85007',
  ...over,
});

const loc = (over: Partial<ServiceLocation> = {}): ServiceLocation => ({
  id: 'loc',
  customerId: 'c1',
  dispatchRegionId: 'r1',
  address: addr(),
  additionalContacts: [],
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 0,
  ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Acme',
  email: 'a@acme.com',
  type: 'STANDARD',
  billingAddress: addr(),
  additionalContacts: [],
  serviceLocations: [],
  paymentTermsDays: 30,
  requiresPurchaseOrder: false,
  taxExempt: false,
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 0,
  ...over,
});

const render = () =>
  renderWithProviders(<CustomerDetailPage />, {
    routes: [
      { path: '/customers/:id', element: <CustomerDetailPage /> },
      { path: '*', element: <CustomerDetailPage /> },
    ],
    initialPath: '/customers/c1',
  });

describe('CustomerDetailPage (shape router)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the customer loads', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));
    render();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    render();
    await waitFor(() => expect(screen.getByText(/error loading/i)).toBeInTheDocument());
  });

  it('routes a multi-location customer to the redesigned MULTI view', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: customer({ serviceLocations: [loc({ id: 'a' }), loc({ id: 'b' })] }),
    });
    render();
    await waitFor(() => expect(screen.getByText('MULTI VIEW')).toBeInTheDocument());
    expect(screen.queryByText('LEGACY VIEW')).not.toBeInTheDocument();
  });

  it('routes a single-site customer (billing == service) to the legacy view', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: customer({ serviceLocations: [loc()] }),
    });
    render();
    await waitFor(() => expect(screen.getByText('LEGACY VIEW')).toBeInTheDocument());
    expect(screen.queryByText('MULTI VIEW')).not.toBeInTheDocument();
  });

  it('routes a billing-only customer to the legacy view', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: customer({ type: 'BILLING_ONLY', serviceLocations: [] }),
    });
    render();
    await waitFor(() => expect(screen.getByText('LEGACY VIEW')).toBeInTheDocument());
    expect(screen.queryByText('MULTI VIEW')).not.toBeInTheDocument();
  });
});
