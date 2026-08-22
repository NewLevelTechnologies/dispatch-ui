import { describe, it, expect, vi, beforeEach } from 'vitest';
import { approvalsApi } from './approvalsApi';
import apiClient from './client';

vi.mock('./client');

describe('approvalsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPage', () => {
    it('flattens scalar status into a comma-less query param', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 },
      });
      await approvalsApi.listPage({ status: 'PENDING' });
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals', {
        params: { status: 'PENDING' },
      });
    });

    it('joins an array status with commas', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 },
      });
      await approvalsApi.listPage({ status: ['APPROVED', 'REJECTED'] });
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals', {
        params: { status: 'APPROVED,REJECTED' },
      });
    });

    it('passes assignedToMe, requestedByMe, workOrderId, and paging params through', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 },
      });
      await approvalsApi.listPage({
        assignedToMe: true,
        requestedByMe: true,
        workOrderId: 'wo-1',
        page: 2,
        size: 25,
      });
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals', {
        params: {
          assignedToMe: true,
          requestedByMe: true,
          workOrderId: 'wo-1',
          page: 2,
          size: 25,
        },
      });
    });

    it('omits the params object entirely when called without arguments', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 },
      });
      await approvalsApi.listPage();
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals', {
        params: undefined,
      });
    });
  });

  describe('list', () => {
    it('returns just the content array', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          content: [{ id: 'a-1' }, { id: 'a-2' }],
          totalElements: 2,
          totalPages: 1,
          number: 0,
          size: 50,
        },
      });
      const result = await approvalsApi.list();
      expect(result).toEqual([{ id: 'a-1' }, { id: 'a-2' }]);
    });
  });

  describe('getById', () => {
    it('hits the singular approval endpoint', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { id: 'a-9' } });
      const result = await approvalsApi.getById('a-9');
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals/a-9');
      expect(result.id).toBe('a-9');
    });
  });

  describe('getCount', () => {
    it('extracts pendingForMe from the envelope', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { pendingForMe: 7, recentlyResolvedMine: 0 },
      });
      const count = await approvalsApi.getCount({ assignedToMe: true });
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals/count', {
        params: { assignedToMe: true },
      });
      expect(count).toBe(7);
    });
  });

  describe('getBellSummary', () => {
    it('returns the full envelope shape', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { pendingForMe: 3, recentlyResolvedMine: 2 },
      });
      const result = await approvalsApi.getBellSummary();
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/approvals/count');
      expect(result).toEqual({ pendingForMe: 3, recentlyResolvedMine: 2 });
    });
  });

  describe('markSeen', () => {
    it('POSTs to the mark-seen endpoint with no body', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });
      await approvalsApi.markSeen('a-1');
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/approvals/a-1/mark-seen');
    });
  });

  describe('approve', () => {
    it('POSTs an empty body by default', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'a-1', status: 'APPROVED' } });
      const result = await approvalsApi.approve('a-1');
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/approvals/a-1/approve', {});
      expect(result.status).toBe('APPROVED');
    });

    it('passes a typed reason through when provided', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'a-1', status: 'APPROVED' } });
      await approvalsApi.approve('a-1', { reason: 'looks good' });
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/approvals/a-1/approve', {
        reason: 'looks good',
      });
    });
  });

  describe('reject', () => {
    it('POSTs the required reason', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'a-1', status: 'REJECTED' } });
      const result = await approvalsApi.reject('a-1', { reason: 'missing docs' });
      expect(apiClient.post).toHaveBeenCalledWith('/work-orders/approvals/a-1/reject', {
        reason: 'missing docs',
      });
      expect(result.status).toBe('REJECTED');
    });
  });
});
