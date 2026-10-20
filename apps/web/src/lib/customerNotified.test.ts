import { describe, it, expect } from 'vitest';
import type { NotificationLogDto } from '../api/setup';
import { customerEverNotified, customerNotifiedAt } from './customerNotified';

const log = (over: Partial<NotificationLogDto>): NotificationLogDto => ({
  id: 'n',
  notificationId: 'x',
  notificationTypeId: 'x',
  notificationTypeName: 'T',
  channel: 'SMS',
  recipientName: 'R',
  status: 'SENT',
  entityType: 'DISPATCH',
  entityId: 'd1',
  audience: 'CUSTOMER',
  createdAt: '2026-03-20T07:00:00Z',
  retryCount: 0,
  ...over,
});

describe('customerNotifiedAt', () => {
  it('counts every notice when the window never changed', () => {
    expect(
      customerNotifiedAt(
        [log({ sentAt: '2026-03-20T08:00:00Z' }), log({ sentAt: '2026-03-20T07:30:00Z' })],
        null,
      ),
    ).toBe('2026-03-20T07:30:00Z');
  });

  // A notice about Friday says nothing about Monday.
  it('ignores notices sent before the window last changed', () => {
    expect(customerNotifiedAt([log({ sentAt: '2026-03-20T07:30:00Z' })], '2026-03-20T09:00:00Z')).toBeNull();
  });

  it('takes the earliest notice AFTER the change', () => {
    expect(
      customerNotifiedAt(
        [
          log({ sentAt: '2026-03-20T07:30:00Z' }),
          log({ sentAt: '2026-03-20T10:00:00Z' }),
          log({ sentAt: '2026-03-20T09:05:00Z' }),
        ],
        '2026-03-20T09:00:00Z',
      ),
    ).toBe('2026-03-20T09:05:00Z');
  });

  it('only counts customer notices that actually went out', () => {
    expect(
      customerNotifiedAt(
        [log({ audience: 'TECH' }), log({ status: 'FAILED' }), log({ status: 'PENDING' })],
        null,
      ),
    ).toBeNull();
  });

  it('falls back to createdAt when a log has no sentAt', () => {
    expect(customerNotifiedAt([log({ createdAt: '2026-03-20T10:00:00Z' })], '2026-03-20T09:00:00Z')).toBe(
      '2026-03-20T10:00:00Z',
    );
  });
});

describe('customerEverNotified', () => {
  it('is any sent customer notice, about any window', () => {
    expect(customerEverNotified([log({ sentAt: '2026-03-01T00:00:00Z' })])).toBe(true);
    expect(customerEverNotified([log({ audience: 'TECH' })])).toBe(false);
  });
});
