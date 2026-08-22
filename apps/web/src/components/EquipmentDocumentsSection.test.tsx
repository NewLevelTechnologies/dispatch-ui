import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '../test/utils';
import EquipmentDocumentsSection from './EquipmentDocumentsSection';
import { apiClient } from '../api/setup';
import type { PagedFiles, WorkOrderFile } from '../api/setup';

vi.mock('@dispatch/api/src/client');

function file(over: Partial<WorkOrderFile>): WorkOrderFile {
  return {
    id: 'f1',
    kind: 'DOCUMENT',
    status: 'READY',
    fileName: 'Furnace manual.pdf',
    url: 'https://s3/f1',
    thumbnailUrl: null,
    durationSeconds: null,
    contentType: 'application/pdf',
    sizeBytes: 2_000_000,
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
    agreementId: null,
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

function mockList(docs: WorkOrderFile[]) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    url === '/equipment/eq-1/files'
      ? Promise.resolve({ data: page(docs) } as never)
      : Promise.resolve({ data: [] } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
});

describe('EquipmentDocumentsSection', () => {
  it('lists documents', async () => {
    mockList([file({ fileName: 'Furnace manual.pdf' })]);
    renderWithProviders(<EquipmentDocumentsSection equipmentId="eq-1" />);
    expect(await screen.findByText('Furnace manual.pdf')).toBeInTheDocument();
  });

  it('shows an empty state when there are no documents', async () => {
    mockList([]);
    renderWithProviders(<EquipmentDocumentsSection equipmentId="eq-1" />);
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });

  it('labels an Office doc as Download (PDF opens) and deletes via the menu', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockList([
      file({ id: 'f1', fileName: 'spec.xlsx', contentType: 'application/vnd.ms-excel' }),
    ]);
    renderWithProviders(<EquipmentDocumentsSection equipmentId="eq-1" />);
    await screen.findByText('spec.xlsx');

    await user.click(screen.getByRole('button', { name: /document actions/i }));
    expect(await screen.findByRole('menuitem', { name: /download/i })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/files/f1'),
    );
  });

  it('edits a caption via the menu', async () => {
    const user = userEvent.setup();
    mockList([file({})]);
    renderWithProviders(<EquipmentDocumentsSection equipmentId="eq-1" />);
    await screen.findByText('Furnace manual.pdf');

    await user.click(screen.getByRole('button', { name: /document actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit caption/i }));
    await user.type(await screen.findByPlaceholderText(/describe this document/i), 'Model AC-100');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1/files/f1', { caption: 'Model AC-100' }),
    );
  });
});
