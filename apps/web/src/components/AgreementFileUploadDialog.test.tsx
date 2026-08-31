import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent, fireEvent } from '../test/utils';
import AgreementFileUploadDialog from './AgreementFileUploadDialog';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

// The Catalyst Dialog renders in a portal (document.body), not under `container`.
function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.post).mockResolvedValue({
    data: { fileId: 'f1', uploadUrl: 'https://s3/put', s3Key: 'k' },
  } as never);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => vi.unstubAllGlobals());

describe('AgreementFileUploadDialog', () => {
  it('queues a PDF and uploads it via the 3-step flow', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<AgreementFileUploadDialog isOpen onClose={onClose} agreementId="a-1" />);

    expect(screen.getByText('Upload documents')).toBeInTheDocument();

    const pdf = new File(['x'], 'contract.pdf', { type: 'application/pdf' });
    await user.upload(fileInput(), pdf);
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/agreements/a-1/files/upload-url',
        expect.objectContaining({ contentType: 'application/pdf', fileName: 'contract.pdf' }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('rejects an unsupported file type', async () => {
    renderWithProviders(<AgreementFileUploadDialog isOpen onClose={() => {}} agreementId="a-1" />);

    // fireEvent (not userEvent.upload) so the file bypasses the input's `accept`
    // filter and reaches the dialog's own validation. HTML is still rejected by
    // the backend allowlist (text/plain + Office types are now accepted).
    const html = new File(['x'], 'page.html', { type: 'text/html' });
    fireEvent.change(fileInput(), { target: { files: [html] } });

    expect(await screen.findByText(/Unsupported type/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled();
  });

  it('accepts an Office document (.docx)', async () => {
    renderWithProviders(<AgreementFileUploadDialog isOpen onClose={() => {}} agreementId="a-1" />);

    const docx = new File(['x'], 'contract.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(fileInput(), { target: { files: [docx] } });

    expect(await screen.findByText('contract.docx')).toBeInTheDocument();
    expect(screen.queryByText(/Unsupported type/i)).not.toBeInTheDocument();
  });

  it('queues a dropped file and lets you remove it from the batch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgreementFileUploadDialog isOpen onClose={() => {}} agreementId="a-1" />);

    const zone = screen.getByTestId('file-upload-drop-zone');
    const pdf = new File(['x'], 'addendum.pdf', { type: 'application/pdf' });
    const dataTransfer = { types: ['Files'], files: [pdf], dropEffect: '' };
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });

    expect(await screen.findByText('addendum.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove from batch/i }));
    expect(screen.queryByText('addendum.pdf')).not.toBeInTheDocument();
  });
});
