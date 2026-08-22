import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditApi } from './auditApi';
import apiClient from './client';

vi.mock('./client');

const mockLogs = [
  {
    id: 'a-1',
    tenantId: 't-1',
    userId: 'u-1',
    userEmail: 'x@y',
    userName: 'X',
    entityType: 'Customer',
    entityId: 'c-1',
    action: 'CREATE' as const,
    timestamp: '2026-05-17T10:00:00Z',
  },
];

describe('auditApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockLogs });
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });
  });

  it('getEntityHistory hits /audit/:entityType/:entityId', async () => {
    const result = await auditApi.getEntityHistory('Customer', 'c-1');
    expect(apiClient.get).toHaveBeenCalledWith('/audit/Customer/c-1');
    expect(result).toBe(mockLogs);
  });

  it('getUserHistory hits /audit/user/:userId', async () => {
    await auditApi.getUserHistory('u-42');
    expect(apiClient.get).toHaveBeenCalledWith('/audit/user/u-42');
  });

  it('getRecentHistory passes the default limit of 50', async () => {
    await auditApi.getRecentHistory();
    expect(apiClient.get).toHaveBeenCalledWith('/audit/recent', {
      params: { limit: 50 },
    });
  });

  it('getRecentHistory forwards a custom limit', async () => {
    await auditApi.getRecentHistory(10);
    expect(apiClient.get).toHaveBeenCalledWith('/audit/recent', {
      params: { limit: 10 },
    });
  });

  it('enrichLatestSignIn POSTs to /audit/sign-ins/enrich-latest', async () => {
    await auditApi.enrichLatestSignIn();
    expect(apiClient.post).toHaveBeenCalledWith('/audit/sign-ins/enrich-latest');
  });
});
