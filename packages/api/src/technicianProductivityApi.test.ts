import { describe, it, expect, vi, beforeEach } from 'vitest';
import { technicianProductivityApi } from './technicianProductivityApi';
import apiClient from './client';

vi.mock('./client');

describe('technicianProductivityApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} });
  });

  it('get GETs the month-to-date card', async () => {
    await technicianProductivityApi.get();
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/technician-productivity');
    await technicianProductivityApi.get({ period: '2026-Q2' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity', {
      params: { period: '2026-Q2' },
    });
  });

  it('getCreditedInvoices pages one tech, defaulting to the first 25', async () => {
    await technicianProductivityApi.getCreditedInvoices('u-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/technician-productivity/u-1/invoices', {
      params: { page: 0, size: 25 },
    });
    await technicianProductivityApi.getCreditedInvoices('u-1', { period: '2026-08', page: 2 });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity/u-1/invoices', {
      params: { period: '2026-08', page: 2, size: 25 },
    });
  });

  it('getChargedCallbacks pages one tech’s callbacks for the period', async () => {
    await technicianProductivityApi.getChargedCallbacks('u-1', { period: '2026-Q3' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity/u-1/callbacks', {
      params: { period: '2026-Q3', page: 0, size: 25 },
    });
  });
});
