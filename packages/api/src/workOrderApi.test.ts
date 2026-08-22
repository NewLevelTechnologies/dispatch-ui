import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workOrderApi } from './workOrderApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'wo-1' } });
  vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'wo-1' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
});

describe('workOrderApi list params', () => {
  it('getAll keeps arrays and meaningful falsey values, dropping only empties', async () => {
    await workOrderApi.getAll({
      customerId: 'c-1',
      progressCategory: ['NOT_STARTED', 'IN_PROGRESS'],
      search: '',
      page: 0,
      archived: false,
    } as never);

    // Arrays pass through as arrays (the client serializes them as repeated
    // keys); page: 0 and archived: false are real filters, not absences.
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', {
      params: {
        customerId: 'c-1',
        progressCategory: ['NOT_STARTED', 'IN_PROGRESS'],
        page: 0,
        archived: false,
      },
    });
  });

  it('getAll drops empty arrays rather than sending an empty key', async () => {
    await workOrderApi.getAll({ progressCategory: [], priority: [] } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', { params: {} });
  });

  it('getAll sends no params when called with nothing', async () => {
    await workOrderApi.getAll();

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', { params: {} });
  });

  it('facets reuses the list filters on its own route', async () => {
    // One call replaced three size=1 probes, so it must accept the same shape.
    await workOrderApi.facets({ customerId: 'c-1', search: '' } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/facets', {
      params: { customerId: 'c-1' },
    });
  });

  it('getByCustomer folds the customer id in ahead of the caller params', async () => {
    await workOrderApi.getByCustomer('c-1', { page: 2 } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', {
      params: { customerId: 'c-1', page: 2 },
    });
  });
});

describe('workOrderApi.getByNumber', () => {
  it('normalizes a number the user typed with the WO- prefix', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'wo-1' } });

    await workOrderApi.getByNumber('WO-1042');

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/by-number/WO-1042');
  });

  it('adds the prefix when the user typed only digits', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'wo-1' } });

    await workOrderApi.getByNumber('1042');

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/by-number/WO-1042');
  });

  it('strips the prefix case-insensitively rather than doubling it', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'wo-1' } });

    await workOrderApi.getByNumber('wo-1042');

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/by-number/WO-1042');
  });
});

describe('workOrderApi lifecycle', () => {
  it('covers getById, create, update and delete', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'wo-1' } });

    await workOrderApi.getById('wo-1');
    await workOrderApi.create({ customerId: 'c-1' } as never);
    await workOrderApi.update('wo-1', { priority: 'HIGH' } as never);
    await workOrderApi.delete('wo-1');

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/wo-1');
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders', { customerId: 'c-1' });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1', { priority: 'HIGH' });
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/wo-1');
  });

  it('cancel carries a reason body; archive and unarchive send none', async () => {
    await workOrderApi.cancel('wo-1', { reason: 'Duplicate' } as never);
    await workOrderApi.archive('wo-1');
    await workOrderApi.unarchive('wo-1');

    // Cancel is a state transition with a reason, not a delete.
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/cancel', {
      reason: 'Duplicate',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/archive');
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/unarchive');
  });
});

describe('workOrderApi work items', () => {
  it('nests work-item writes under the work order', async () => {
    await workOrderApi.createWorkItem('wo-1', { description: 'Replace filter' } as never);
    await workOrderApi.updateWorkItem('wo-1', 'wi-1', { description: 'Replace belt' } as never);
    await workOrderApi.deleteWorkItem('wo-1', 'wi-1');

    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/work-items', {
      description: 'Replace filter',
    });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-orders/wo-1/work-items/wi-1', {
      description: 'Replace belt',
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/wo-1/work-items/wi-1');
  });

  it('routes a status transition to its own dedicated endpoint', async () => {
    // Status is deliberately not part of the general update route.
    await workOrderApi.updateWorkItemStatus('wo-1', 'wi-1', { statusId: 's-2' } as never);

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/work-orders/wo-1/work-items/wi-1/status',
      { statusId: 's-2' }
    );
  });
});
