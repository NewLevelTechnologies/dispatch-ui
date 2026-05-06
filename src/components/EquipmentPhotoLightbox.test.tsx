import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
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

const sampleImages: EquipmentImage[] = [
  makeImage({ id: 'a', url: 'a.jpg', caption: 'Alpha', sortOrder: 0 }),
  makeImage({ id: 'b', url: 'b.jpg', caption: 'Bravo', sortOrder: 1 }),
  makeImage({ id: 'c', url: 'c.jpg', caption: 'Charlie', sortOrder: 2 }),
];

describe('EquipmentPhotoLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when startIndex is null', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
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
        equipmentId="eq-1"
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
        equipmentId="eq-1"
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
        equipmentId="eq-1"
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();

    rerender(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
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
        equipmentId="eq-1"
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
        equipmentId="eq-1"
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
        equipmentId="eq-1"
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
        equipmentId="eq-1"
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  // ===== Toolbar tests =====

  it('shows a Profile badge when the current photo is the profile', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[
          makeImage({ id: 'p', isProfile: true, caption: 'Nameplate' }),
          makeImage({ id: 'b', caption: 'B' }),
        ]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    // Badge text is "Profile"; no Set-as-profile button on this photo.
    expect(screen.getByText(/^Profile$/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /set as profile/i })
    ).not.toBeInTheDocument();
  });

  it('shows Set-as-profile button when the current photo is not the profile', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[
          makeImage({ id: 'p', isProfile: true, caption: 'Nameplate' }),
          makeImage({ id: 'b', caption: 'B' }),
        ]}
        startIndex={1}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: /set as profile/i })
    ).toBeInTheDocument();
  });

  it('calls the set-profile API when Set-as-profile is clicked', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[
          makeImage({ id: 'p', isProfile: true }),
          makeImage({ id: 'b' }),
        ]}
        startIndex={1}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /set as profile/i }));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/equipment/eq-1/images/b',
        { isProfile: true }
      );
    });
  });

  it('deletes the current image after confirm', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={sampleImages}
        startIndex={1}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/images/b');
    });
    confirmSpy.mockRestore();
  });

  it('does not delete when the user cancels the confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={sampleImages}
        startIndex={0}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('calls onClose after deleting the only photo', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'only', caption: 'Only' })]}
        startIndex={0}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
  });

  it('opens an inline caption input when the caption is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'a', caption: 'Original' })]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Original' }));
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Original');
  });

  it('saves caption changes via PATCH on Enter', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'a', caption: 'Old' })]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Old' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New caption{Enter}');
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/equipment/eq-1/images/a',
        { caption: 'New caption' }
      );
    });
  });

  it('sends caption: null when the user clears an existing caption', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'a', caption: 'Existing' })]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Existing' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/equipment/eq-1/images/a',
        { caption: null }
      );
    });
  });

  it('reverts the draft on Escape without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'a', caption: 'Original' })]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Original' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Throwaway');
    await user.keyboard('{Escape}');
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument();
  });

  it('shows an "Add caption" affordance when caption is null', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={[makeImage({ id: 'a', caption: null })]}
        startIndex={0}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: /add caption/i })
    ).toBeInTheDocument();
  });

  it('hides toolbar manage actions in readOnly mode', () => {
    renderWithProviders(
      <EquipmentPhotoLightbox
        equipmentId="eq-1"
        images={sampleImages}
        startIndex={0}
        readOnly
        onClose={() => {}}
      />
    );
    // Close + prev/next remain; Set-as-profile / Delete / caption-edit suppressed.
    expect(
      screen.queryByRole('button', { name: /set as profile/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^delete$/i })
    ).not.toBeInTheDocument();
    // Caption renders as static text (not a button) in readOnly.
    const captionButton = screen
      .queryAllByRole('button')
      .find((b) => b.textContent === 'Alpha');
    // The caption display button has disabled=true so it appears in role
    // 'button' but cannot be clicked; the static-text path is gated on
    // readOnly inside the component.
    if (captionButton) {
      expect(captionButton).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});
