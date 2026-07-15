/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PurchaseOrderFormPage from './PurchaseOrderFormPage';
import type { PurchaseOrderResponse } from '../api';

const mockGetById = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockScan = vi.fn();
const mockVendorSearch = vi.fn();
const mockWoGetById = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: {
      list: vi.fn(),
      getById: (...a: unknown[]) => mockGetById(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      scanReceipt: (...a: unknown[]) => mockScan(...a),
    },
    vendorApi: { search: (...a: unknown[]) => mockVendorSearch(...a), create: vi.fn() },
  };
});

vi.mock('../api/workOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/workOrderApi')>('../api/workOrderApi');
  return {
    ...actual,
    workOrderApi: { ...actual.workOrderApi, getById: (...a: unknown[]) => mockWoGetById(...a) },
  };
});

const existingPo: PurchaseOrderResponse = {
  id: 'po-1',
  poNumber: 'PO-00001',
  vendorId: 'v-1',
  vendorName: 'Grainger',
  type: 'ORDER',
  status: 'ORDERED',
  workOrderId: 'wo-1',
  workItemId: null,
  inventoryMode: 'UNTRACKED',
  paymentMethod: 'Net 30',
  taxRate: 0.07,
  eta: '2026-07-20',
  notes: 'Rush it',
  lines: [
    { id: 'l-1', name: 'Capacitor 45/5', sku: 'CAP-455', quantityOrdered: 2, quantityReceived: 0, unitCost: 12.5, billPrice: 29, lineCost: 25 },
  ],
  subtotalCost: 25,
  taxAmount: 1.75,
  totalCost: 26.75,
  createdAt: '2026-07-14T00:00:00Z',
  updatedAt: '2026-07-14T00:00:00Z',
};

const routes = [
  { path: '/purchase-orders/new', element: <PurchaseOrderFormPage /> },
  { path: '/purchase-orders/:id/edit', element: <PurchaseOrderFormPage /> },
  { path: '/purchase-orders/:id', element: <div>PO detail page</div> },
  { path: '/work-orders/:id', element: <div>WO page</div> },
];

const renderAt = (initialPath: string) => renderWithProviders(<div />, { routes, initialPath });

describe('PurchaseOrderFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorSearch.mockResolvedValue([]);
    mockWoGetById.mockResolvedValue({ workOrderNumber: 'WO-1234', serviceLocation: { locationName: 'Reyes' } });
  });

  it('records a field purchase received-on-create with the entered vendor and line', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...existingPo, id: 'po-9' });
    renderAt('/purchase-orders/new?type=field&workOrderId=wo-1');

    expect(await screen.findByText('Record field purchase')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Vendor'), 'Home Depot');
    await user.type(screen.getByLabelText('Item name'), 'Air filter');

    const saveBtn = screen.getByRole('button', { name: /Save purchase/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({ workOrderId: 'wo-1', type: 'FIELD', status: 'RECEIVED', vendorName: 'Home Depot' }),
    );
    expect(payload.lines).toEqual([expect.objectContaining({ name: 'Air filter', quantityOrdered: 1 })]);
    // Navigates to the new PO's detail page.
    expect(await screen.findByText('PO detail page')).toBeInTheDocument();
  });

  it('offers Save draft / Place order for a special order and places it as ORDERED', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...existingPo, id: 'po-9' });
    renderAt('/purchase-orders/new?type=order&workOrderId=wo-1');

    expect(await screen.findByText('New purchase order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save draft/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Vendor'), 'Grainger');
    await user.type(screen.getByLabelText('Item name'), 'Belt');
    await user.click(screen.getByRole('button', { name: /Place order/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'ORDER', status: 'ORDERED', vendorName: 'Grainger' }),
    );
  });

  it('prefills in edit mode and saves changes with the existing vendor id', async () => {
    const user = userEvent.setup();
    mockGetById.mockResolvedValue(existingPo);
    mockUpdate.mockResolvedValue(existingPo);
    renderAt('/purchase-orders/po-1/edit');

    expect(await screen.findByText('Edit purchase order')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Vendor')).toHaveValue('Grainger'));

    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][0]).toBe('po-1');
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ vendorId: 'v-1' }));
  });
});
