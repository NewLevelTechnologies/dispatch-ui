import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import PricebookItemPage from './PricebookItemPage';
import { apiClient } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';

vi.mock('@dispatch/api/src/client');

const material = {
  id: 'i-2', itemType: 'MATERIAL', feeRole: null, name: 'Contactor 40A', sku: 'CONT-40A1', categoryId: null, unit: 'ea',
  taxClass: 'MATERIALS', pricingMode: 'MARKUP', unitPrice: 39.76, unitCost: 28.4, markupPct: 0.4, laborHours: null,
  materialsCost: null, active: true, version: 5, createdAt: null, updatedAt: null,
};
const regular = { id: 'r-reg', name: 'Regular', role: 'REGULAR', billRate: 95, costRate: 38, sortOrder: 0, active: true, createdAt: null, updatedAt: null };

const routes = [
  { path: '/settings/pricebook/new', element: <PricebookItemPage /> },
  { path: '/settings/pricebook/:id', element: <PricebookItemPage /> },
  // eslint-disable-next-line i18next/no-literal-string
  { path: '/settings/pricebook', element: <div>Pricebook list</div> },
];
const grant = (caps: string[]) =>
  vi.mocked(useHasAnyCapability).mockImplementation((...wanted: string[]) => wanted.some((c) => caps.includes(c)));

describe('PricebookItemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(['MANAGE_PRICING']);
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/pricebook/categories') return Promise.resolve({ data: [] });
      if (url === '/financial/labor-rates') return Promise.resolve({ data: [regular] });
      if (url === '/financial/pricebook/items/i-2') return Promise.resolve({ data: material });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('creates a computed service, showing the price it will come to', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...material, name: 'Replace capacitor' } });
    renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/new' });

    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Replace capacitor');
    await user.click(screen.getByRole('radio', { name: 'Computed from labor + parts' }));
    await user.type(screen.getByRole('textbox', { name: 'Parts cost' }), '38');
    await user.type(screen.getByRole('textbox', { name: 'Parts markup (%)' }), '50');
    expect(await screen.findByText('$152.00')).toBeInTheDocument(); // 1 hr × $95 + $38 × 1.5
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/pricebook/items', {
      itemType: 'SERVICE', feeRole: null, name: 'Replace capacitor', sku: null, categoryId: null, unit: 'ea', taxClass: 'LABOR',
      pricingMode: 'COMPUTED', unitPrice: null, unitCost: null, markupPct: 0.5, laborHours: 1, materialsCost: 38, active: true,
    });
    expect(await screen.findByText('Pricebook list')).toBeInTheDocument();
  });

  it('edits with the item’s version and keeps its type locked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: material });
    renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

    const markup = await screen.findByRole('textbox', { name: 'Markup (%)' });
    expect(markup).toHaveValue('40');
    expect(screen.getByText(/Type can’t change after creation/)).toBeInTheDocument();
    await user.clear(markup);
    await user.type(markup, '45');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/pricebook/items/i-2', expect.objectContaining({
      version: 5, itemType: 'MATERIAL', pricingMode: 'MARKUP', unitCost: 28.4, markupPct: 0.45, unitPrice: null,
    }));
  });

  it('needs a fee role before a fee can be saved', async () => {
    const user = userEvent.setup();
    renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/new' });

    await user.click(await screen.findByRole('radio', { name: 'Fee' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Trip charge');
    await user.type(screen.getByRole('textbox', { name: 'Price (per ea)' }), '89');
    expect(screen.getByRole('button', { name: 'Create item' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fee role' }), 'TRIP');
    expect(screen.getByRole('button', { name: 'Create item' })).toBeEnabled();
  });

  it('opens read-only without MANAGE_PRICING', async () => {
    grant([]);
    renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  describe('customer presentation', () => {
    const presented = {
      ...material,
      presentation: {
        customerName: 'Contactor replacement part',
        description: 'Keeps the compressor switching cleanly.',
        highlights: ['OEM equivalent', 'Same-day install', '1-year warranty'],
        photos: [
          { id: 'm-1', url: 'https://cdn/m-1.jpg', thumbnailUrl: 'https://cdn/m-1-t.jpg' },
          { id: 'm-2', url: 'https://cdn/m-2.jpg', thumbnailUrl: 'https://cdn/m-2-t.jpg' },
        ],
      },
      hasPresentation: true,
      thumbnailUrl: 'https://cdn/m-1-t.jpg',
    };
    const withItem = (item: unknown) =>
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url === '/financial/pricebook/categories') return Promise.resolve({ data: [] });
        if (url === '/financial/labor-rates') return Promise.resolve({ data: [regular] });
        if (url === '/financial/pricebook/items/i-2') return Promise.resolve({ data: item });
        return Promise.reject(new Error(`unexpected GET ${url}`));
      });
    const putBody = () => vi.mocked(apiClient.put).mock.calls[0][1] as Record<string, unknown>;

    it('sums up a presentation while collapsed, and leaves it alone when untouched', async () => {
      const user = userEvent.setup();
      withItem(presented);
      vi.mocked(apiClient.put).mockResolvedValue({ data: presented });
      renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

      expect(await screen.findByText('Contactor replacement part')).toBeInTheDocument();
      expect(screen.getByText('· 2 photos · description · 3 highlights')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      // Left out of the request: the server keeps it as it is.
      expect(putBody()).not.toHaveProperty('presentation');
    });

    it('uploads a photo, makes it the main one, and saves the photos in order', async () => {
      const user = userEvent.setup();
      withItem(presented);
      vi.mocked(apiClient.post)
        .mockResolvedValueOnce({ data: { mediaId: 'm-3', uploadUrl: 'https://s3/put', contentType: 'image/png' } })
        .mockResolvedValueOnce({ data: { id: 'm-3', status: 'READY', url: 'https://cdn/m-3.jpg', thumbnailUrl: 'https://cdn/m-3-t.jpg' } });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      vi.mocked(apiClient.put).mockResolvedValue({ data: presented });
      renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      await user.upload(screen.getByLabelText('Add photo', { selector: 'input' }), new File(['x'], 'unit.png', { type: 'image/png' }));
      expect(await screen.findByRole('img', { name: 'Photo 3' })).toHaveAttribute('src', 'https://cdn/m-3-t.jpg');
      await user.click(screen.getAllByRole('button', { name: 'Make main' })[1]);
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(putBody().presentation).toEqual({
        customerName: 'Contactor replacement part',
        description: 'Keeps the compressor switching cleanly.',
        highlights: ['OEM equivalent', 'Same-day install', '1-year warranty'],
        photoIds: ['m-3', 'm-1', 'm-2'],
      });
      vi.unstubAllGlobals();
    });

    it('refuses an image type the library won’t take, before uploading', async () => {
      const user = userEvent.setup({ applyAccept: false });
      withItem(presented);
      renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      await user.upload(screen.getByLabelText('Add photo', { selector: 'input' }), new File(['x'], 'IMG_0001.heic', { type: 'image/heic' }));
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('removes a presentation by sending null', async () => {
      const user = userEvent.setup();
      withItem(presented);
      vi.mocked(apiClient.put).mockResolvedValue({ data: material });
      renderWithProviders(<div />, { routes, initialPath: '/settings/pricebook/i-2' });

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      await user.click(screen.getByRole('button', { name: 'Remove presentation' }));
      expect(screen.getByRole('button', { name: 'Add photos & description' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(putBody().presentation).toBeNull();
    });
  });
});
