import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arrivalFactApi } from './arrivalFactApi';
import apiClient from './client';

vi.mock('./client');

describe('arrivalFactApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  });

  it('listForServiceLocation GETs the location-scoped facts', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ id: 'f-1' }] } as never);
    const r = await arrivalFactApi.listForServiceLocation('sl-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/sl-1/arrival-facts');
    expect(r).toEqual([{ id: 'f-1' }]);
  });

  it('createForServiceLocation POSTs the request under the location', async () => {
    await arrivalFactApi.createForServiceLocation('sl-1', { label: 'Gate code', value: '1234', mono: true });
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/sl-1/arrival-facts', {
      label: 'Gate code',
      value: '1234',
      mono: true,
    });
  });

  it('update PATCHes the fact-scoped path (no location id)', async () => {
    await arrivalFactApi.update('f-1', { value: '9999' });
    expect(apiClient.patch).toHaveBeenCalledWith('/arrival-facts/f-1', { value: '9999' });
  });

  it('delete DELETEs the fact', async () => {
    await arrivalFactApi.delete('f-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/arrival-facts/f-1');
  });

  it('suggestedLabels GETs the tenant label seed', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: ['Gate code', 'Lockbox'] } as never);
    const r = await arrivalFactApi.suggestedLabels();
    expect(apiClient.get).toHaveBeenCalledWith('/arrival-facts/suggested-labels');
    expect(r).toEqual(['Gate code', 'Lockbox']);
  });
});
