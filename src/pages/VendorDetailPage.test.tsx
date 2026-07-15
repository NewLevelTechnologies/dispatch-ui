/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import VendorDetailPage from './VendorDetailPage';
import type { Vendor, PurchaseOrderListItem } from '../api';
import type { Page } from '../api/workOrderApi';

const mockGetById = vi.fn();
const mockPoList = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: { list: (...a: unknown[]) => mockPoList(...a) },
    vendorApi: { getById: (...a: unknown[]) => mockGetById(...a), search: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
});

const vendor: Vendor = {
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
  address: '123 Main St',
  notes: 'Will-call closes at 5',
  isActive: true,
  openPOs: 2,
  ytdSpend: 12500,
  lastOrder: '2026-07-01T00:00:00Z',
};

const poRow: PurchaseOrderListItem = {
  id: 'po-1',
  poNumber: 'PO-00001',
  vendorId: 'v-1',
  vendorName: 'Ferguson HVAC',
  type: 'ORDER',
  status: 'ORDERED',
  workOrderId: 'wo-1',
  eta: null,
  createdAt: '2026-07-01T00:00:00Z',
  itemCount: 2,
  totalCost: 125.5,
};

const routes = [
  { path: '/vendors/:id', element: <VendorDetailPage /> },
  { path: '/vendors/:id/edit', element: <div>vendor edit</div> },
  { path: '/purchase-orders/:id', element: <div>po detail</div> },
  { path: '/purchase-orders/new', element: <div>new po</div> },
];
const render = (initialPath = '/vendors/v-1') => renderWithProviders(<div />, { routes, initialPath });

describe('VendorDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(vendor);
    mockPoList.mockResolvedValue({ content: [poRow], totalElements: 1 } as unknown as Page<PurchaseOrderListItem>);
  });

  it('renders the vendor header, account and activity', async () => {
    render();

    expect(await screen.findByRole('heading', { name: 'Ferguson HVAC' })).toBeInTheDocument();
    expect(screen.getByText('ACC-1')).toBeInTheDocument();
    expect(screen.getByText('8.6%')).toBeInTheDocument();
    expect(screen.getByText('Preferred')).toBeInTheDocument();
  });

  it('lists the vendor purchase orders linking to each PO', async () => {
    render();

    const poLink = await screen.findByRole('link', { name: /PO-00001/i });
    expect(poLink).toHaveAttribute('href', '/purchase-orders/po-1');
  });

  it('links Edit to the edit route', async () => {
    render();

    const edit = await screen.findByRole('link', { name: /Edit/i });
    expect(edit).toHaveAttribute('href', '/vendors/v-1/edit');
  });

  it('shows an error state when the vendor fails to load', async () => {
    mockGetById.mockRejectedValue(new Error('boom'));
    render();

    expect(await screen.findByText(/Couldn't load this vendor/i)).toBeInTheDocument();
  });
});
