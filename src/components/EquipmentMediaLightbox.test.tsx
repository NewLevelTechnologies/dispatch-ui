import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentMediaLightbox, { type MediaLightboxItem } from './EquipmentMediaLightbox';
import type { EquipmentImage, WorkOrderFile } from '../api';

const mockImagePatch = vi.fn();
const mockImageDelete = vi.fn();
const mockFileDelete = vi.fn();
const mockFilePatch = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentImagesApi: {
      patch: (...args: unknown[]) => mockImagePatch(...args),
      delete: (...args: unknown[]) => mockImageDelete(...args),
    },
  };
});

vi.mock('../api/filesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/filesApi')>();
  return {
    ...actual,
    equipmentFilesApi: {
      ...actual.equipmentFilesApi,
      delete: (...args: unknown[]) => mockFileDelete(...args),
      patch: (...args: unknown[]) => mockFilePatch(...args),
    },
  };
});

vi.mock('../api/client');

const image = (o: Partial<EquipmentImage> = {}): EquipmentImage => ({
  id: 'p1',
  url: 'https://cdn/p1.jpg',
  thumbnailUrl: 'https://cdn/t1.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1,
  widthPx: 1,
  heightPx: 1,
  thumbnailWidthPx: 1,
  thumbnailHeightPx: 1,
  isProfile: false,
  isNameplate: false,
  sortOrder: 0,
  caption: null,
  uploadedBy: null,
  uploadedByName: null,
  createdAt: '',
  ...o,
});

const video = (o: Partial<WorkOrderFile> = {}): WorkOrderFile => ({
  id: 'v1',
  kind: 'VIDEO',
  status: 'READY',
  fileName: 'clip.mp4',
  url: 'https://cdn/v1.mp4',
  thumbnailUrl: 'https://cdn/poster.jpg',
  durationSeconds: 9,
  contentType: 'video/mp4',
  sizeBytes: 1,
  widthPx: null,
  heightPx: null,
  thumbnailWidthPx: null,
  thumbnailHeightPx: null,
  caption: null,
  workOrderId: null,
  workOrderNumber: null,
  workItemId: null,
  equipmentId: 'eq-1',
  equipmentName: null,
  isProfile: false,
  uploadedBy: null,
  uploadedByName: null,
  createdAt: '',
  ...o,
});

const items: MediaLightboxItem[] = [
  { kind: 'image', image: image({ id: 'p1', url: 'https://cdn/p1.jpg' }) },
  { kind: 'image', image: image({ id: 'p2', url: 'https://cdn/p2.jpg' }) },
  { kind: 'video', video: video({ id: 'v1', url: 'https://cdn/v1.mp4' }) },
];

describe('EquipmentMediaLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={null} onClose={vi.fn()} />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('arrows across photos and videos in one gallery', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} />
    );

    // Photo 1 — photos get the set-as-cover action.
    expect(document.querySelector('img[src="https://cdn/p1.jpg"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set as profile/i })).toBeInTheDocument();

    // → Photo 2
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(document.querySelector('img[src="https://cdn/p2.jpg"]')).toBeInTheDocument();

    // → Video: a real <video> player, no cover action, but still deletable.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(document.querySelector('video[src="https://cdn/v1.mp4"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set as profile/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('sets a photo as the cover via the images API', async () => {
    mockImagePatch.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /set as profile/i }));
    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'p1', { isProfile: true });
    });
  });

  it('deletes the current video via the files API', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockFileDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={2} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(mockFileDelete).toHaveBeenCalledWith('eq-1', 'v1');
    });
  });

  it('edits a photo caption via the images API', async () => {
    mockImagePatch.mockResolvedValue({});
    const user = userEvent.setup();
    const withCaption: MediaLightboxItem[] = [{ kind: 'image', image: image({ id: 'p1', caption: 'Old' }) }];
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={withCaption} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Old' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New caption{Enter}');
    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'p1', { caption: 'New caption' });
    });
  });

  it('deletes a photo via the images API', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockImageDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(mockImageDelete).toHaveBeenCalledWith('eq-1', 'p1'));
  });

  it('shows a download fallback when a video fails to load', async () => {
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={2} onClose={vi.fn()} />
    );
    const videoEl = document.querySelector('video') as HTMLVideoElement;
    fireEvent.error(videoEl);
    expect(await screen.findByText(/couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
  });

  it('edits a photo caption and saves it via the images API', async () => {
    mockImagePatch.mockResolvedValue({});
    const user = userEvent.setup();
    const withCaption: MediaLightboxItem[] = [
      { kind: 'image', image: image({ id: 'p1', url: 'https://cdn/p1.jpg', caption: 'Old' }) },
    ];
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={withCaption} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Old' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New caption{Enter}');
    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'p1', { caption: 'New caption' });
    });
  });

  it('shows a download fallback when a video fails to load', async () => {
    const videoItems: MediaLightboxItem[] = [
      { kind: 'video', video: video({ id: 'v1', url: 'https://cdn/v1.mp4', fileName: 'clip.mp4' }) },
    ];
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={videoItems} startIndex={0} onClose={vi.fn()} />
    );
    fireEvent.error(document.querySelector('video') as HTMLVideoElement);
    expect(await screen.findByText(/couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', 'https://cdn/v1.mp4');
  });

  it('navigates with the Prev button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={1} onClose={vi.fn()} />
    );
    expect(document.querySelector('img[src="https://cdn/p2.jpg"]')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^previous$/i }));
    expect(document.querySelector('img[src="https://cdn/p1.jpg"]')).toBeInTheDocument();
  });

  it('navigates with the arrow keys', () => {
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} />
    );
    expect(document.querySelector('img[src="https://cdn/p1.jpg"]')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.querySelector('img[src="https://cdn/p2.jpg"]')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(document.querySelector('img[src="https://cdn/p1.jpg"]')).toBeInTheDocument();
  });

  it('cancels a caption edit on Escape without saving', async () => {
    const user = userEvent.setup();
    const withCaption: MediaLightboxItem[] = [{ kind: 'image', image: image({ id: 'p1', caption: 'Old' }) }];
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={withCaption} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Old' }));
    await user.type(screen.getByRole('textbox'), ' edited{Escape}');
    expect(mockImagePatch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Old' })).toBeInTheDocument();
  });

  it('edits a video caption and saves it via the files API', async () => {
    mockFilePatch.mockResolvedValue({});
    const user = userEvent.setup();
    const withCaption: MediaLightboxItem[] = [
      { kind: 'video', video: video({ id: 'v1', caption: 'Old clip' }) },
    ];
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={withCaption} startIndex={0} onClose={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Old clip' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New clip caption{Enter}');
    await waitFor(() => {
      expect(mockFilePatch).toHaveBeenCalledWith('eq-1', 'v1', { caption: 'New clip caption' });
    });
  });

  it('hides every mutating action in readOnly mode', () => {
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} readOnly />
    );
    expect(screen.queryByRole('button', { name: /set as profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });
});
