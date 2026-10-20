import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arrivalReportApi } from './arrivalReportApi';
import apiClient from './client';

vi.mock('./client');

describe('arrivalReportApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
  });

  it('get sends the range, grouping and scope', async () => {
    await arrivalReportApi.get({ from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'technician', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/reports/arrivals', {
      params: { from: '2026-09-01', to: '2026-09-30', compare: 'previousPeriod', groupBy: 'technician', regionIds: ['r1'] },
    });
  });

  it('late leaves out an empty scope', async () => {
    await arrivalReportApi.late({ from: '2026-09-01', to: '2026-09-30', regionIds: [], technicianId: 'u1', page: 0, size: 25 });
    expect(apiClient.get).toHaveBeenCalledWith('/scheduling/reports/arrivals/late', {
      params: { from: '2026-09-01', to: '2026-09-30', technicianId: 'u1', page: 0, size: 25 },
    });
  });
});
