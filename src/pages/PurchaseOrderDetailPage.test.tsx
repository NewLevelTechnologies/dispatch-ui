/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PurchaseOrderDetailPage from './PurchaseOrderDetailPage';
import type { PurchaseOrderResponse } from '../api';

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockFileUpload = vi.fn();
const mockFileDelete = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: {
      getById: (...a: unknown[]) => mockGetById(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    poFilesApi: {
      list: vi.fn(),
      requestUploadUrl: vi.fn(),
      confirm: vi.fn(),
      upload: (...a: unknown[]) => mockFileUpload(...a),
      delete: (...a: unknown[]) => mockFileDelete(...a),
    },
  };
});

const po: PurchaseOrderResponse = {
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
  { path: '/purchase-orders/:id', element: <PurchaseOrderDetailPage /> },
  { path: '/purchase-orders/:id/edit', element: <div>PO edit page</div> },
  { path: '/work-orders/:id', element: <div>WO page</div> },
];

const renderAt = (initialPath = '/purchase-orders/po-1') => renderWithProviders(<div />, { routes, initialPath });

describe('PurchaseOrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(po);
  });

  it('renders the header, cost rollup, items and margin', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { name: 'Grainger' })).toBeInTheDocument();
    expect(screen.getByText('PO-00001')).toBeInTheDocument();
    // Total appears in both the header and the cost card.
    expect(screen.getAllByText('$26.75').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Capacitor 45/5')).toBeInTheDocument();
    // Margin block from the billPrice (29×2=58 bills, cost 26.75 → 31.25 margin).
    expect(screen.getByText(/Margin on parts/i)).toBeInTheDocument();
  });

  it('changes status via PATCH from the status dropdown', async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue({ ...po, status: 'RECEIVED' });
    renderAt();

    await screen.findByRole('heading', { name: 'Grainger' });
    await user.selectOptions(screen.getByLabelText('Status'), 'RECEIVED');

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('po-1', { status: 'RECEIVED' }));
  });

  it('returns to the vendor on Back when opened with ?from=vendor', async () => {
    renderAt('/purchase-orders/po-1?from=vendor&vendorId=v-1&vName=Grainger');

    const back = await screen.findByRole('link', { name: /Grainger/i });
    expect(back).toHaveAttribute('href', '/vendors/v-1');
  });

  it('links Edit to the edit route', async () => {
    renderAt();

    const edit = await screen.findByRole('link', { name: /Edit/i });
    expect(edit).toHaveAttribute('href', '/purchase-orders/po-1/edit');
  });

  it('shows an error state when the PO fails to load', async () => {
    mockGetById.mockRejectedValue(new Error('boom'));
    renderAt();

    expect(await screen.findByText(/Couldn't load this purchase order/i)).toBeInTheDocument();
  });

  it('renders an attached receipt and deletes it', async () => {
    const user = userEvent.setup();
    mockFileDelete.mockResolvedValue(undefined);
    mockGetById.mockResolvedValue({
      ...po,
      files: [
        { id: 'f-1', fileName: 'receipt.jpg', contentType: 'image/jpeg', sizeBytes: 1000, url: 'https://x/r.jpg', status: 'CONFIRMED', createdAt: '2026-07-14T00:00:00Z' },
      ],
    });
    renderAt();

    expect(await screen.findByAltText('receipt.jpg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Remove file/i }));
    await waitFor(() => expect(mockFileDelete).toHaveBeenCalledWith('po-1', 'f-1'));
  });

  it('uploads a receipt from the empty state', async () => {
    const user = userEvent.setup();
    mockFileUpload.mockResolvedValue({ id: 'f-9' });
    renderAt();

    await screen.findByText(/No receipt attached/i);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(mockFileUpload).toHaveBeenCalledTimes(1));
    expect(mockFileUpload.mock.calls[0][0]).toBe('po-1');
  });
});
