import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notesApi } from './notesApi';
import apiClient from './client';

vi.mock('./client');

describe('notesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list hits /work-orders/:id/notes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'n-1' }] });
    const result = await notesApi.list('wo-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/wo-1/notes');
    expect(result).toEqual([{ id: 'n-1' }]);
  });

  it('create POSTs the note body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'n-2', body: 'hi' },
    });
    const result = await notesApi.create('wo-1', { body: 'hi' });
    expect(apiClient.post).toHaveBeenCalledWith('/work-orders/wo-1/notes', {
      body: 'hi',
    });
    expect(result.id).toBe('n-2');
  });

  it('delete hits /work-orders/:id/notes/:noteId', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    await notesApi.delete('wo-1', 'n-9');
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/work-orders/wo-1/notes/n-9',
    );
  });
});
