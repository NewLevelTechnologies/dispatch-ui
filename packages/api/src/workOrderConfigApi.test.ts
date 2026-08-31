import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  workflowsApi,
  workflowConfigApi,
} from './workOrderConfigApi';
import apiClient from './client';

vi.mock('./client');

const BASE = '/work-orders/config';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
});

describe('workOrderTypesApi', () => {
  it('list returns the envelope as sent', async () => {
    const envelope = { workOrderTypes: [{ id: 't-1' }], colorsInUse: {} };
    vi.mocked(apiClient.get).mockResolvedValue({ data: envelope });

    const out = await workOrderTypesApi.list();

    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/types`);
    expect(out).toEqual(envelope);
  });

  it('getAll unwraps the envelope to the bare array', async () => {
    // Unlike item-statuses, the types endpoint wraps its list — getAll exists
    // so callers that only want the rows do not each unwrap it.
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { workOrderTypes: [{ id: 't-1' }, { id: 't-2' }], colorsInUse: {} },
    });

    const out = await workOrderTypesApi.getAll();

    expect(out).toEqual([{ id: 't-1' }, { id: 't-2' }]);
  });

  it('covers create, update, delete and reorder', async () => {
    await workOrderTypesApi.create({ name: 'Install' } as never);
    await workOrderTypesApi.update('t-1', { name: 'Service' });
    await workOrderTypesApi.delete('t-1');
    await workOrderTypesApi.reorder(['t-2', 't-1']);

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/types`, { name: 'Install' });
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/types/t-1`, { name: 'Service' });
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/types/t-1`);
    // These config reorders wrap the ids, unlike the equipment taxonomy ones.
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/types/reorder`, {
      orderedIds: ['t-2', 't-1'],
    });
  });
});

describe('divisionsApi', () => {
  it('covers the division CRUD surface and reorder', async () => {
    await divisionsApi.getAll();
    await divisionsApi.create({ name: 'North', code: 'N' });
    await divisionsApi.update('d-1', { isActive: false });
    await divisionsApi.delete('d-1');
    await divisionsApi.reorder(['d-2', 'd-1']);

    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/divisions`);
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/divisions`, {
      name: 'North',
      code: 'N',
    });
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/divisions/d-1`, { isActive: false });
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/divisions/d-1`);
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/divisions/reorder`, {
      orderedIds: ['d-2', 'd-1'],
    });
  });
});

describe('workItemStatusesApi', () => {
  it('reads a plain array with no envelope, and covers the writes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 's-1' }] });

    const out = await workItemStatusesApi.getAll();
    await workItemStatusesApi.create({ name: 'Blocked' } as never);
    await workItemStatusesApi.update('s-1', { name: 'Waiting' } as never);
    await workItemStatusesApi.delete('s-1');
    await workItemStatusesApi.reorder(['s-2', 's-1']);

    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/item-statuses`);
    expect(out).toEqual([{ id: 's-1' }]);
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/item-statuses`, { name: 'Blocked' });
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/item-statuses/s-1`, { name: 'Waiting' });
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/item-statuses/s-1`);
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/item-statuses/reorder`, {
      orderedIds: ['s-2', 's-1'],
    });
  });
});

describe('workflowsApi', () => {
  it('covers the workflow reads', async () => {
    await workflowsApi.getAll();
    await workflowsApi.getById('w-1');

    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/workflows`);
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/workflows/w-1`);
  });

  it('nests transition writes under their workflow', async () => {
    await workflowsApi.createTransition('w-1', { fromStatusId: 'a', toStatusId: 'b' } as never);
    await workflowsApi.updateTransition('w-1', 'tr-1', { toStatusId: 'c' } as never);
    await workflowsApi.deleteTransition('w-1', 'tr-1');

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/workflows/w-1/transitions`, {
      fromStatusId: 'a',
      toStatusId: 'b',
    });
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/workflows/w-1/transitions/tr-1`, {
      toStatusId: 'c',
    });
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/workflows/w-1/transitions/tr-1`);
  });

  it('resetToDefault posts with no body', async () => {
    await workflowsApi.resetToDefault('w-1');

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/workflows/w-1/reset-to-default`);
  });
});

describe('workflowConfigApi', () => {
  it('reads and patches the singleton config at a bare route', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { enforcementMode: 'STRICT' } });

    await workflowConfigApi.get();
    await workflowConfigApi.update({ enforcementMode: 'OFF' } as never);

    // Singleton — no id segment on either call.
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/workflow`);
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/workflow`, {
      enforcementMode: 'OFF',
    });
  });
});
