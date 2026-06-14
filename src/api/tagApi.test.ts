import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tagApi } from './tagApi';
import apiClient from './client';

vi.mock('./client');

describe('tagApi customer assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setForCustomer PUTs the full tagId set (idempotent sync) and returns the result', async () => {
    const result = [{ id: 't1', name: 'VIP', color: 'NEUTRAL' }];
    vi.mocked(apiClient.put).mockResolvedValue({ data: result });

    const out = await tagApi.setForCustomer('cust-1', ['t1', 't2']);

    expect(apiClient.put).toHaveBeenCalledWith('/customers/cust-1/tags', {
      tagIds: ['t1', 't2'],
    });
    expect(out).toEqual(result);
  });

  it('removeFromCustomer DELETEs a single assignment by tag id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    await tagApi.removeFromCustomer('cust-1', 'tag-9');

    expect(apiClient.delete).toHaveBeenCalledWith('/customers/cust-1/tags/tag-9');
  });
});
