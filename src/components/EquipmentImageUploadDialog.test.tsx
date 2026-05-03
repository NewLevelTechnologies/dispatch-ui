import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';

const mockUpload = vi.fn();
const mockPatch = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentImagesApi: {
      upload: (...args: unknown[]) => mockUpload(...args),
      patch: (...args: unknown[]) => mockPatch(...args),
    },
  };
});

vi.mock('../api/client');

const jpeg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('EquipmentImageUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={false} onClose={vi.fn()} equipmentId="eq-1" />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the drop zone and disables submit when nothing is queued', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.getByText(/drag photos here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });

  it('queues each selected file as its own row', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);

    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
    expect(screen.getByText('c.jpg')).toBeInTheDocument();
    // The submit button switches to the plural label with the count.
    expect(screen.getByRole('button', { name: /upload 3 photos/i })).toBeInTheDocument();
  });

  it('rejects HEIC drag-ins per row without polluting the queue', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'photo.heic', { type: 'image/heic' }), jpeg('ok.jpg')],
      },
    });

    // Top-level error names the rejected file
    expect(screen.getByText(/photo\.heic/)).toBeInTheDocument();
    expect(
      screen.getByText(/only jpeg, png, and webp are supported/i)
    ).toBeInTheDocument();
    // The valid file still gets added
    expect(screen.getByText('ok.jpg')).toBeInTheDocument();
  });

  it('removes a queued row via the per-row remove button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);

    const removeButtons = screen.getAllByRole('button', { name: /remove from batch/i });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0]);

    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('uploads all queued files sequentially and closes on full success', async () => {
    mockUpload
      .mockResolvedValueOnce({ id: 'img-a', isProfile: false })
      .mockResolvedValueOnce({ id: 'img-b', isProfile: false });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);
    await user.click(screen.getByRole('button', { name: /upload 2 photos/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('promotes the chosen row to profile after its upload completes', async () => {
    mockUpload
      .mockResolvedValueOnce({ id: 'img-a', isProfile: false })
      .mockResolvedValueOnce({ id: 'img-b', isProfile: false });
    mockPatch.mockResolvedValue({ id: 'img-b', isProfile: true });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);

    // Pick the second row's profile radio
    const radios = screen.getAllByRole('radio', { name: /set as profile/i });
    await user.click(radios[1]);

    await user.click(screen.getByRole('button', { name: /upload 2 photos/i }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('eq-1', 'img-b', { isProfile: true });
    });
    // The non-selected row's image is NOT patched
    expect(mockPatch).not.toHaveBeenCalledWith('eq-1', 'img-a', expect.anything());
  });

  it('defaults the first added row to profile when defaultSetProfile is true', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        defaultSetProfile
      />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);

    const radios = screen.getAllByRole('radio', { name: /set as profile/i }) as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it('skips redundant profile patch when upload already returned isProfile=true', async () => {
    mockUpload.mockResolvedValueOnce({ id: 'img-a', isProfile: true });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        defaultSetProfile
      />
    );
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg')]);
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows per-row error when a single upload fails', async () => {
    mockUpload
      .mockResolvedValueOnce({ id: 'img-a', isProfile: false })
      .mockRejectedValueOnce(
        Object.assign(new Error('boom'), {
          response: { data: { message: 'Image is corrupt.' } },
        })
      );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );

    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);
    await user.click(screen.getByRole('button', { name: /upload 2 photos/i }));

    await waitFor(() => {
      expect(screen.getByText('Image is corrupt.')).toBeInTheDocument();
    });
    // Dialog stays open so user can see the failure
    expect(onClose).not.toHaveBeenCalled();
    // Successful row shows the done state
    expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
  });

  it('cancel calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('queues files dropped onto the drop zone', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const dropZone = screen.getByTestId('image-upload-drop-zone');
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [jpeg('dropped-1.jpg'), jpeg('dropped-2.jpg')],
        types: ['Files'],
      },
    });

    expect(screen.getByText('dropped-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('dropped-2.jpg')).toBeInTheDocument();
  });

  it('shows the active drop-here state during drag-over and reverts on drag-leave', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const dropZone = screen.getByTestId('image-upload-drop-zone');

    // Browser advertises a Files drag — drop zone goes active.
    fireEvent.dragEnter(dropZone, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByText(/drop to add/i)).toBeInTheDocument();

    // Cursor leaves the drop zone — state reverts.
    fireEvent.dragLeave(dropZone, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByText(/drag photos here/i)).toBeInTheDocument();
  });

  it('ignores non-file drags (e.g. text)', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const dropZone = screen.getByTestId('image-upload-drop-zone');
    fireEvent.dragEnter(dropZone, { dataTransfer: { types: ['text/plain'] } });
    // Stays in the idle state, doesn't show the active label
    expect(screen.queryByText(/drop to add/i)).not.toBeInTheDocument();
  });

  it('runs dropped files through the same validation as the picker', async () => {
    renderWithProviders(
      <EquipmentImageUploadDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    const dropZone = screen.getByTestId('image-upload-drop-zone');
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File(['x'], 'photo.heic', { type: 'image/heic' }),
          jpeg('ok.jpg'),
        ],
        types: ['Files'],
      },
    });

    // Invalid drop is reported in the top-level error
    expect(
      screen.getByText(/only jpeg, png, and webp are supported/i)
    ).toBeInTheDocument();
    // Valid drop still queues
    expect(screen.getByText('ok.jpg')).toBeInTheDocument();
  });
});
