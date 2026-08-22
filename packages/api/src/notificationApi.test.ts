import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationApi } from './notificationApi';
import apiClient from './client';

vi.mock('./client');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [] } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'p-1' } });
  vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 'p-1' } });
  vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
});

describe('notificationApi.getNotificationLogs', () => {
  it('sends a bare route with an empty query when given no filters', async () => {
    // This endpoint builds its own URLSearchParams rather than using the
    // params option, so "no filters" still leaves the trailing "?".
    await notificationApi.getNotificationLogs();

    expect(apiClient.get).toHaveBeenCalledWith('/notification-logs?');
  });

  it('serializes every supported filter in declaration order', async () => {
    await notificationApi.getNotificationLogs({
      customerId: 'c-1',
      entityType: 'WORK_ORDER',
      entityId: 'wo-1',
      status: 'SENT',
      channel: 'SMS',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      page: 2,
      size: 50,
      sort: 'createdAt,desc',
    } as never);

    expect(apiClient.get).toHaveBeenCalledWith(
      '/notification-logs?customerId=c-1&entityType=WORK_ORDER&entityId=wo-1&status=SENT' +
        '&channel=SMS&startDate=2026-01-01&endDate=2026-01-31&page=2&size=50&sort=createdAt%2Cdesc'
    );
  });

  it('keeps page 0 and size 0, which a truthiness check would have dropped', async () => {
    // page/size are guarded on !== undefined precisely so the first page is
    // requestable.
    await notificationApi.getNotificationLogs({ page: 0, size: 0 } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/notification-logs?page=0&size=0');
  });

  it('omits empty-string filters', async () => {
    await notificationApi.getNotificationLogs({ customerId: '', status: 'FAILED' } as never);

    expect(apiClient.get).toHaveBeenCalledWith('/notification-logs?status=FAILED');
  });
});

describe('notificationApi preferences', () => {
  it('reads customer-level and contact-level preferences from nested routes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    await notificationApi.getNotificationLog('log-1');
    await notificationApi.getCustomerPreferences('c-1');
    await notificationApi.getContactPreferences('c-1', 'ct-1');

    expect(apiClient.get).toHaveBeenCalledWith('/notification-logs/log-1');
    expect(apiClient.get).toHaveBeenCalledWith('/notification-preferences/customers/c-1');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/notification-preferences/customers/c-1/contacts/ct-1'
    );
  });

  it('writes preferences against the flat collection, not the nested read route', async () => {
    await notificationApi.createPreference({ customerId: 'c-1', channel: 'SMS' } as never);
    await notificationApi.updatePreference('p-1', { enabled: false } as never);
    await notificationApi.deletePreference('p-1');

    expect(apiClient.post).toHaveBeenCalledWith('/notification-preferences', {
      customerId: 'c-1',
      channel: 'SMS',
    });
    expect(apiClient.put).toHaveBeenCalledWith('/notification-preferences/p-1', {
      enabled: false,
    });
    expect(apiClient.delete).toHaveBeenCalledWith('/notification-preferences/p-1');
  });
});
