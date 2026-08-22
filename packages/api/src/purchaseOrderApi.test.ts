import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { purchaseOrderApi, vendorApi, poFilesApi } from './purchaseOrderApi';
import apiClient from './client';

vi.mock('./client');

describe('purchaseOrderApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  });

  it('list GETs the collection, forwarding params (incl. repeated status)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { content: [] } } as never);
    const r = await purchaseOrderApi.list({ workOrderId: 'wo-1', status: ['DRAFT', 'ORDERED'] });
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/purchase-orders', {
      params: { workOrderId: 'wo-1', status: ['DRAFT', 'ORDERED'] },
    });
    expect(r).toEqual({ content: [] });
  });

  it('list defaults params to an empty object', async () => {
    await purchaseOrderApi.list();
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/purchase-orders', { params: {} });
  });

  it('summary GETs the aggregate with the filter params', async () => {
    await purchaseOrderApi.summary({ vendorId: 'v-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/purchase-orders/summary', {
      params: { vendorId: 'v-1' },
    });
  });

  it('getById GETs a single PO', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { id: 'po-1' } } as never);
    const r = await purchaseOrderApi.getById('po-1');
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/purchase-orders/po-1');
    expect(r).toEqual({ id: 'po-1' });
  });

  it('create POSTs the request body', async () => {
    const req = { type: 'ORDER' as const, vendorName: 'Acme', lines: [] };
    await purchaseOrderApi.create(req);
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/purchase-orders', req);
  });

  it('update PATCHes by id', async () => {
    await purchaseOrderApi.update('po-1', { status: 'CANCELLED', cancellationReason: 'dupe' });
    expect(apiClient.patch).toHaveBeenCalledWith('/inventory/purchase-orders/po-1', {
      status: 'CANCELLED',
      cancellationReason: 'dupe',
    });
  });

  it('delete DELETEs by id', async () => {
    await purchaseOrderApi.delete('po-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/inventory/purchase-orders/po-1');
  });

  it('scanReceipt POSTs multipart form data', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { lines: [], warnings: [] } } as never);
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    const r = await purchaseOrderApi.scanReceipt(file);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/inventory/purchase-orders/scan-receipt',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    expect(r).toEqual({ lines: [], warnings: [] });
  });
});

describe('vendorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
  });

  it('search passes q as a param when provided', async () => {
    await vendorApi.search('acme');
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/vendors', { params: { q: 'acme' } });
  });

  it('search omits params when q is undefined', async () => {
    await vendorApi.search();
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/vendors', { params: undefined });
  });

  it('getById GETs the vendor', async () => {
    await vendorApi.getById('v-1');
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/vendors/v-1');
  });

  it('create POSTs the vendor', async () => {
    await vendorApi.create({ name: 'Acme' });
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/vendors', { name: 'Acme' });
  });

  it('update PATCHes the vendor', async () => {
    await vendorApi.update('v-1', { isActive: false });
    expect(apiClient.patch).toHaveBeenCalledWith('/inventory/vendors/v-1', { isActive: false });
  });
});

describe('poFilesApi', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('list GETs the PO files', async () => {
    await poFilesApi.list('po-1');
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/purchase-orders/po-1/files');
  });

  it('requestUploadUrl POSTs the file metadata', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { fileId: 'f-1', uploadUrl: 'https://s3/put', s3Key: 'k' },
    } as never);
    const r = await poFilesApi.requestUploadUrl('po-1', {
      contentType: 'image/png',
      sizeBytes: 10,
      fileName: 'a.png',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/purchase-orders/po-1/files/upload-url', {
      contentType: 'image/png',
      sizeBytes: 10,
      fileName: 'a.png',
    });
    expect(r.fileId).toBe('f-1');
  });

  it('confirm POSTs the confirm endpoint', async () => {
    await poFilesApi.confirm('po-1', 'f-1');
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/purchase-orders/po-1/files/f-1/confirm');
  });

  it('delete DELETEs the file', async () => {
    await poFilesApi.delete('po-1', 'f-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/inventory/purchase-orders/po-1/files/f-1');
  });

  it('upload orchestrates request → S3 PUT → confirm and reports each stage', async () => {
    const stages: string[] = [];
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { fileId: 'f-1', uploadUrl: 'https://s3/put', s3Key: 'k' } } as never)
      .mockResolvedValueOnce({ data: { id: 'f-1', status: 'CONFIRMED' } } as never);
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    const file = new File(['data'], 'r.png', { type: 'image/png' });

    const r = await poFilesApi.upload('po-1', file, { onProgress: (s) => stages.push(s) });

    expect(stages).toEqual(['requesting', 'uploading', 'confirming']);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://s3/put',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'image/png' } })
    );
    expect(r).toEqual({ id: 'f-1', status: 'CONFIRMED' });
  });

  it('upload throws when the S3 PUT fails', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { fileId: 'f-1', uploadUrl: 'https://s3/put', s3Key: 'k' },
    } as never);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as never;
    const file = new File(['data'], 'r.png', { type: 'image/png' });
    await expect(poFilesApi.upload('po-1', file)).rejects.toThrow(/S3 upload failed/);
  });
});
