import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import EquipmentPhotosSection from './EquipmentPhotosSection';
import type { EquipmentImage } from '../api';

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
  it('renders nothing when the images list is empty', () => {
    const { container } = renderWithProviders(
      <EquipmentPhotosSection images={[]} onSelectImage={() => {}} />
    );
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders nothing when there is only one photo (hero handles it)', () => {
    const { container } = renderWithProviders(
      <EquipmentPhotosSection
        images={[makeImage({ id: 'a', isProfile: true, caption: 'Nameplate' })]}
        onSelectImage={() => {}}
      />
    );
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders thumbnail row + count when 2+ images exist', () => {
    renderWithProviders(
      <EquipmentPhotosSection
        images={[
          makeImage({ id: 'a', isProfile: true, caption: 'Nameplate' }),
          makeImage({ id: 'b', sortOrder: 1, caption: 'Compressor' }),
        ]}
        onSelectImage={() => {}}
      />
    );
    expect(screen.getByText(/Photos \(2\)/)).toBeInTheDocument();
    expect(screen.getByAltText('Nameplate')).toBeInTheDocument();
    expect(screen.getByAltText('Compressor')).toBeInTheDocument();
  });

  it('renders a +N overflow chip when images exceed maxThumbnails', () => {
    renderWithProviders(
      <EquipmentPhotosSection
        images={Array.from({ length: 8 }, (_, i) =>
          makeImage({ id: `img-${i}`, sortOrder: i, caption: `Photo ${i}` })
        )}
        maxThumbnails={3}
        onSelectImage={() => {}}
      />
    );
    expect(screen.getByText(/Photos \(8\)/)).toBeInTheDocument();
    expect(screen.getByAltText('Photo 0')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo 3')).not.toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('calls onSelectImage with the clicked thumbnail index', async () => {
    const user = userEvent.setup();
    const onSelectImage = vi.fn();
    renderWithProviders(
      <EquipmentPhotosSection
        images={[
          makeImage({ id: 'a', caption: 'A' }),
          makeImage({ id: 'b', sortOrder: 1, caption: 'B' }),
        ]}
        onSelectImage={onSelectImage}
      />
    );
    await user.click(screen.getByAltText('B'));
    expect(onSelectImage).toHaveBeenCalledWith(1);
  });

  it('jumps to the first hidden image when the +N chip is clicked', async () => {
    const user = userEvent.setup();
    const onSelectImage = vi.fn();
    renderWithProviders(
      <EquipmentPhotosSection
        images={Array.from({ length: 5 }, (_, i) =>
          makeImage({ id: `img-${i}`, sortOrder: i, caption: `Photo ${i}` })
        )}
        maxThumbnails={2}
        onSelectImage={onSelectImage}
      />
    );
    await user.click(screen.getByText('+3'));
    expect(onSelectImage).toHaveBeenCalledWith(2);
  });
});
