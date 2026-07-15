import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import WorkOrderPurchasingTab from './WorkOrderPurchasingTab';
import type { PurchaseOrderListItem } from '../api';
import type { Page } from '../api/workOrderApi';

const mockList = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: { list: (...a: unknown[]) => mockList(...a) },
    vendorApi: { search: vi.fn(), create: vi.fn() },
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
  ({ content: items, totalElements: items.length } as unknown as Page<PurchaseOrderListItem>);

const render = (props: Partial<React.ComponentProps<typeof WorkOrderPurchasingTab>> = {}) =>
  renderWithProviders(<WorkOrderPurchasingTab workOrderId="wo-1" {...props} />);

describe('WorkOrderPurchasingTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a purchase order row with vendor, cost, status and type', async () => {
    mockList.mockResolvedValue(page([po()]));
    render();

    expect(await screen.findByText('PO-00001')).toBeInTheDocument();
    expect(screen.getByText('Grainger')).toBeInTheDocument();
    expect(screen.getByText('$125.50')).toBeInTheDocument();
    expect(screen.getByText('Ordered')).toBeInTheDocument();
    expect(screen.getByText('Special order')).toBeInTheDocument();
  });

  it('shows the empty state when there are no purchase orders', async () => {
    mockList.mockResolvedValue(page([]));
    render();

    expect(await screen.findByText(/No purchase orders/i)).toBeInTheDocument();
  });

  it('links "New PO" and "Record field purchase" to the typed create routes', async () => {
    mockList.mockResolvedValue(page([]));
    render();

    await screen.findByText(/No purchase orders/i);
    expect(screen.getByRole('link', { name: /New PO/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?type=order&workOrderId=wo-1',
    );
    expect(screen.getByRole('link', { name: /Record field purchase/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?type=field&workOrderId=wo-1',
    );
  });

  it('links a PO row to its detail route', async () => {
    mockList.mockResolvedValue(page([po()]));
    render();

    const row = await screen.findByRole('link', { name: /PO-00001/i });
    expect(row).toHaveAttribute('href', '/purchase-orders/po-1');
  });

  it('hides the entry-point buttons when read-only', async () => {
    mockList.mockResolvedValue(page([po()]));
    render({ readOnly: true });

    await screen.findByText('PO-00001');
    expect(screen.queryByRole('link', { name: /New PO/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Record field purchase/i })).not.toBeInTheDocument();
  });
});
