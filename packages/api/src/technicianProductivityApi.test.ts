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
  });

  it('getCreditedInvoices pages one tech, defaulting to the first 25', async () => {
    await technicianProductivityApi.getCreditedInvoices('u-1');
    expect(apiClient.get).toHaveBeenCalledWith('/work-orders/technician-productivity/u-1/invoices', {
      params: { page: 0, size: 25 },
    });
    await technicianProductivityApi.getCreditedInvoices('u-1', { page: 2 });
    expect(apiClient.get).toHaveBeenLastCalledWith('/work-orders/technician-productivity/u-1/invoices', {
      params: { page: 2, size: 25 },
    });
  });
});
