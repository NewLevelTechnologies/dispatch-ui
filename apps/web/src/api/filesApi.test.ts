import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agreementFilesApi } from '@dispatch/api/src/filesApi';
import apiClient from '@dispatch/api/src/client';

vi.mock('@dispatch/api/src/client');

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
