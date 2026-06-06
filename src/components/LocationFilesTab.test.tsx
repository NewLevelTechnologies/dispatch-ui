import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import LocationFilesTab from './LocationFilesTab';
import apiClient from '../api/client';
import type { LocationFile, WorkOrderFile, FileCounts } from '../api';

vi.mock('../api/client');

const LOCATION_ID = 'loc-1';

// Paged-with-counts envelope both file endpoints return (Spring page + counts).
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

const woPhoto: WorkOrderFile = {
  id: 'wf-1',
  kind: 'PHOTO',
  fileName: 'RTU-3 before.jpg',
  url: 'https://s3/wf-1',
  thumbnailUrl: 'https://s3/wf-1-thumb',
  contentType: 'image/jpeg',
  sizeBytes: 2_400_000,
  widthPx: null,
  heightPx: null,
  thumbnailWidthPx: null,
  thumbnailHeightPx: null,
  caption: null,
  workOrderId: 'wo-1',
  workOrderNumber: 'WO-4203',
  workItemId: null,
  equipmentId: null,
  equipmentName: null,
  isProfile: false,
  uploadedBy: null,
  uploadedByName: 'D. Park',
  createdAt: '2026-06-05T10:00:00Z',
};

const equipPhoto: WorkOrderFile = {
  ...woPhoto,
  id: 'wf-2',
  fileName: 'RTU-3 nameplate.jpg',
  url: 'https://s3/wf-2',
  thumbnailUrl: 'https://s3/wf-2-thumb',
  workOrderId: null,
  workOrderNumber: null,
  equipmentId: 'eq-1',
  equipmentName: 'RTU-3',
  createdAt: '2026-06-04T10:00:00Z',
};

const woDoc: WorkOrderFile = {
  ...woPhoto,
  id: 'wf-3',
  kind: 'DOCUMENT',
  fileName: 'RTU-12 quote.pdf',
  url: 'https://s3/wf-3',
  thumbnailUrl: null,
  contentType: 'application/pdf',
  sizeBytes: 146_000,
  createdAt: '2026-06-03T10:00:00Z',
};

const sitePhoto: LocationFile = {
  id: 'lf-1',
  customerId: 'cust-1',
  serviceLocationId: LOCATION_ID,
  kind: 'PHOTO',
  fileName: 'Gate + lockbox.jpg',
  url: 'https://s3/lf-1',
  thumbnailUrl: 'https://s3/lf-1-thumb',
  contentType: 'image/jpeg',
  sizeBytes: 900_000,
  widthPx: null,
  heightPx: null,
  thumbnailWidthPx: null,
  thumbnailHeightPx: null,
  isProfile: false,
  category: 'ACCESS',
  caption: null,
  uploadedBy: null,
  uploadedByName: 'M. Castillo',
  createdAt: '2026-06-02T10:00:00Z',
};

const siteDoc: LocationFile = {
  ...sitePhoto,
  id: 'lf-2',
  kind: 'DOCUMENT',
  fileName: 'Certificate of insurance.pdf',
  url: 'https://s3/lf-2',
  thumbnailUrl: null,
  contentType: 'application/pdf',
  sizeBytes: 120_000,
  category: 'COI',
  createdAt: '2026-06-01T10:00:00Z',
};

// Default dataset: 3 job/equipment files (2 photos + 1 doc) and 2 direct
// uploads (1 photo + 1 doc) → summed counts All 5 / Photos 3 / Documents 2.
function mockApi({
  agg = [woPhoto, equipPhoto, woDoc] as WorkOrderFile[],
  direct = [sitePhoto, siteDoc] as LocationFile[],
  aggError = false,
} = {}) {
  const aggCounts: FileCounts = {
    all: agg.length,
    photos: agg.filter((f) => f.kind === 'PHOTO').length,
    documents: agg.filter((f) => f.kind === 'DOCUMENT').length,
  };
  const directCounts: FileCounts = {
    all: direct.length,
    photos: direct.filter((f) => f.kind === 'PHOTO').length,
    documents: direct.filter((f) => f.kind === 'DOCUMENT').length,
  };
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    const params = (config?.params ?? {}) as { kind?: string };
    if (url === '/files') {
      if (aggError) return Promise.reject(new Error('aggregate down'));
      const rows = params.kind ? agg.filter((f) => f.kind === params.kind) : agg;
      return Promise.resolve({ data: filesPage(rows, aggCounts) });
    }
    if (url === `/service-locations/${LOCATION_ID}/files`) {
      const rows = params.kind ? direct.filter((f) => f.kind === params.kind) : direct;
      return Promise.resolve({ data: filesPage(rows, directCounts) });
    }
    return Promise.reject(new Error(`Unknown endpoint: ${url}`));
  });
}

function renderTab({ canEdit = true } = {}) {
  return renderWithProviders(<LocationFilesTab locationId={LOCATION_ID} canEdit={canEdit} />);
}

describe('LocationFilesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders type chips with counts summed across both sources', async () => {
    mockApi();
    renderTab();
    // jsdom computes the accessible name without whitespace between the label
    // and the count span, so match with \s*.
    expect(await screen.findByRole('button', { name: /^All\s*5$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Photos\s*3$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Documents\s*2$/ })).toBeInTheDocument();
  });

  it('renders photos as a grid and documents as a list, merged from both sources', async () => {
    mockApi();
    renderTab();
    // Photos: job + equipment + site upload.
    expect(await screen.findByText('RTU-3 before.jpg')).toBeInTheDocument();
    expect(screen.getByText('RTU-3 nameplate.jpg')).toBeInTheDocument();
    expect(screen.getByText('Gate + lockbox.jpg')).toBeInTheDocument();
    // Documents: job-born PDF + direct upload.
    expect(screen.getByText('RTU-12 quote.pdf')).toBeInTheDocument();
    expect(screen.getByText('Certificate of insurance.pdf')).toBeInTheDocument();
  });

  it('shows provenance chips: WO backlink, equipment backlink, upload category', async () => {
    mockApi();
    renderTab();
    // WO chip links to the work order (appears on the photo tile and doc row).
    const woLinks = await screen.findAllByRole('link', { name: 'WO-4203' });
    expect(woLinks[0]).toHaveAttribute('href', '/work-orders/wo-1');
    // Equipment chip links to the equipment record.
    expect(screen.getByRole('link', { name: 'RTU-3' })).toHaveAttribute('href', '/equipment/eq-1');
    // Direct uploads show their category label as a neutral chip.
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('COI')).toBeInTheDocument();
  });

  it('filters by source: Uploaded shows only direct site uploads', async () => {
    mockApi();
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('RTU-3 before.jpg');

    await user.click(screen.getByRole('button', { name: 'Source' }));
    await user.click(await screen.findByRole('option', { name: 'Uploaded' }));

    expect(screen.queryByText('RTU-3 before.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('RTU-12 quote.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Gate + lockbox.jpg')).toBeInTheDocument();
    expect(screen.getByText('Certificate of insurance.pdf')).toBeInTheDocument();
  });

  it('passes the kind param when a type chip is selected', async () => {
    mockApi();
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('RTU-3 before.jpg');

    await user.click(screen.getByRole('button', { name: /^Photos\s*3$/ }));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/files',
        expect.objectContaining({ params: expect.objectContaining({ kind: 'PHOTO' }) })
      );
      expect(apiClient.get).toHaveBeenCalledWith(
        `/service-locations/${LOCATION_ID}/files`,
        expect.objectContaining({ params: expect.objectContaining({ kind: 'PHOTO' }) })
      );
    });
    // Server-filtered: only photos remain.
    await waitFor(() => {
      expect(screen.queryByText('RTU-12 quote.pdf')).not.toBeInTheDocument();
    });
    expect(screen.getByText('RTU-3 before.jpg')).toBeInTheDocument();
  });

  it('degrades to direct uploads with a callout when the aggregate read fails', async () => {
    mockApi({ aggError: true });
    renderTab();
    // The aggregate query retries once (retry: 1) with the default backoff
    // before settling into error — give it room.
    expect(
      await screen.findByText(/showing direct site uploads only/i, undefined, { timeout: 4000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Gate + lockbox.jpg')).toBeInTheDocument();
    expect(screen.queryByText('RTU-3 before.jpg')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no files anywhere', async () => {
    mockApi({ agg: [], direct: [] });
    renderTab();
    expect(await screen.findByText('No files yet')).toBeInTheDocument();
  });

  it('opens the upload dialog from the toolbar', async () => {
    mockApi();
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('RTU-3 before.jpg');

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Upload site files')).toBeInTheDocument();
  });

  it('hides the Upload button without edit capability', async () => {
    mockApi();
    renderTab({ canEdit: false });
    await screen.findByText('RTU-3 before.jpg');
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('deletes a direct-upload document via the row kebab', async () => {
    mockApi();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Certificate of insurance.pdf');

    // Two doc rows render a kebab; the site upload is the second (newest-first
    // puts the job doc above it).
    const kebabs = screen.getAllByRole('button', { name: 'File actions' });
    await user.click(kebabs[1]);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(`/service-locations/${LOCATION_ID}/files/lf-2`);
    });
  });

  it('sets a site-uploaded photo as the site photo from the lightbox', async () => {
    mockApi();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...sitePhoto, isProfile: true } });
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Gate \+ lockbox\.jpg/ }));
    await user.click(await screen.findByRole('button', { name: 'Set as site photo' }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        `/service-locations/${LOCATION_ID}/files/lf-1`,
        { isProfile: true }
      );
    });
  });

  it('unsets the current site photo from the lightbox badge', async () => {
    mockApi({ direct: [{ ...sitePhoto, isProfile: true }, siteDoc] });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: sitePhoto });
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Gate \+ lockbox\.jpg/ }));
    // The badge doubles as the unset control.
    await user.click(await screen.findByRole('button', { name: /Site photo/ }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        `/service-locations/${LOCATION_ID}/files/lf-1`,
        { isProfile: false }
      );
    });
  });

  it('offers no site-photo controls on job-born photos', async () => {
    mockApi();
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /RTU-3 before\.jpg/ }));
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set as site photo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('does not offer Delete on job-born documents', async () => {
    mockApi();
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('RTU-12 quote.pdf');

    const kebabs = screen.getAllByRole('button', { name: 'File actions' });
    await user.click(kebabs[0]); // job doc row (newest-first)
    expect(await screen.findByRole('menuitem', { name: 'View work order' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
