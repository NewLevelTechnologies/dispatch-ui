/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PurchasingPage from './PurchasingPage';
import type { PurchaseOrderListItem } from '../api';
import type { Page } from '../api/workOrderApi';

const mockList = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: { list: (...a: unknown[]) => mockList(...a) },
    vendorApi: { search: vi.fn() },
  };
});

const po = (over: Partial<PurchaseOrderListItem> = {}): PurchaseOrderListItem => ({
  id: 'po-1',
  poNumber: 'PO-00001',
  vendorId: 'v-1',
  vendorName: 'Grainger',
  type: 'ORDER',
  status: 'ORDERED',
  workOrderId: 'wo-1',
  eta: '2026-07-20',
  createdAt: '2026-07-14T00:00:00Z',
  itemCount: 2,
  totalCost: 125.5,
  ...over,
});

const page = (items: PurchaseOrderListItem[]): Page<PurchaseOrderListItem> =>
  ({ content: items, totalElements: items.length, totalPages: 1, number: 0 } as unknown as Page<PurchaseOrderListItem>);

const routes = [
  { path: '/purchasing', element: <PurchasingPage /> },
  { path: '/purchase-orders/:id', element: <div>PO detail page</div> },
  { path: '/purchase-orders/new', element: <div>PO form</div> },
];
const render = () => renderWithProviders(<div />, { routes, initialPath: '/purchasing' });

describe('PurchasingPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders POs with number, type, vendor, status and cost', async () => {
    mockList.mockResolvedValue(page([po()]));
    render();

    expect(await screen.findByText('PO-00001')).toBeInTheDocument();
    expect(screen.getByText('Grainger')).toBeInTheDocument();
    expect(screen.getByText('Ordered')).toBeInTheDocument();
    expect(screen.getByText('Special order')).toBeInTheDocument();
    expect(screen.getByText('$125.50')).toBeInTheDocument();
    expect(screen.getByText('1 purchase order')).toBeInTheDocument();
  });

  it('shows the empty state when there are none', async () => {
    // totalElements 0 → subtitle null; empty state shown.
    mockList.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0 } as unknown as Page<PurchaseOrderListItem>);
    render();

    expect(await screen.findByText(/No purchase orders yet/i)).toBeInTheDocument();
  });

  it('opens a PO (from=purchasing) on row click', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(page([po()]));
    render();

    await user.click(await screen.findByText('PO-00001'));
    expect(await screen.findByText('PO detail page')).toBeInTheDocument();
  });

  it('clears an applied status filter via the chip ×', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(page([po()]));
    renderWithProviders(<div />, { routes, initialPath: '/purchasing?status=ORDERED' });

    await screen.findByText('PO-00001');
    await user.click(screen.getByRole('button', { name: /Status — clear/i }));

    await waitFor(() => expect(mockList.mock.calls.some((c) => c[0]?.status === undefined)).toBe(true));
  });

  it('searches by PO number (server q)', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(page([po()]));
    render();

    await screen.findByText('PO-00001');
    await user.type(screen.getByPlaceholderText(/Search PO number/i), 'PO-000');

    await waitFor(() => expect(mockList.mock.calls.some((c) => c[0]?.q === 'PO-000')).toBe(true));
  });
});
