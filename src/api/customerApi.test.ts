import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customerApi } from './customerApi';
import apiClient from './client';

vi.mock('./client');

describe('customerApi.getPayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 0, totalPages: 0 } });
  });

  it('GETs /customers/payers with a 1-indexed page (no -1) and omits sort by default', async () => {
    await customerApi.getPayers({ page: 2, limit: 50, search: 'acme' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 2, limit: 50, search: 'acme' },
    });
  });

  it('defaults page to 1 and passes sort through when provided', async () => {
    await customerApi.getPayers({ sort: 'lifetimePaid,desc' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 1, sort: 'lifetimePaid,desc' },
    });
  });
});
