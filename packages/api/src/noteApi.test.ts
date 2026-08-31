import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noteApi } from './noteApi';
import apiClient from './client';

vi.mock('./client');

describe('noteApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listForServiceLocation hits /service-locations/:id/notes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'n-1' }] });
    const result = await noteApi.listForServiceLocation('loc-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-locations/loc-1/notes');
    expect(result).toEqual([{ id: 'n-1' }]);
  });

  it('createForServiceLocation POSTs body + pinned', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'n-2', body: 'roof key', pinned: true } });
    const result = await noteApi.createForServiceLocation('loc-1', { body: 'roof key', pinned: true });
    expect(apiClient.post).toHaveBeenCalledWith('/service-locations/loc-1/notes', {
      body: 'roof key',
      pinned: true,
    });
    expect(result.id).toBe('n-2');
  });

  it('listForCustomer hits /customers/:id/notes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    await noteApi.listForCustomer('cust-1');
    expect(apiClient.get).toHaveBeenCalledWith('/customers/cust-1/notes');
  });

  it('createForCustomer POSTs to /customers/:id/notes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'n-3' } });
    await noteApi.createForCustomer('cust-1', { body: 'net 30' });
    expect(apiClient.post).toHaveBeenCalledWith('/customers/cust-1/notes', { body: 'net 30' });
  });

  it('update PATCHes the bare /notes/:id (partial — pinned only)', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'n-9', pinned: true } });
    const result = await noteApi.update('n-9', { pinned: true });
    expect(apiClient.patch).toHaveBeenCalledWith('/notes/n-9', { pinned: true });
    expect(result.pinned).toBe(true);
  });

  it('update PATCHes body + pinned together', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'n-9' } });
    await noteApi.update('n-9', { body: 'edited', pinned: false });
    expect(apiClient.patch).toHaveBeenCalledWith('/notes/n-9', { body: 'edited', pinned: false });
  });

  it('delete hits the bare /notes/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    await noteApi.delete('n-9');
    expect(apiClient.delete).toHaveBeenCalledWith('/notes/n-9');
  });
});
