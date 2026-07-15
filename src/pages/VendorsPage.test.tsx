/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import VendorsPage from './VendorsPage';
import type { Vendor } from '../api';

const mockSearch = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: { list: vi.fn() },
    vendorApi: { search: (...a: unknown[]) => mockSearch(...a), getById: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
});

const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'v-1',
  name: 'Ferguson HVAC',
  kind: 'DISTRIBUTOR',
  preferred: true,
  accountNumber: 'ACC-1',
  paymentTerms: 'Net 30',
  taxRate: 0.086,
  orderingMethod: 'Online portal',
  rep: 'Dana',
  phone: '6025550100',
  email: 'orders@ferguson.com',
  address: '123 Main',
  notes: '',
  isActive: true,
  openPOs: 2,
  ytdSpend: 12500,
  lastOrder: '2026-07-01T00:00:00Z',
  ...over,
});

const routes = [
  { path: '/', element: <VendorsPage /> },
  { path: '/vendors/:id', element: <div>vendor detail</div> },
  { path: '/vendors/new', element: <div>new vendor</div> },
];
const render = () => renderWithProviders(<div />, { routes, initialPath: '/' });

describe('VendorsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders vendors with account, terms, rollups and a preferred pill', async () => {
    mockSearch.mockResolvedValue([vendor()]);
    render();

    expect(await screen.findByText('Ferguson HVAC')).toBeInTheDocument();
    expect(screen.getByText('ACC-1')).toBeInTheDocument();
    expect(screen.getByText('Preferred')).toBeInTheDocument();
    expect(screen.getByText('$12,500.00')).toBeInTheDocument();
  });

  it('filters by kind chip', async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue([vendor(), vendor({ id: 'v-2', name: 'Trane Supply', kind: 'MANUFACTURER', preferred: false })]);
    render();

    await screen.findByText('Ferguson HVAC');
    await user.click(screen.getByRole('button', { name: 'Manufacturer' }));

    expect(screen.getByText('Trane Supply')).toBeInTheDocument();
    expect(screen.queryByText('Ferguson HVAC')).not.toBeInTheDocument();
  });

  it('filters by search text', async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue([vendor(), vendor({ id: 'v-2', name: 'Trane Supply' })]);
    render();

    await screen.findByText('Ferguson HVAC');
    await user.type(screen.getByPlaceholderText(/Search vendor/i), 'Trane');

    expect(screen.getByText('Trane Supply')).toBeInTheDocument();
    expect(screen.queryByText('Ferguson HVAC')).not.toBeInTheDocument();
  });

  it('navigates to the vendor detail on row click', async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue([vendor()]);
    render();

    await user.click(await screen.findByText('Ferguson HVAC'));
    expect(await screen.findByText('vendor detail')).toBeInTheDocument();
  });

  it('shows the empty state when there are no vendors', async () => {
    mockSearch.mockResolvedValue([]);
    render();

    expect(await screen.findByText(/No vendors yet/i)).toBeInTheDocument();
  });
});
