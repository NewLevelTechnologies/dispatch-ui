import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import PricebookPage from './PricebookPage';
import { apiClient, type PricebookItem } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const item = (over: Partial<PricebookItem>): PricebookItem => ({
  id: 'i-1', itemType: 'SERVICE', feeRole: null, name: 'Replace run capacitor', sku: 'SVC-CAP', categoryId: 'c-el', unit: 'ea',
  taxClass: 'LABOR', pricingMode: 'COMPUTED', unitPrice: 182, unitCost: null, markupPct: 0.5, laborHours: 1, materialsCost: 38,
  active: true, version: 3, createdAt: null, updatedAt: null, ...over,
});
const computed = item({});
const markup = item({ id: 'i-2', itemType: 'MATERIAL', name: 'Contactor 40A', sku: 'CONT-40A1', taxClass: 'MATERIALS', pricingMode: 'MARKUP', unitPrice: 39.76, unitCost: 28.4, markupPct: 0.4, laborHours: null, materialsCost: null });
const trip = item({ id: 'i-3', itemType: 'FEE', feeRole: 'TRIP', name: 'Trip charge', sku: 'FEE-TRIP', categoryId: null, taxClass: 'FEE', pricingMode: 'FIXED', unitPrice: 89, markupPct: null, laborHours: null, materialsCost: null });
const unpriced = item({ id: 'i-4', name: 'Replace blower motor', sku: 'SVC-BLWR', unitPrice: null });
const categories = [
  { id: 'c-rep', parentId: null, name: 'Repairs', sortOrder: 0, active: true, createdAt: null, updatedAt: null },
  { id: 'c-el', parentId: 'c-rep', name: 'Electrical', sortOrder: 0, active: true, createdAt: null, updatedAt: null },
];

const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('PricebookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string, config?: { params?: { active?: boolean } }) => {
      if (url === '/financial/pricebook/categories') return Promise.resolve({ data: categories });
      if (url === '/financial/pricebook/items') {
        const content = config?.params?.active === false ? [] : [computed, markup, trip, unpriced];
        return Promise.resolve({ data: { content, totalElements: content.length, totalPages: 1, page: 0 } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('says how each item is priced, flags one that can’t be billed, and names its category', async () => {
    renderWithProviders(<PricebookPage />);

    await screen.findByText('Replace run capacitor');
    expect(rowOf('Replace run capacitor')).toHaveTextContent('1 hr Regular + $38.00 parts +50%');
    expect(rowOf('Replace run capacitor')).toHaveTextContent('SVC-CAP · Electrical');
    expect(rowOf('Contactor 40A')).toHaveTextContent('$28.40 cost +40%');
    expect(rowOf('Trip charge')).toHaveTextContent('Fee · Trip');
    expect(rowOf('Replace blower motor')).toHaveTextContent('Needs Regular rate');
  });

  it('narrows by category and type', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PricebookPage />);

    await user.click(await screen.findByRole('button', { name: 'Electrical' }));
    await user.click(screen.getByRole('radio', { name: 'Material' }));
    await vi.waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/financial/pricebook/items', {
        params: { q: undefined, type: 'MATERIAL', categoryId: 'c-el', active: true, page: 0, size: 50, sort: 'name,asc' },
      }),
    );
  });

  it('deactivates an item by sending the whole item back with its version', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...trip, active: false } });
    renderWithProviders(<PricebookPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Trip charge' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricebook/items/i-3', expect.objectContaining({
      version: 3, itemType: 'FEE', feeRole: 'TRIP', pricingMode: 'FIXED', unitPrice: 89, active: false,
    }));
  });

  it('is view only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<PricebookPage />);

    await screen.findByText('Trip charge');
    expect(screen.getByText('View only. Changing pricing needs the Manage pricing permission.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Trip charge' })).not.toBeInTheDocument();
  });
});
