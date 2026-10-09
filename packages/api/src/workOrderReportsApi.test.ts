import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workOrderReportsApi } from './workOrderReportsApi';
import apiClient from './client';

vi.mock('./client');

describe('workOrderReportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
  });

  it('jobsCompleted sends the range and grouping', async () => {
    await workOrderReportsApi.jobsCompleted({ from: '2026-09-01', to: '2026-09-30', groupBy: 'division', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/reports/jobs-completed', {
      params: { from: '2026-09-01', to: '2026-09-30', groupBy: 'division', regionIds: ['r1'] },
    });
  });

  it('callbacks and its list drop an empty scope', async () => {
    await workOrderReportsApi.callbacks({ from: '2026-09-01', to: '2026-09-30', compare: 'none', regionIds: [] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/reports/callbacks', {
      params: { from: '2026-09-01', to: '2026-09-30', compare: 'none' },
    });
    await workOrderReportsApi.callbackList({ from: '2026-09-01', to: '2026-09-30', technicianId: 'u1', size: 50 });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/reports/callbacks/list', {
      params: { from: '2026-09-01', to: '2026-09-30', technicianId: 'u1', size: 50 },
    });
  });
});
