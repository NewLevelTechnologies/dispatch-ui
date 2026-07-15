/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import VendorFormPage from './VendorFormPage';
import type { Vendor } from '../api';

const mockGetById = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../api/purchaseOrderApi', async () => {
  const actual = await vi.importActual<typeof import('../api/purchaseOrderApi')>('../api/purchaseOrderApi');
  return {
    ...actual,
    purchaseOrderApi: { list: vi.fn() },
    vendorApi: {
      getById: (...a: unknown[]) => mockGetById(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      search: vi.fn(),
    },
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
  notes: '',
  isActive: true,
};

const routes = [
  { path: '/vendors/new', element: <VendorFormPage /> },
  { path: '/vendors/:id/edit', element: <VendorFormPage /> },
  { path: '/vendors/:id', element: <div>vendor detail</div> },
  { path: '/vendors', element: <div>vendors list</div> },
];
const renderAt = (initialPath: string) => renderWithProviders(<div />, { routes, initialPath });

describe('VendorFormPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a vendor with the entered fields', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ ...vendor, id: 'v-9', name: 'Acme Supply' });
    renderAt('/vendors/new');

    await user.type(screen.getByPlaceholderText('Ferguson HVAC Supply'), 'Acme Supply');
    await user.type(screen.getByPlaceholderText('8.6'), '7');
    await user.click(screen.getByRole('button', { name: /Add Vendor/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'Acme Supply', kind: 'DISTRIBUTOR', taxRate: 0.07 }),
    );
    // Navigates to the created vendor's detail.
    expect(await screen.findByText('vendor detail')).toBeInTheDocument();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderAt('/vendors/new');

    await user.click(screen.getByRole('button', { name: /Add Vendor/i }));

    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('prefills in edit mode and saves changes', async () => {
    const user = userEvent.setup();
    mockGetById.mockResolvedValue(vendor);
    mockUpdate.mockResolvedValue(vendor);
    renderAt('/vendors/v-1/edit');

    await waitFor(() => expect(screen.getByPlaceholderText('Ferguson HVAC Supply')).toHaveValue('Ferguson HVAC'));
    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][0]).toBe('v-1');
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ name: 'Ferguson HVAC', taxRate: 0.086 }));
  });
});
