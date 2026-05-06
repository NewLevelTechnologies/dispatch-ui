import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
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

const sampleImages: EquipmentImage[] = [
  makeImage({ id: 'a', url: 'a.jpg', caption: 'Alpha', sortOrder: 0 }),
  makeImage({ id: 'b', url: 'b.jpg', caption: 'Bravo', sortOrder: 1 }),
  makeImage({ id: 'c', url: 'c.jpg', caption: 'Charlie', sortOrder: 2 }),
];

describe('EquipmentPhotoLightbox', () => {
  it('renders nothing when startIndex is null', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={null}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens at the given start index and shows position indicator', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={1}
        onClose={() => {}}
      />
    );
    // Bravo is the second image (index 1).
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('navigates next/previous via on-screen arrows', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
  });

  it('disables prev at the start and next at the end', () => {
    const { rerender } = renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();

    rerender(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={2}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('hides arrows entirely when there is only one image', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={[sampleImages[0]]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    // Position indicator suppressed when there's only one image.
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByAltText('Charlie')).toBeInTheDocument();

    // At the end, ArrowRight is a no-op.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByAltText('Charlie')).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={0}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the caption when present', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
});
