import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import EquipmentPhotosSection from './EquipmentPhotosSection';
import apiClient from '../api/client';
import type { EquipmentImage } from '../api';

vi.mock('../api/client');

const makeImage = (overrides: Partial<EquipmentImage> = {}): EquipmentImage => ({
  id: 'img-1',
  url: 'https://cdn.example/img-1.jpg',
  thumbnailUrl: 'https://cdn.example/img-1-thumb.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1234,
  widthPx: null,
  heightPx: null,
  thumbnailWidthPx: null,
  thumbnailHeightPx: null,
  isProfile: false,
  sortOrder: 0,
  caption: null,
  uploadedBy: null,
  uploadedByName: null,
  createdAt: '2026-05-01T00:00:00Z',
  ...overrides,
});

describe('EquipmentPhotosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the equipment has no images', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const { container } = renderWithProviders(
      <EquipmentPhotosSection equipmentId="eq-1" />
    );
    // Wait for the query to settle, then assert the section is absent.
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/images');
    });
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders a thumbnail row + count + Manage link when images exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        makeImage({ id: 'a', isProfile: true, caption: 'Nameplate' }),
        makeImage({ id: 'b', sortOrder: 1, caption: 'Compressor' }),
      ],
    });
    renderWithProviders(<EquipmentPhotosSection equipmentId="eq-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Photos \(2\)/)).toBeInTheDocument();
    });
    // Both thumbnails rendered.
    expect(screen.getByAltText('Nameplate')).toBeInTheDocument();
    expect(screen.getByAltText('Compressor')).toBeInTheDocument();
    // Manage link points at the equipment detail page.
    const manageLinks = screen.getAllByRole('link');
    expect(
      manageLinks.some((a) => a.getAttribute('href') === '/equipment/eq-1')
    ).toBe(true);
  });

  it('renders an overflow chip when images exceed maxThumbnails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: Array.from({ length: 8 }, (_, i) =>
        makeImage({ id: `img-${i}`, sortOrder: i, caption: `Photo ${i}` })
      ),
    });
    renderWithProviders(
      <EquipmentPhotosSection equipmentId="eq-1" maxThumbnails={3} />
    );
    await waitFor(() => {
      expect(screen.getByText(/Photos \(8\)/)).toBeInTheDocument();
    });
    // Only 3 thumbnails rendered, plus the +5 overflow chip.
    expect(screen.getByAltText('Photo 0')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo 3')).not.toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('uses provided images and skips the fetch when the prop is set', async () => {
    const provided = [makeImage({ id: 'a', caption: 'Nameplate' })];
    renderWithProviders(
      <EquipmentPhotosSection equipmentId="eq-1" images={provided} />
    );
    expect(screen.getByText(/Photos \(1\)/)).toBeInTheDocument();
    expect(screen.getByAltText('Nameplate')).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('orders profile-first then by sortOrder regardless of input order', async () => {
    const provided = [
      makeImage({ id: 'a', sortOrder: 5, caption: 'A' }),
      makeImage({ id: 'b', sortOrder: 1, caption: 'B' }),
      makeImage({ id: 'profile', sortOrder: 9, isProfile: true, caption: 'Profile' }),
    ];
    renderWithProviders(
      <EquipmentPhotosSection equipmentId="eq-1" images={provided} />
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs[0]).toHaveAttribute('alt', 'Profile');
    expect(imgs[1]).toHaveAttribute('alt', 'B');
    expect(imgs[2]).toHaveAttribute('alt', 'A');
  });
});
