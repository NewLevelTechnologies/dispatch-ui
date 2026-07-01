import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderFilesTab from './WorkOrderFilesTab';
import apiClient from '../api/client';
import { workOrderFilesApi, type Dispatch, type FileCounts, type WorkOrderFile } from '../api';

vi.mock('../api/client');

const WO_ID = 'wo-1';

function filesPage<T>(content: T[], counts: FileCounts) {
  return {
    content,
    counts,
    totalElements: content.length,
    totalPages: content.length ? 1 : 0,
    number: 0,
    size: 100,
    first: true,
    last: true,
  };
}

const dispatch1: Dispatch = {
  id: 'disp-1',
  workOrderId: WO_ID,
  assignedUserId: 'u-1',
  arrivalWindowStart: '2026-06-05T09:00:00Z',
  arrivalWindowEnd: '2026-06-05T11:00:00Z',
  estimatedDuration: 120,
  status: 'COMPLETED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

// Captured on trip 1 (dispatchId matches dispatch1) → groups under "Dispatch 1".
const tripPhoto: WorkOrderFile = {
  id: 'wf-1',
  kind: 'PHOTO',
  status: 'READY',
  fileName: 'RTU-3 before.jpg',
  url: 'https://s3/wf-1',
  thumbnailUrl: 'https://s3/wf-1-thumb',
  durationSeconds: null,
  contentType: 'image/jpeg',
  sizeBytes: 2_400_000,
  widthPx: null,
  heightPx: null,
  thumbnailWidthPx: null,
  thumbnailHeightPx: null,
  caption: null,
  workOrderId: WO_ID,
  workOrderNumber: 'WO-4203',
  workItemId: null,
  dispatchId: 'disp-1',
  equipmentId: null,
  equipmentName: null,
  agreementId: null,
  isProfile: false,
  uploadedBy: null,
  uploadedByName: 'D. Park',
  createdAt: '2026-06-05T10:00:00Z',
};

// No trip, equipment-anchored → groups under "Equipment".
const equipPhoto: WorkOrderFile = {
  ...tripPhoto,
  id: 'wf-2',
  fileName: 'RTU-3 nameplate.jpg',
  url: 'https://s3/wf-2',
  dispatchId: null,
  equipmentId: 'eq-1',
  equipmentName: 'RTU-3',
  createdAt: '2026-06-04T10:00:00Z',
};

const equipVideo: WorkOrderFile = {
  ...tripPhoto,
  id: 'wf-3',
  kind: 'VIDEO',
  fileName: 'compressor-leak.mov',
  url: 'https://s3/wf-3',
  thumbnailUrl: 'https://s3/wf-3-poster',
  durationSeconds: 42,
  contentType: 'video/quicktime',
  dispatchId: null,
  equipmentId: 'eq-1',
  equipmentName: 'RTU-3',
  createdAt: '2026-06-06T10:00:00Z',
};

const woDoc: WorkOrderFile = {
  ...tripPhoto,
  id: 'wf-4',
  kind: 'DOCUMENT',
  fileName: 'RTU-12 quote.pdf',
  url: 'https://s3/wf-4',
  thumbnailUrl: null,
  contentType: 'application/pdf',
  sizeBytes: 146_000,
  dispatchId: null,
  createdAt: '2026-06-03T10:00:00Z',
};

const DEFAULT = [tripPhoto, equipPhoto, equipVideo, woDoc];

function mockApi({ files = DEFAULT as WorkOrderFile[], error = false } = {}) {
  const counts: FileCounts = {
    all: files.length,
    photos: files.filter((f) => f.kind === 'PHOTO').length,
    videos: files.filter((f) => f.kind === 'VIDEO').length,
    documents: files.filter((f) => f.kind === 'DOCUMENT').length,
  };
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    const params = (config?.params ?? {}) as { kind?: string };
    if (url === `/work-orders/${WO_ID}/files`) {
      if (error) return Promise.reject(new Error('files down'));
      const rows = params.kind ? files.filter((f) => f.kind === params.kind) : files;
      return Promise.resolve({ data: filesPage(rows, counts) });
    }
    return Promise.reject(new Error(`Unknown endpoint: ${url}`));
  });
}

function renderTab({ readOnly = false } = {}) {
  return renderWithProviders(
    <WorkOrderFilesTab workOrderId={WO_ID} dispatches={[dispatch1]} readOnly={readOnly} />,
  );
}

describe('WorkOrderFilesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders type chips with counts', async () => {
    mockApi();
    renderTab();
    // jsdom computes the accessible name without whitespace between label + count.
    expect(await screen.findByRole('button', { name: /^All\s*4$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Photos\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Videos\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Documents\s*1$/ })).toBeInTheDocument();
  });

  it('renders photos, videos, and documents', async () => {
    mockApi();
    renderTab();
    expect(await screen.findByText('RTU-3 before.jpg')).toBeInTheDocument();
    expect(screen.getByText('RTU-3 nameplate.jpg')).toBeInTheDocument();
    expect(screen.getByText('compressor-leak.mov')).toBeInTheDocument();
    expect(screen.getByText('RTU-12 quote.pdf')).toBeInTheDocument();
  });

  it('groups visual files by capture trip (dispatchId) and equipment', async () => {
    mockApi();
    renderTab();
    // tripPhoto's dispatchId matches dispatch1 → "Dispatch 1" group (Trip 1).
    expect(await screen.findByText(/Dispatch 1/)).toBeInTheDocument();
    // equipment-anchored captures with no trip → "Equipment" group.
    expect(screen.getByText('Equipment')).toBeInTheDocument();
  });

  it('shows the empty state when there are no files', async () => {
    mockApi({ files: [] });
    renderTab();
    expect(await screen.findByText(/no files yet/i)).toBeInTheDocument();
  });

  it('opens the upload dialog from the Upload button', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();
    await user.click(await screen.findByRole('button', { name: /upload/i }));
    expect(await screen.findByText('Upload files')).toBeInTheDocument();
  });

  it('hides the Upload button when read-only', async () => {
    mockApi();
    renderTab({ readOnly: true });
    await screen.findByText('RTU-3 before.jpg');
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
  });

  it('renders an error state when the list fails', async () => {
    mockApi({ error: true });
    renderTab();
    expect(await screen.findByText(/couldn't load files/i)).toBeInTheDocument();
  });

  it('filters to a single kind via the type chips', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();
    // The document is present under the "All" filter.
    await screen.findByText('RTU-12 quote.pdf');
    // Clicking Photos re-queries with kind=PHOTO; the mock returns photos only.
    await user.click(screen.getByRole('button', { name: /^Photos\s*2$/ }));
    await waitFor(() => expect(screen.queryByText('RTU-12 quote.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('RTU-3 before.jpg')).toBeInTheDocument();
    expect(screen.queryByText('compressor-leak.mov')).not.toBeInTheDocument();
  });

  it('opens the lightbox from a tile, pages through the visual set, and closes', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();
    // Visuals are newest-first: equipVideo (06-06), tripPhoto (06-05), equipPhoto
    // (06-04). Opening the trip photo lands on index 1 → "2 / 3".
    await user.click((await screen.findByText('RTU-3 before.jpg')).closest('button')!);
    expect(await screen.findByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();

    // Next advances to the last item and disables itself at the end.
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    // Arrow-key navigation is wired on the window.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByText(/2 \/ 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument(),
    );
  });

  it('surfaces the download fallback when a lightbox video fails to play', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();
    await user.click((await screen.findByText('compressor-leak.mov')).closest('button')!);
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    fireEvent.error(video!);
    expect(await screen.findByText(/couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
  });

  it('deletes a document via the row menu and confirmation', async () => {
    const user = userEvent.setup();
    mockApi();
    const deleteSpy = vi.spyOn(workOrderFilesApi, 'delete').mockResolvedValue(undefined);
    renderTab();
    await screen.findByText('RTU-12 quote.pdf');

    // The row menu's wrapper stops row-open propagation, so this is isolated.
    await user.click(screen.getByRole('button', { name: /file actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    expect(await screen.findByText('Delete RTU-12 quote.pdf?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(WO_ID, 'wf-4'));
  });

  it('hides the doc-row Delete action when read-only', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab({ readOnly: true });
    await screen.findByText('RTU-12 quote.pdf');
    await user.click(screen.getByRole('button', { name: /file actions/i }));
    expect(await screen.findByRole('menuitem', { name: /open/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('loads another page when the server reports more files', async () => {
    const user = userEvent.setup();
    const counts: FileCounts = { all: 2, photos: 2, videos: 0, documents: 0 };
    const page1 = { ...filesPage([tripPhoto], counts), last: false, totalElements: 2, totalPages: 2 };
    const page2 = {
      ...filesPage([equipPhoto], counts),
      number: 1,
      first: false,
      last: true,
      totalElements: 2,
      totalPages: 2,
    };
    let call = 0;
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === `/work-orders/${WO_ID}/files`) {
        call += 1;
        return Promise.resolve({ data: call === 1 ? page1 : page2 });
      }
      return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });
    renderTab();

    expect(await screen.findByText('RTU-3 before.jpg')).toBeInTheDocument();
    expect(screen.queryByText('RTU-3 nameplate.jpg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByText('RTU-3 nameplate.jpg')).toBeInTheDocument();
  });
});
