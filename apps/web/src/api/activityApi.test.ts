import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activityApi } from '@dispatch/api/src/activityApi';
import apiClient from '@dispatch/api/src/client';

vi.mock('@dispatch/api/src/client');

describe('activityApi.listForCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the customer activity stream (ACT-1), joining categories CSV', async () => {
    const page = { content: [], nextCursor: null, hasMore: false };
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });

    const out = await activityApi.listForCustomer('cust-1', {
      cursor: 'c0',
      limit: 50,
      categories: ['STATUS', 'FINANCIAL'],
      classification: 'ALL',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/customers/cust-1/activity', {
      params: { cursor: 'c0', limit: 50, categories: 'STATUS,FINANCIAL', classification: 'ALL' },
    });
    expect(out).toEqual(page);
  });

  it('omits categories when none are given', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], nextCursor: null, hasMore: false } });
    await activityApi.listForCustomer('cust-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/customers/cust-1/activity', {
      params: { cursor: undefined, limit: undefined, categories: undefined, classification: undefined },
    });
  });
});
