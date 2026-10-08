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
    await technicianProductivityApi.get({ from: '2026-09-08', to: '2026-10-04', compare: 'previousPeriod', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity', {
      params: { from: '2026-09-08', to: '2026-10-04', regionIds: ['r1'], compare: 'previousPeriod' },
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

  it('passes the card’s regions to the card and both drill-ins', async () => {
    await technicianProductivityApi.get({ regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity', {
      params: { regionIds: ['r1'] },
    });
    await technicianProductivityApi.getCreditedInvoices('u-1', { regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity/u-1/invoices', {
      params: { regionIds: ['r1'], page: 0, size: 25 },
    });
    await technicianProductivityApi.getChargedCallbacks('u-1', { period: '2026-Q3', regionIds: ['r1'] });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity/u-1/callbacks', {
      params: { period: '2026-Q3', regionIds: ['r1'], page: 0, size: 25 },
    });
  });
});
