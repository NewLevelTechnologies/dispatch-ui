import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentMediaLightbox, { type MediaLightboxItem } from './EquipmentMediaLightbox';
import type { EquipmentImage, WorkOrderFile } from '../api';

const mockImagePatch = vi.fn();
const mockImageDelete = vi.fn();
const mockFileDelete = vi.fn();

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
    equipmentFilesApi: { ...actual.equipmentFilesApi, delete: (...args: unknown[]) => mockFileDelete(...args) },
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

  it('hides every mutating action in readOnly mode', () => {
    renderWithProviders(
      <EquipmentMediaLightbox equipmentId="eq-1" items={items} startIndex={0} onClose={vi.fn()} readOnly />
    );
    expect(screen.queryByRole('button', { name: /set as profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });
});
