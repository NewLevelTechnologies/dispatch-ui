import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import WorkOrderFileUploadDialog from './WorkOrderFileUploadDialog';
import { workOrderFilesApi, type Dispatch, type WorkOrderFile } from '../api';

vi.mock('../api/client');

// jsdom has no object-URL support; the image preview calls it.
beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks object-URL support; stub for the image preview.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const dispatch = (id: string, start: string): Dispatch => ({
  id,
  workOrderId: 'wo-1',
  assignedUserId: 'u-1',
  arrivalWindowStart: start,
  arrivalWindowEnd: start,
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: 'x',
  updatedAt: 'x',
});

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const png = (name = 'photo.png') => new File(['x'], name, { type: 'image/png' });

const render = (dispatches: Dispatch[] = [], onClose = vi.fn()) => {
  renderWithProviders(
    <WorkOrderFileUploadDialog isOpen onClose={onClose} workOrderId="wo-1" dispatches={dispatches} />
  );
  return onClose;
};

describe('WorkOrderFileUploadDialog', () => {
  it('queues a chosen file and runs the upload, then closes', async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(workOrderFilesApi, 'upload')
      .mockResolvedValue({ id: 'f-1' } as unknown as WorkOrderFile);
    const onClose = render([], vi.fn());

    await user.upload(fileInput(), png());
    expect(screen.getByText('photo.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(uploadSpy).toHaveBeenCalledWith(
        'wo-1',
        expect.any(File),
        expect.objectContaining({ dispatchId: null, captureTag: null }),
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('rejects an unsupported file type with a top-level error', async () => {
    render();
    // fireEvent bypasses the input's `accept` filter (which userEvent honors),
    // so the onChange handler actually runs validateFile on the bad type.
    fireEvent.change(fileInput(), {
      target: { files: [new File(['x'], 'evil.exe', { type: 'application/x-msdownload' })] },
    });
    expect(await screen.findByText(/unsupported type/i)).toBeInTheDocument();
    expect(screen.queryByText('evil.exe')).not.toBeInTheDocument();
  });

  it('removes a queued file from the batch', async () => {
    const user = userEvent.setup();
    render();
    await user.upload(fileInput(), png('a.png'));
    expect(screen.getByText('a.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove from batch/i }));
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
  });

  it('offers a trip (dispatch) tag per row when dispatches exist', async () => {
    const user = userEvent.setup();
    render([dispatch('d-1', '2026-05-14T16:00:00Z')]);
    await user.upload(fileInput(), png());
    expect(screen.getByRole('combobox', { name: /trip/i })).toBeInTheDocument();
  });

  it('surfaces a per-row error when the upload fails and stays open', async () => {
    const user = userEvent.setup();
    vi.spyOn(workOrderFilesApi, 'upload').mockRejectedValue(new Error('S3 down'));
    const onClose = render([], vi.fn());
    await user.upload(fileInput(), png());
    await user.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(screen.getByText('S3 down')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('accepts files dropped on the drop zone', async () => {
    render();
    const zone = screen.getByTestId('file-upload-drop-zone');
    const dataTransfer = { types: ['Files'], files: [png('dropped.png')], dropEffect: '' };
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragLeave(zone, { dataTransfer });
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });
    expect(await screen.findByText('dropped.png')).toBeInTheDocument();
  });

  it('uploads with the chosen caption and trip tag', async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(workOrderFilesApi, 'upload')
      .mockResolvedValue({ id: 'f-1' } as unknown as WorkOrderFile);
    render([dispatch('d-1', '2026-05-14T16:00:00Z')]);

    await user.upload(fileInput(), png());
    await user.type(screen.getByLabelText('Caption'), 'Nameplate');
    await user.selectOptions(screen.getByRole('combobox', { name: /trip/i }), 'd-1');
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(uploadSpy).toHaveBeenCalledWith(
        'wo-1',
        expect.any(File),
        expect.objectContaining({ caption: 'Nameplate', dispatchId: 'd-1' }),
      ),
    );
  });

  it('offers a Before/After tag per photo/video row and uploads it', async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(workOrderFilesApi, 'upload')
      .mockResolvedValue({ id: 'f-1' } as unknown as WorkOrderFile);
    render();

    await user.upload(fileInput(), png());
    await user.selectOptions(screen.getByRole('combobox', { name: /before\/after/i }), 'BEFORE');
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(uploadSpy).toHaveBeenCalledWith(
        'wo-1',
        expect.any(File),
        expect.objectContaining({ captureTag: 'BEFORE' }),
      ),
    );
  });

  it('omits the Before/After tag for a non-visual (document) file', async () => {
    const user = userEvent.setup();
    render();
    await user.upload(fileInput(), new File(['x'], 'report.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /before\/after/i })).not.toBeInTheDocument();
  });

  it('labels the button for a multi-file batch and uploads each', async () => {
    const user = userEvent.setup();
    const uploadSpy = vi
      .spyOn(workOrderFilesApi, 'upload')
      .mockResolvedValue({ id: 'x' } as unknown as WorkOrderFile);
    render();

    await user.upload(fileInput(), [png('a.png'), png('b.png')]);
    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /upload 2 files/i }));
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(2));
  });

  it('surfaces staged progress while an upload is in flight', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    vi.spyOn(workOrderFilesApi, 'upload').mockImplementation(
      (_wo, _f, opts) =>
        new Promise((resolve) => {
          opts?.onProgress?.('confirming');
          finish = () => resolve({ id: 'f-1' } as unknown as WorkOrderFile);
        }),
    );
    const onClose = render([], vi.fn());

    await user.upload(fileInput(), png());
    await user.click(screen.getByRole('button', { name: /^upload$/i }));
    // The row shows the finalize stage label while the promise is pending.
    expect(await screen.findByText('Finalizing…')).toBeInTheDocument();

    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
