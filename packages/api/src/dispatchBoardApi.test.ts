import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchBoardApi } from './dispatchBoardApi';
import apiClient from './client';

vi.mock('./client');

describe('dispatchBoardApi.getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const summary = {
    asOf: '2026-09-30',
    timeZone: 'America/New_York',
    days: [{ date: '2026-09-30', jobCount: 38, arrivedCount: 20, onTimeCount: 18 }],
    arrivalWindow: { arrivedCount: 140, onTimeCount: 129, onTimeRate: 0.921 },
  };

  it('GETs the board summary, forwarding the region scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: summary });
    const out = await dispatchBoardApi.getSummary({ regionIds: ['r-1'] });
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/board/summary', { params: { regionIds: ['r-1'] } });
    expect(out).toEqual(summary);
  });

  it('omits the region scope for the whole company', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: summary });
    await dispatchBoardApi.getSummary();
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/board/summary', { params: {} });
  });
});
