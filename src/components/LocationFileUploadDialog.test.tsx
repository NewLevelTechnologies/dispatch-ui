import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import LocationFileUploadDialog from './LocationFileUploadDialog';

const mockUpload = vi.fn();

vi.mock('../api/filesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/filesApi')>();
  return {
    ...actual,
    locationFilesApi: {
      ...actual.locationFilesApi,
      upload: (...args: unknown[]) => mockUpload(...args),
    },
  };
});

vi.mock('../api/client');

const jpeg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });

function renderDialog({ isOpen = true, onClose = vi.fn() } = {}) {
  renderWithProviders(
    <LocationFileUploadDialog isOpen={isOpen} onClose={onClose} locationId="loc-1" />
  );
  return { onClose };
}

describe('LocationFileUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the drop zone and disables submit when nothing is queued', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/drag files here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled();
  });

  it('queues each selected file as its own row (photos and PDFs)', async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('gate.jpg'), pdf('coi.pdf')]);

    expect(screen.getByText('gate.jpg')).toBeInTheDocument();
    expect(screen.getByText('coi.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload 2 files/i })).toBeInTheDocument();
  });

  it('rejects unsupported types and oversized files without polluting the queue', async () => {
    renderDialog();
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    const big = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    fireEvent.change(input, {
      target: {
        // GIF is not on the allowlist (jpeg/png/webp/pdf + Office/text) → rejected.
        files: [new File(['x'], 'logo.gif', { type: 'image/gif' }), big, jpeg('ok.jpg')],
      },
    });

    expect(screen.getByText(/logo\.gif/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported type/i)).toBeInTheDocument();
    expect(screen.getByText(/too large/i)).toBeInTheDocument();
    expect(screen.getByText('ok.jpg')).toBeInTheDocument();
    expect(screen.queryByText('huge.jpg')).not.toBeInTheDocument();
  });

  it('removes a queued row via the per-row remove button', async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);

    const removeButtons = screen.getAllByRole('button', { name: /remove from batch/i });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0]);

    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('uploads with per-row caption + category and closes on full success', async () => {
    mockUpload.mockResolvedValue({ id: 'lf-1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [pdf('coi.pdf')]);

    await user.type(screen.getByLabelText('Caption'), 'Renews 2027');
    await user.selectOptions(screen.getByLabelText('Category'), 'COI');
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        'loc-1',
        expect.objectContaining({ name: 'coi.pdf' }),
        expect.objectContaining({ caption: 'Renews 2027', category: 'COI' })
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('defaults caption and category to null when left blank', async () => {
    mockUpload.mockResolvedValue({ id: 'lf-1' });
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('gate.jpg')]);
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        'loc-1',
        expect.objectContaining({ name: 'gate.jpg' }),
        expect.objectContaining({ caption: null, category: null })
      );
    });
  });

  it('keeps the dialog open and shows the per-row error when an upload fails', async () => {
    mockUpload
      .mockResolvedValueOnce({ id: 'lf-1' })
      .mockRejectedValueOnce(
        Object.assign(new Error('boom'), {
          response: { data: { message: 'Upload-state conflict.' } },
        })
      );
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    await user.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);
    await user.click(screen.getByRole('button', { name: /upload 2 files/i }));

    await waitFor(() => {
      expect(screen.getByText('Upload-state conflict.')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('cancel calls onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('queues files dropped onto the drop zone, validated the same as the picker', async () => {
    renderDialog();
    const dropZone = screen.getByTestId('file-upload-drop-zone');
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [jpeg('dropped.jpg'), new File(['x'], 'logo.gif', { type: 'image/gif' })],
        types: ['Files'],
      },
    });

    expect(screen.getByText('dropped.jpg')).toBeInTheDocument();
    expect(screen.getByText(/unsupported type/i)).toBeInTheDocument();
  });

  it('shows the active drop state during drag-over, reverts on leave, ignores text drags', async () => {
    renderDialog();
    const dropZone = screen.getByTestId('file-upload-drop-zone');

    fireEvent.dragEnter(dropZone, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByText(/drop to add/i)).toBeInTheDocument();

    fireEvent.dragLeave(dropZone, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByText(/drag files here/i)).toBeInTheDocument();

    fireEvent.dragEnter(dropZone, { dataTransfer: { types: ['text/plain'] } });
    expect(screen.queryByText(/drop to add/i)).not.toBeInTheDocument();
  });
});
