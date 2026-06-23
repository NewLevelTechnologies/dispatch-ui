import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentMediaUploadDialog from './EquipmentMediaUploadDialog';

const mockImageUpload = vi.fn();
const mockImagePatch = vi.fn();
const mockFilesUpload = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentImagesApi: {
      upload: (...args: unknown[]) => mockImageUpload(...args),
      patch: (...args: unknown[]) => mockImagePatch(...args),
    },
  };
});

vi.mock('../api/filesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/filesApi')>();
  return {
    ...actual,
    equipmentFilesApi: {
      ...actual.equipmentFilesApi,
      upload: (...args: unknown[]) => mockFilesUpload(...args),
    },
  };
});

vi.mock('../api/client');

const jpeg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const mp4 = (name: string) => new File(['x'], name, { type: 'video/mp4' });

describe('EquipmentMediaUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={false} onClose={vi.fn()} equipmentId="eq-1" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the drop zone and disables upload when nothing is queued', async () => {
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.getByText(/drag photos, videos, or documents here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled();
  });

  it('queues photos and videos together — cover radio only for photos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />);
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('photo.jpg'), mp4('clip.mp4')]);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    // Video rows are labelled "Video" and have no cover radio.
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /set as cover/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /upload 2 files/i })).toBeInTheDocument();
  });

  it('rejects an unsupported file but keeps the valid ones', async () => {
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />);
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    // GIF is off the allowlist (images/video/PDF/Office/text) → rejected; PDF is now accepted.
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'logo.gif', { type: 'image/gif' }), jpeg('ok.jpg')] },
    });

    expect(screen.getByText(/logo\.gif/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported type/i)).toBeInTheDocument();
    expect(screen.getByText('ok.jpg')).toBeInTheDocument();
  });

  it('queues a document (PDF) and labels it', async () => {
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />);
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'manual.pdf', { type: 'application/pdf' })] },
    });

    expect(screen.getByText('manual.pdf')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.queryByText(/unsupported type/i)).not.toBeInTheDocument();
  });

  it('routes each file to its API — photo to images, video to files', async () => {
    mockImageUpload.mockResolvedValue({ id: 'img-a', isProfile: false });
    mockFilesUpload.mockResolvedValue({ id: 'vid-x', status: 'READY' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />);

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    const photo = jpeg('photo.jpg');
    const clip = mp4('clip.mp4');
    await user.upload(input, [photo, clip]);
    await user.click(screen.getByRole('button', { name: /upload 2 files/i }));

    await waitFor(() => {
      expect(mockImageUpload).toHaveBeenCalledWith('eq-1', photo, expect.objectContaining({ caption: null }));
      expect(mockFilesUpload).toHaveBeenCalledWith('eq-1', clip, expect.objectContaining({ caption: null }));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('promotes the first photo to cover when defaultSetProfile is set (videos excluded)', async () => {
    mockImageUpload.mockResolvedValue({ id: 'img-a', isProfile: false });
    mockImagePatch.mockResolvedValue({ id: 'img-a', isProfile: true });
    mockFilesUpload.mockResolvedValue({ id: 'vid-x', status: 'READY' });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" defaultSetProfile />
    );

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [mp4('clip.mp4'), jpeg('photo.jpg')]);

    // The lone photo is auto-selected as cover even though a video was added first.
    const radio = screen.getByRole('radio', { name: /set as cover/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);

    await user.click(screen.getByRole('button', { name: /upload 2 files/i }));
    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'img-a', { isProfile: true });
    });
  });

  it('keeps the dialog open and shows a per-row error when an upload fails', async () => {
    mockFilesUpload.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { data: { message: 'Video is corrupt.' } } })
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />);

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [mp4('clip.mp4')]);
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(screen.getByText('Video is corrupt.')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes a queued row and clears its cover selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" defaultSetProfile />
    );
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg')]);
    expect(screen.getByText('a.jpg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove from batch/i }));
    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument();
  });

  it('queues files dropped onto the drop zone', async () => {
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />);
    const dropZone = screen.getByTestId('media-upload-drop-zone');
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [jpeg('dropped.jpg'), mp4('dropped.mp4')], types: ['Files'] },
    });

    expect(screen.getByText('dropped.jpg')).toBeInTheDocument();
    expect(screen.getByText('dropped.mp4')).toBeInTheDocument();
  });

  it('cancel calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EquipmentMediaUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
