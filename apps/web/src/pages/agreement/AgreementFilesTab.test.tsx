import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '../../test/utils';
import AgreementFilesTab from './AgreementFilesTab';
import { apiClient } from '../../api/setup';
import type { PagedFiles, WorkOrderFile } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

function file(over: Partial<WorkOrderFile>): WorkOrderFile {
  return {
    id: 'f1',
    kind: 'DOCUMENT',
    status: 'READY',
    fileName: 'Service Agreement.pdf',
    url: 'https://s3/f1',
    thumbnailUrl: null,
    durationSeconds: null,
    contentType: 'application/pdf',
    sizeBytes: 1_200_000,
    widthPx: null,
    heightPx: null,
    thumbnailWidthPx: null,
    thumbnailHeightPx: null,
    caption: null,
    workOrderId: null,
    workOrderNumber: null,
    workItemId: null,
    equipmentId: null,
    equipmentName: null,
    agreementId: 'a-1',
    isProfile: false,
    uploadedBy: null,
    uploadedByName: 'CSR',
    createdAt: '2026-06-20T10:00:00Z',
    ...over,
  };
}

function page(content: WorkOrderFile[]): PagedFiles<WorkOrderFile> {
  return {
    content,
    number: 0,
    size: 100,
    totalElements: content.length,
    totalPages: content.length ? 1 : 0,
    first: true,
    last: true,
    counts: { all: content.length, photos: 0, videos: 0, documents: content.length },
  };
}

function mockList(files: WorkOrderFile[]) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    url === '/work-orders/agreements/a-1/files'
      ? Promise.resolve({ data: page(files) } as never)
      : Promise.resolve({ data: [] } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
});

describe('AgreementFilesTab', () => {
  it('lists documents and image scans, with a thumbnail for the image', async () => {
    mockList([
      file({ id: 'f1', fileName: 'Service Agreement.pdf', kind: 'DOCUMENT' }),
      file({ id: 'f2', fileName: 'COI scan.jpg', kind: 'PHOTO', thumbnailUrl: 'https://s3/f2-thumb' }),
    ]);
    const { container } = renderWithProviders(<AgreementFilesTab agreementId="a-1" />);

    expect(await screen.findByText('Service Agreement.pdf')).toBeInTheDocument();
    expect(screen.getByText('COI scan.jpg')).toBeInTheDocument();
    // The image scan renders a thumbnail.
    expect(container.querySelector('img[src="https://s3/f2-thumb"]')).toBeInTheDocument();
  });

  it('shows the empty state when there are no files', async () => {
    mockList([]);
    renderWithProviders(<AgreementFilesTab agreementId="a-1" />);
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
  });

  it('opens the upload dialog from the toolbar button', async () => {
    const user = userEvent.setup();
    mockList([file({})]);
    renderWithProviders(<AgreementFilesTab agreementId="a-1" />);
    await screen.findByText('Service Agreement.pdf');

    await user.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(screen.getByText('Upload documents')).toBeInTheDocument());
  });

  it('opens a file in a new tab when its row is clicked', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockList([file({ url: 'https://s3/f1' })]);
    renderWithProviders(<AgreementFilesTab agreementId="a-1" />);

    await user.click(await screen.findByText('Service Agreement.pdf'));
    expect(openSpy).toHaveBeenCalledWith('https://s3/f1', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('edits a caption via the row menu', async () => {
    const user = userEvent.setup();
    mockList([file({})]);
    renderWithProviders(<AgreementFilesTab agreementId="a-1" />);
    await screen.findByText('Service Agreement.pdf');

    await user.click(screen.getByRole('button', { name: /file actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit caption/i }));
    const textarea = await screen.findByPlaceholderText(/describe this document/i);
    await user.type(textarea, 'Signed 2026');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1', {
        caption: 'Signed 2026',
      }),
    );
  });

  it('deletes a file from the row menu after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockList([file({})]);
    renderWithProviders(<AgreementFilesTab agreementId="a-1" />);
    await screen.findByText('Service Agreement.pdf');

    await user.click(screen.getByRole('button', { name: /file actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1'),
    );
  });
});
