import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workOrdersListQueryOptions } from './workOrdersListQuery';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 0 } });
});

describe('workOrdersListQueryOptions', () => {
  it('builds a key that includes every scope so two readers share one cache entry', async () => {
    const opts = workOrdersListQueryOptions({ customerId: 'c-1' });

    // The count badge and the rendered list must produce an identical key —
    // that is the whole point of sharing these options.
    expect(opts.queryKey).toEqual([
      'work-orders-list',
      { customerId: 'c-1', serviceLocationId: undefined, equipmentId: undefined, pageSize: 25 },
    ]);
  });

  it('defaults pageSize to 25 and reflects an override in the key', async () => {
    const opts = workOrdersListQueryOptions({ equipmentId: 'eq-1', pageSize: 5 });

    expect(opts.queryKey[1]).toMatchObject({ equipmentId: 'eq-1', pageSize: 5 });
  });

  it('queryFn asks for the newest scheduled work first, scoped and sized', async () => {
    const opts = workOrdersListQueryOptions({ serviceLocationId: 'loc-1', pageSize: 10 });

    await opts.queryFn();

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', {
      params: { serviceLocationId: 'loc-1', size: 10, sort: 'scheduledDate,desc' },
    });
  });

  it('collapses empty-string scopes to undefined so they are not sent', async () => {
    const opts = workOrdersListQueryOptions({ customerId: '', equipmentId: 'eq-1' });

    await opts.queryFn();

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders', {
      params: { equipmentId: 'eq-1', size: 25, sort: 'scheduledDate,desc' },
    });
  });

  it('stays disabled until at least one scope is present', async () => {
    // Without a scope this would list every work order in the tenant, so the
    // query must not run at all.
    expect(workOrdersListQueryOptions({}).enabled).toBe(false);
    expect(workOrdersListQueryOptions({ customerId: '' }).enabled).toBe(false);
  });

  it('enables on any one of the three scopes', async () => {
    expect(workOrdersListQueryOptions({ customerId: 'c-1' }).enabled).toBe(true);
    expect(workOrdersListQueryOptions({ serviceLocationId: 'loc-1' }).enabled).toBe(true);
    expect(workOrdersListQueryOptions({ equipmentId: 'eq-1' }).enabled).toBe(true);
  });
});
