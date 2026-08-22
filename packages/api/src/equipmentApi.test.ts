import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  equipmentCategoryFieldsApi,
  equipmentFiltersApi,
  tenantFilterSizesApi,
  reportsApi,
  equipmentImagesApi,
  equipmentNotesApi,
  partsInventoryApi,
  warehousesApi,
} from './equipmentApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('equipmentApi', () => {
  it('list drops empty, null and undefined params rather than sending them', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });

    await equipmentApi.list({
      serviceLocationId: 'loc-1',
      search: '',
      customerId: undefined,
      status: 'ACTIVE',
      page: 0,
      size: 25,
      warrantyExpired: false,
    });

    // page: 0 and warrantyExpired: false must survive — only empty string,
    // null and undefined are dropped, not every falsy value.
    expect(apiClient.get).toHaveBeenCalledWith('/equipment', {
      params: {
        serviceLocationId: 'loc-1',
        status: 'ACTIVE',
        page: 0,
        size: 25,
        warrantyExpired: false,
      },
    });
  });

  it('list sends no params at all when called with nothing', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });

    await equipmentApi.list();

    expect(apiClient.get).toHaveBeenCalledWith('/equipment', { params: {} });
  });

  it('getById omits the descendants projection by default', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'eq-1' } });

    const out = await equipmentApi.getById('eq-1');

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1', { params: {} });
    expect(out).toEqual({ id: 'eq-1' });
  });

  it('getById opts into the descendants projection as a string flag', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'eq-1' } });

    await equipmentApi.getById('eq-1', { includeDescendants: true });

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1', {
      params: { includeDescendants: 'true' },
    });
  });

  it('create POSTs the request body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'eq-new' } });

    const out = await equipmentApi.create({ serviceLocationId: 'loc-1', name: 'RTU-1' } as never);

    expect(apiClient.post).toHaveBeenCalledWith('/equipment', {
      serviceLocationId: 'loc-1',
      name: 'RTU-1',
    });
    expect(out).toEqual({ id: 'eq-new' });
  });

  it('extractNameplate posts multipart form data with the file attached', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { make: 'Carrier' } });
    const file = new File(['x'], 'plate.jpg', { type: 'image/jpeg' });

    await equipmentApi.extractNameplate(file);

    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/equipment/nameplate-extraction');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('update PATCHes rather than replacing the record', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'eq-1' } });

    await equipmentApi.update('eq-1', { name: 'RTU-2' });

    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1', { name: 'RTU-2' });
  });

  it('delete and getDescendants hit the expected paths', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'child-1' }] });

    await equipmentApi.delete('eq-1');
    const kids = await equipmentApi.getDescendants('eq-1');

    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1');
    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/descendants');
    expect(kids).toEqual([{ id: 'child-1' }]);
  });
});

describe('equipmentTypesApi', () => {
  it('covers the taxonomy CRUD + reorder endpoints', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await equipmentTypesApi.getAll();
    await equipmentTypesApi.create({ name: 'HVAC' });
    await equipmentTypesApi.update('t-1', { name: 'HVAC2' });
    await equipmentTypesApi.delete('t-1');
    await equipmentTypesApi.reorder(['t-2', 't-1']);

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/config/types');
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/types', { name: 'HVAC' });
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/config/types/t-1', { name: 'HVAC2' });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/config/types/t-1');
    // reorder sends a bare id array, not a wrapper object
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/types/reorder', ['t-2', 't-1']);
  });
});

describe('equipmentCategoriesApi', () => {
  it('getAll filters by type when given one, and sends undefined params when not', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await equipmentCategoriesApi.getAll('t-1');
    expect(apiClient.get).toHaveBeenLastCalledWith('/equipment/config/categories', {
      params: { equipmentTypeId: 't-1' },
    });

    await equipmentCategoriesApi.getAll();
    expect(apiClient.get).toHaveBeenLastCalledWith('/equipment/config/categories', {
      params: undefined,
    });
  });

  it('covers create, update, delete and the type-scoped reorder', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await equipmentCategoriesApi.create({ equipmentTypeId: 't-1', name: 'Furnace' } as never);
    await equipmentCategoriesApi.update('c-1', { name: 'Boiler' });
    await equipmentCategoriesApi.delete('c-1');
    await equipmentCategoriesApi.reorder('t-1', ['c-2', 'c-1']);

    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/categories', {
      equipmentTypeId: 't-1',
      name: 'Furnace',
    });
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/config/categories/c-1', {
      name: 'Boiler',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/config/categories/c-1');
    // Unlike type reorder, category reorder is scoped and sends an object
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/categories/reorder', {
      equipmentTypeId: 't-1',
      orderedIds: ['c-2', 'c-1'],
    });
  });
});

describe('equipmentCategoryFieldsApi', () => {
  it('nests every call under the owning category', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    const base = '/equipment/config/categories/c-1/fields';

    await equipmentCategoryFieldsApi.getAll('c-1');
    await equipmentCategoryFieldsApi.create('c-1', {
      fieldKey: 'btu',
      label: 'BTU',
      dataType: 'NUMBER',
    } as never);
    await equipmentCategoryFieldsApi.update('c-1', 'f-1', { label: 'BTU Rating' });
    await equipmentCategoryFieldsApi.delete('c-1', 'f-1');
    await equipmentCategoryFieldsApi.reorder('c-1', ['f-2', 'f-1']);

    expect(apiClient.get).toHaveBeenCalledWith(base);
    expect(apiClient.post).toHaveBeenCalledWith(base, {
      fieldKey: 'btu',
      label: 'BTU',
      dataType: 'NUMBER',
    });
    expect(apiClient.patch).toHaveBeenCalledWith(`${base}/f-1`, { label: 'BTU Rating' });
    expect(apiClient.delete).toHaveBeenCalledWith(`${base}/f-1`);
    expect(apiClient.post).toHaveBeenCalledWith(`${base}/reorder`, ['f-2', 'f-1']);
  });
});

describe('equipmentFiltersApi', () => {
  it('treats filters as a sub-resource of one equipment record', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await equipmentFiltersApi.getAll('eq-1');
    await equipmentFiltersApi.create('eq-1', { lengthIn: 20, widthIn: 25, thicknessIn: 1 } as never);
    await equipmentFiltersApi.update('eq-1', 'f-1', { quantity: 2 } as never);
    await equipmentFiltersApi.delete('eq-1', 'f-1');

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/filters');
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/filters', {
      lengthIn: 20,
      widthIn: 25,
      thicknessIn: 1,
    });
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1/filters/f-1', { quantity: 2 });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/filters/f-1');
  });
});

describe('tenantFilterSizesApi', () => {
  it('covers CRUD, reorder and the idempotent seed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { added: 7, skipped: 3 } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await tenantFilterSizesApi.getAll();
    await tenantFilterSizesApi.create({ lengthIn: 16, widthIn: 25, thicknessIn: 1 } as never);
    await tenantFilterSizesApi.update('s-1', { thicknessIn: 2 } as never);
    await tenantFilterSizesApi.delete('s-1');
    await tenantFilterSizesApi.reorder(['s-2', 's-1']);
    const seeded = await tenantFilterSizesApi.seedCommon();

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/config/filter-sizes');
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/config/filter-sizes/s-1', {
      thicknessIn: 2,
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/config/filter-sizes/s-1');
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/filter-sizes/reorder', [
      's-2',
      's-1',
    ]);
    // seed takes no body at all
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/config/filter-sizes/seed-common');
    expect(seeded).toEqual({ added: 7, skipped: 3 });
  });
});

describe('reportsApi.filterPullList', () => {
  it('passes the date window and optional filters straight through', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await reportsApi.filterPullList({
      scheduledDateFrom: '2026-01-01',
      scheduledDateTo: '2026-01-31',
      workOrderTypeId: 'wot-1',
      divisionId: 'div-1',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/filter-pull-list', {
      params: {
        scheduledDateFrom: '2026-01-01',
        scheduledDateTo: '2026-01-31',
        workOrderTypeId: 'wot-1',
        divisionId: 'div-1',
      },
    });
  });
});

describe('equipmentImagesApi', () => {
  it('covers list, upload-url, confirm, patch, reorder and delete', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'img-1' } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'img-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await equipmentImagesApi.list('eq-1');
    await equipmentImagesApi.requestUploadUrl('eq-1', {
      contentType: 'image/png',
      sizeBytes: 10,
      caption: null,
    });
    await equipmentImagesApi.confirm('eq-1', 'img-1');
    await equipmentImagesApi.patch('eq-1', 'img-1', { caption: 'front' });
    await equipmentImagesApi.reorder('eq-1', ['img-2', 'img-1']);
    await equipmentImagesApi.delete('eq-1', 'img-1');

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/images');
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/images/upload-url', {
      contentType: 'image/png',
      sizeBytes: 10,
      caption: null,
    });
    // confirm sends no body
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/images/img-1/confirm');
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1/images/img-1', {
      caption: 'front',
    });
    // image reorder wraps the ids, unlike the taxonomy reorders
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/images/reorder', {
      orderedIds: ['img-2', 'img-1'],
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/images/img-1');
  });

  it('uploadToS3 PUTs the bytes with fetch, deliberately bypassing apiClient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await equipmentImagesApi.uploadToS3('https://s3.example/put', 'image/png', file);

    expect(fetchMock).toHaveBeenCalledWith('https://s3.example/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: file,
    });
    // The presigned URL must not carry our JWT — apiClient is never involved.
    expect(apiClient.post).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uploadToS3 throws with the status when S3 rejects the PUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(
      equipmentImagesApi.uploadToS3('https://s3.example/put', 'image/png', new Blob(['x']))
    ).rejects.toThrow('S3 upload failed with 403');

    vi.unstubAllGlobals();
  });

  it('upload orchestrates the three steps and reports progress in order', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { imageId: 'img-9', uploadUrl: 'https://s3/put' } })
      .mockResolvedValueOnce({ data: { id: 'img-9', caption: 'cap' } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const stages: string[] = [];
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const out = await equipmentImagesApi.upload('eq-1', file, {
      caption: 'cap',
      onProgress: (s) => stages.push(s),
    });

    expect(stages).toEqual(['requesting', 'uploading', 'confirming']);
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/equipment/eq-1/images/upload-url', {
      contentType: 'image/png',
      sizeBytes: file.size,
      caption: 'cap',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/equipment/eq-1/images/img-9/confirm'
    );
    expect(out).toEqual({ id: 'img-9', caption: 'cap' });
    vi.unstubAllGlobals();
  });

  it('upload defaults the caption to null and works without a progress callback', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { imageId: 'img-1', uploadUrl: 'https://s3/put' } })
      .mockResolvedValueOnce({ data: { id: 'img-1' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await equipmentImagesApi.upload('eq-1', file);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/equipment/eq-1/images/upload-url', {
      contentType: 'image/png',
      sizeBytes: file.size,
      caption: null,
    });
    vi.unstubAllGlobals();
  });
});

describe('equipmentNotesApi', () => {
  it('scopes notes to the equipment, not the work order', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'n-1' } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'n-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await equipmentNotesApi.list('eq-1');
    await equipmentNotesApi.create('eq-1', { body: 'Filter rack is non-standard' });
    await equipmentNotesApi.update('eq-1', 'n-1', { pinned: true });
    await equipmentNotesApi.delete('eq-1', 'n-1');

    expect(apiClient.get).toHaveBeenCalledWith('/equipment/eq-1/notes');
    expect(apiClient.post).toHaveBeenCalledWith('/equipment/eq-1/notes', {
      body: 'Filter rack is non-standard',
    });
    expect(apiClient.patch).toHaveBeenCalledWith('/equipment/eq-1/notes/n-1', { pinned: true });
    expect(apiClient.delete).toHaveBeenCalledWith('/equipment/eq-1/notes/n-1');
  });
});

describe('partsInventoryApi', () => {
  it('getAll sends only the filters it was given', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await partsInventoryApi.getAll();
    expect(apiClient.get).toHaveBeenLastCalledWith('/inventory/parts-inventory', { params: {} });

    await partsInventoryApi.getAll('wh-1');
    expect(apiClient.get).toHaveBeenLastCalledWith('/inventory/parts-inventory', {
      params: { warehouseId: 'wh-1' },
    });

    // needsReorder: false is a meaningful filter and must still be sent
    await partsInventoryApi.getAll('wh-1', false);
    expect(apiClient.get).toHaveBeenLastCalledWith('/inventory/parts-inventory', {
      params: { warehouseId: 'wh-1', needsReorder: false },
    });
  });

  it('covers getById, create, update, adjustQuantity and delete', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'p-1' } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'p-1' } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'p-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await partsInventoryApi.getById('p-1');
    await partsInventoryApi.create({
      warehouseId: 'wh-1',
      partNumber: 'PN-1',
      partName: 'Belt',
    });
    await partsInventoryApi.update('p-1', { partName: 'Belt XL' });
    await partsInventoryApi.adjustQuantity('p-1', -3);
    await partsInventoryApi.delete('p-1');

    expect(apiClient.get).toHaveBeenCalledWith('/inventory/parts-inventory/p-1');
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/parts-inventory', {
      warehouseId: 'wh-1',
      partNumber: 'PN-1',
      partName: 'Belt',
    });
    // update is a PUT here, not a PATCH like the equipment endpoints
    expect(apiClient.put).toHaveBeenCalledWith('/inventory/parts-inventory/p-1', {
      partName: 'Belt XL',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/parts-inventory/p-1/adjust-quantity', {
      adjustment: -3,
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/inventory/parts-inventory/p-1');
  });
});

describe('warehousesApi', () => {
  it('covers the warehouse CRUD surface', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'wh-1' } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'wh-1' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await warehousesApi.getAll();
    await warehousesApi.getById('wh-1');
    await warehousesApi.create({ name: 'Main' });
    await warehousesApi.update('wh-1', { status: 'INACTIVE' });
    await warehousesApi.delete('wh-1');

    expect(apiClient.get).toHaveBeenCalledWith('/inventory/warehouses');
    expect(apiClient.get).toHaveBeenCalledWith('/inventory/warehouses/wh-1');
    expect(apiClient.post).toHaveBeenCalledWith('/inventory/warehouses', { name: 'Main' });
    expect(apiClient.put).toHaveBeenCalledWith('/inventory/warehouses/wh-1', {
      status: 'INACTIVE',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/inventory/warehouses/wh-1');
  });
});
