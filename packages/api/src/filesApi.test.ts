import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filesApi,
  agreementFilesApi,
  equipmentFilesApi,
  workOrderFilesApi,
  locationFilesApi,
} from './filesApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], counts: {} } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { fileId: 'f1', uploadUrl: 'https://s3/put', s3Key: 'k' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
});

afterEach(() => vi.unstubAllGlobals());

describe('agreementFilesApi', () => {
  it('list GETs the agreement files route with params', async () => {
    await agreementFilesApi.list('a-1', { kind: 'DOCUMENT', page: 2, limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/agreements/a-1/files', {
      params: { kind: 'DOCUMENT', page: 2, limit: 50 },
    });
  });

  it('requestUploadUrl POSTs to /files/upload-url', async () => {
    const body = { contentType: 'application/pdf', sizeBytes: 10, fileName: 'c.pdf', caption: null };
    await agreementFilesApi.requestUploadUrl('a-1', body);
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/upload-url', body);
  });

  it('confirm POSTs to /files/{id}/confirm', async () => {
    await agreementFilesApi.confirm('a-1', 'f1');
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1/confirm');
  });

  it('delete DELETEs the file', async () => {
    await agreementFilesApi.delete('a-1', 'f1');
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1');
  });

  it('patch PATCHes the caption', async () => {
    await agreementFilesApi.patch('a-1', 'f1', { caption: 'Signed contract' });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1', {
      caption: 'Signed contract',
    });
  });

  it('upload runs request → PUT-to-S3 → confirm in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'coi.pdf', { type: 'application/pdf' });
    const stages: string[] = [];

    await agreementFilesApi.upload('a-1', file, { caption: 'COI', onProgress: (s) => stages.push(s) });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/work-orders/agreements/a-1/files/upload-url',
      expect.objectContaining({ contentType: 'application/pdf', fileName: 'coi.pdf', caption: 'COI' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://s3/put',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } }),
    );
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/agreements/a-1/files/f1/confirm');
    expect(stages).toEqual(['requesting', 'uploading', 'confirming']);
  });
});

describe('filesApi.listForServiceLocation', () => {
  it('folds the location id into the query alongside any list params', async () => {
    await filesApi.listForServiceLocation('loc-1', { kind: 'PHOTO', page: 1, limit: 25 });

    expect(apiClient.get).toHaveBeenCalledWith('/files', {
      params: { serviceLocationId: 'loc-1', kind: 'PHOTO', page: 1, limit: 25 },
    });
  });

  it('defaults to no extra params', async () => {
    await filesApi.listForServiceLocation('loc-1');

    expect(apiClient.get).toHaveBeenCalledWith('/files', {
      params: { serviceLocationId: 'loc-1' },
    });
  });
});

describe('equipmentFilesApi', () => {
  it('covers list, upload-url, confirm, patch and delete on the equipment route', async () => {
    // Distinct from equipmentApi's older /images route — this one carries
    // videos and a PROCESSING state.
    await equipmentFilesApi.list('eq-1', { kind: 'VIDEO' });
    await equipmentFilesApi.requestUploadUrl('eq-1', {
      contentType: 'video/mp4',
      sizeBytes: 99,
      fileName: 'clip.mp4',
      caption: null,
    });
    await equipmentFilesApi.confirm('eq-1', 'f1');
    await equipmentFilesApi.patch('eq-1', 'f1', { caption: null });
    await equipmentFilesApi.delete('eq-1', 'f1');

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/files', {
      params: { kind: 'VIDEO' },
    });
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/files/upload-url', {
      contentType: 'video/mp4',
      sizeBytes: 99,
      fileName: 'clip.mp4',
      caption: null,
    });
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/files/f1/confirm');
    // explicit null clears the caption rather than leaving it unchanged
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1/files/f1', { caption: null });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/files/f1');
  });

  it('upload sends the file name and a null caption by default', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const file = new File(['x'], 'plate.png', { type: 'image/png' });

    await equipmentFilesApi.upload('eq-1', file);

    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/files/upload-url', {
      contentType: 'image/png',
      sizeBytes: file.size,
      fileName: 'plate.png',
      caption: null,
    });
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/files/f1/confirm');
  });

  it('surfaces the S3 status when the presigned PUT is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const file = new File(['x'], 'plate.png', { type: 'image/png' });

    // A 403 here usually means the Content-Type drifted from the one the
    // upload-url request declared.
    await expect(equipmentFilesApi.upload('eq-1', file)).rejects.toThrow(
      'S3 upload failed with 403'
    );
    // The confirm step must not run after a failed PUT.
    expect(apiClient.post).not.toHaveBeenCalledWith('/equipment/eq-1/files/f1/confirm');
  });
});

describe('workOrderFilesApi', () => {
  it('covers the work-order file routes', async () => {
    await workOrderFilesApi.list('wo-1', { kind: 'PHOTO' });
    await workOrderFilesApi.confirm('wo-1', 'f1');
    await workOrderFilesApi.delete('wo-1', 'f1');

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/wo-1/files', {
      params: { kind: 'PHOTO' },
    });
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/files/f1/confirm');
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/wo-1/files/f1');
  });

  it('upload nulls out the visit anchor and capture tag when not supplied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const file = new File(['x'], 'before.jpg', { type: 'image/jpeg' });

    await workOrderFilesApi.upload('wo-1', file);

    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/files/upload-url', {
      contentType: 'image/jpeg',
      sizeBytes: file.size,
      fileName: 'before.jpg',
      caption: null,
      dispatchId: null,
      captureTag: null,
    });
  });

  it('upload tags the file to the visit it was captured on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const file = new File(['x'], 'after.jpg', { type: 'image/jpeg' });

    await workOrderFilesApi.upload('wo-1', file, {
      caption: 'after repair',
      dispatchId: 'disp-1',
      captureTag: 'AFTER',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/work-orders/wo-1/files/upload-url',
      expect.objectContaining({ caption: 'after repair', dispatchId: 'disp-1', captureTag: 'AFTER' })
    );
  });

  it('patch retags a file without touching its caption', async () => {
    // dispatchId and captureTag are tri-state: omit / null / set.
    await workOrderFilesApi.patch('wo-1', 'f1', { dispatchId: 'disp-2', captureTag: null });

    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1/files/f1', {
      dispatchId: 'disp-2',
      captureTag: null,
    });
  });
});

describe('locationFilesApi', () => {
  it('covers list, upload-url, confirm, patch and delete on the location route', async () => {
    await locationFilesApi.list('loc-1', { kind: 'DOCUMENT' });
    await locationFilesApi.requestUploadUrl('loc-1', {
      contentType: 'application/pdf',
      sizeBytes: 5,
      fileName: 'permit.pdf',
      caption: null,
      category: 'PERMIT',
    });
    await locationFilesApi.confirm('loc-1', 'f1');
    await locationFilesApi.patch('loc-1', 'f1', { category: 'WARRANTY' });
    await locationFilesApi.delete('loc-1', 'f1');

    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/loc-1/files', {
      params: { kind: 'DOCUMENT' },
    });
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/loc-1/files/upload-url', {
      contentType: 'application/pdf',
      sizeBytes: 5,
      fileName: 'permit.pdf',
      caption: null,
      category: 'PERMIT',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/loc-1/files/f1/confirm');
    expect(apiClient.patch).toHaveBeenCalledWith('/service-locations/loc-1/files/f1', {
      category: 'WARRANTY',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/service-locations/loc-1/files/f1');
  });

  it('uploadToS3 PUTs through fetch so no JWT reaches the presigned URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });

    await locationFilesApi.uploadToS3('https://s3/put', 'application/pdf', file);

    expect(fetchMock).toHaveBeenCalledWith('https://s3/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
  });

  it('uploadToS3 throws with the status on a rejected PUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(
      locationFilesApi.uploadToS3('https://s3/put', 'application/pdf', new Blob(['x']))
    ).rejects.toThrow('S3 upload failed with 400');
  });

  it('upload carries the category through and defaults it to null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const file = new File(['x'], 'coi.pdf', { type: 'application/pdf' });
    const stages: string[] = [];

    await locationFilesApi.upload('loc-1', file, {
      category: 'INSURANCE',
      onProgress: (s) => stages.push(s),
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-locations/loc-1/files/upload-url',
      expect.objectContaining({ category: 'INSURANCE', caption: null })
    );
    expect(stages).toEqual(['requesting', 'uploading', 'confirming']);

    vi.mocked(apiClient.post).mockClear();
    await locationFilesApi.upload('loc-1', file);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-locations/loc-1/files/upload-url',
      expect.objectContaining({ category: null, caption: null })
    );
  });
});
