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

describe('tagApi scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAll passes scope as a query param', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await tagApi.getAll({ scope: 'PAYER' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/customers/tags',
      expect.objectContaining({ params: expect.objectContaining({ scope: 'PAYER' }) })
    );
  });

  it('getAll omits scope when not provided', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await tagApi.getAll();

    const config = vi.mocked(apiClient.get).mock.calls[0][1] as { params: Record<string, unknown> };
    expect(config.params).not.toHaveProperty('scope');
  });

  it('create includes scope in the POST body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 't1' } });

    await tagApi.create({ name: 'EDI intake', color: 'INFO', scope: 'PAYER' });

    expect(apiClient.post).toHaveBeenCalledWith('/customers/tags', {
      name: 'EDI intake',
      color: 'INFO',
      scope: 'PAYER',
    });
  });
});
