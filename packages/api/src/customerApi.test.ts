import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customerApi } from './customerApi';
import apiClient from './client';

vi.mock('./client');

describe('customerApi.getPayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 0, totalPages: 0 } });
  });

  it('GETs /customers/payers converting the 1-indexed UI page to 0-indexed and omits sort by default', async () => {
    await customerApi.getPayers({ page: 2, size: 50, search: 'acme' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 1, size: 50, search: 'acme' },
    });
  });

  it('defaults page to 0 and passes sort through when provided', async () => {
    await customerApi.getPayers({ sort: 'lifetimePaid,desc' });
    expect(apiClient.get).toHaveBeenCalledWith('/customers/payers', {
      params: { page: 0, sort: 'lifetimePaid,desc' },
    });
  });
});
