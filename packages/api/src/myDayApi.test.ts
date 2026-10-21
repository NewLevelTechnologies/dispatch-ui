import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myDayApi } from './myDayApi';
import apiClient from './client';

vi.mock('./client');

describe('myDayApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for today with no date, leaving the tenant day to the server', async () => {
    const day = { date: '2026-10-21', timeZone: 'America/Phoenix', stops: [] };
    vi.mocked(apiClient.get).mockResolvedValue({ data: day });

    expect(await myDayApi.getDay()).toEqual(day);
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/my-day', { params: undefined });
  });

  it('passes a tenant-local date through', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { date: '2026-10-22', timeZone: 'UTC', stops: [] } });

    await myDayApi.getDay('2026-10-22');

    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/my-day', { params: { date: '2026-10-22' } });
  });
});
