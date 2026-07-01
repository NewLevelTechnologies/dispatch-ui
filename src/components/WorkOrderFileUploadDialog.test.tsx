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
      expect(uploadSpy).toHaveBeenCalledWith('wo-1', expect.any(File), expect.objectContaining({ dispatchId: null }))
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
});
